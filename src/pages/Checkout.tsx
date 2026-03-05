import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { BackArrow } from '../components/BackArrow';
import { AddressSuggest } from '../components/AddressSuggest';
import { generateOrderNumber } from '../lib/orderNumber';
import { executePayment } from '../lib/paymentGateway';
import { supabase } from '../lib/supabase';

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

/** 배송 폼 필드 키 (개인정보 도착ка와 동일, profileEdit 저장 시 이 키만 덮어씀) */
const DELIVERY_KEYS = [
  'name',
  'phone',
  'fioLast',
  'fioFirst',
  'fioMiddle',
  'cityRegion',
  'streetHouse',
  'apartmentOffice',
  'postcode',
  'inn',
  'passportSeries',
  'passportNumber',
] as const;

type DeliveryForm = Record<(typeof DELIVERY_KEYS)[number], string>;

function loadDeliveryFromStorage(): Record<string, string> {
  try {
    const raw = localStorage.getItem('profileEdit');
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

/** 배송 폼 초기값 — profile + profileEdit에서만 채움. ФИО는 항상 대문자로 */
function buildInitialDeliveryForm(
  profile: { name: string | null; phone: string | null } | null,
  storage: Record<string, string>
): DeliveryForm {
  const o: Record<string, string> = {};
  DELIVERY_KEYS.forEach((k) => {
    if (k === 'name' || k === 'phone') {
      o[k] = profile?.[k]?.trim() ?? storage?.[k] ?? '';
    } else {
      o[k] = storage?.[k]?.trim() ?? '';
    }
  });
  if (o.fioLast) o.fioLast = o.fioLast.replace(/[^A-Za-z\s-']/g, '').toUpperCase();
  if (o.fioFirst) o.fioFirst = o.fioFirst.replace(/[^A-Za-z\s-']/g, '').toUpperCase();
  if (o.fioMiddle) o.fioMiddle = o.fioMiddle.replace(/[^A-Za-z\s-']/g, '').toUpperCase();
  return o as DeliveryForm;
}

/** 결제 시 포인트 최대 사용 한도 (점) — 1점 = 1 руб */
const MAX_POINTS_TO_USE = 1000;
/** 포인트 사용 상한: 찐 판매가(total)의 10%를 넘을 수 없음 */
const POINTS_MAX_PERCENT_OF_TOTAL = 0.1;

export const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoggedIn, userId, initialized } = useAuth();
  /** 가짜(테스트) 주문 여부. URL에 ?test=1 있으면 true → is_test로 저장해 나중에 구분·삭제 가능 */
  const isTestOrder = searchParams.get('test') === '1';
  const { items, total, totalCount } = useCart();
  const [profile, setProfile] = useState<{ name: string | null; phone: string | null } | null>(null);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [membershipCoupons, setMembershipCoupons] = useState<
    { id: string; amount: number; expires_at: string; used_at: string | null }[]
  >([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'delivery' | 'payment'>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<string>('card');
  const [pointsToUse, setPointsToUse] = useState<number>(0);
  const [confirming, setConfirming] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState<DeliveryForm>(() =>
    buildInitialDeliveryForm(null, {})
  );
  const [saveDeliveryAsDefault, setSaveDeliveryAsDefault] = useState(true);
  const [noPatronymic, setNoPatronymic] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const deliveryFormInitialized = useRef(false);
  /** CS 방어: 결제 단계에서 가격 본 적 한 번만 로그 */
  const paymentStepViewedLoggedRef = useRef(false);
  /** 결제 시점 클라이언트 IP (결제 단계 진입 시 한 번 조회) */
  const clientIpRef = useRef<string | null>(null);

  const hasPhone = !!deliveryForm.phone?.trim();
  const hasCity = !!deliveryForm.cityRegion?.trim();
  const hasStreet = !!deliveryForm.streetHouse?.trim();
  const hasPostcode = !!deliveryForm.postcode?.trim();
  const hasFioLast = !!deliveryForm.fioLast?.trim();
  const hasFioFirst = !!deliveryForm.fioFirst?.trim();
  const hasInn = !!deliveryForm.inn?.trim();
  const hasPassport = !!deliveryForm.passportSeries?.trim() && !!deliveryForm.passportNumber?.trim();
  const deliveryComplete =
    hasPhone &&
    hasCity &&
    hasStreet &&
    hasPostcode &&
    hasFioLast &&
    hasFioFirst;
  const canProceedDelivery = deliveryComplete && hasInn && hasPassport;

  const loadProfile = useCallback(() => {
    if (!supabase || !userId) {
      setProfile(null);
      setUserPoints(0);
      setMembershipCoupons([]);
      setLoading(false);
      return;
    }
    supabase
      .from('profiles')
      .select('name, phone, points')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        setProfile(
          data
            ? { name: data.name ?? null, phone: data.phone ?? null }
            : null
        );
        setUserPoints(Math.max(0, Number(data?.points ?? 0)));
      })
      .catch(() => {
        setProfile(null);
        setUserPoints(0);
      });

    supabase
      .from('membership_coupons')
      .select('id, amount, expires_at, used_at')
      .eq('user_id', userId)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })
      .then(({ data }) => {
        setMembershipCoupons(
          (data as { id: string; amount: number; expires_at: string; used_at: string | null }[]) ?? [],
        );
        setSelectedCouponId(null);
      })
      .catch(() => {
        setMembershipCoupons([]);
        setSelectedCouponId(null);
      })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // 프로필·storage 로드 후 배송 폼 초기값 채움 (한 번만 덮어쓰고, 프로필이 늦게 로드되면 한 번 더 반영). 부칭 없음 체크는 개인정보에서 저장한 값과 동일하게.
  useEffect(() => {
    if (loading) return;
    if (deliveryFormInitialized.current && profile != null) return;
    const storage = loadDeliveryFromStorage();
    const next = buildInitialDeliveryForm(profile, storage);
    setDeliveryForm(next);
    setNoPatronymic(!(next.fioMiddle ?? '').trim());
    const parts = [next.cityRegion, next.streetHouse, next.apartmentOffice, next.postcode].filter(Boolean);
    if (parts.length) setAddressQuery(parts.join(', '));
    if (profile != null) deliveryFormInitialized.current = true;
  }, [loading, profile]);

  const setDeliveryField = useCallback((key: keyof DeliveryForm, value: string) => {
    setDeliveryForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** 결제 확정 시 체크 시 개인정보(도착카)만 덮어쓰기. 프로필 이름은 건드리지 않음 — 개인정보설정에서만 변경. 훅은 early return 위에 둬야 함 */
  const saveDeliveryToProfile = useCallback(async (): Promise<void> => {
    if (!saveDeliveryAsDefault) return;

    const nameFromFio = [deliveryForm.fioLast, deliveryForm.fioFirst, deliveryForm.fioMiddle]
      .filter(Boolean)
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(' ');

    if (supabase && userId) {
      try {
        await supabase
          .from('profiles')
          .update({ phone: deliveryForm.phone?.trim() || null })
          .eq('id', userId);
      } catch (e) {
        console.warn('[Checkout] profiles phone update failed', e);
        window.alert('Данные телефона не сохранены в профиль. Заказ оформлен.');
      }
    }

    try {
      let existing: Record<string, unknown> = {};
      try {
        const raw = localStorage.getItem('profileEdit');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = { ...parsed };
        }
      } catch {
        // ignore
      }
      DELIVERY_KEYS.forEach((k) => {
        existing[k] = k === 'name' ? nameFromFio : (deliveryForm[k] ?? '');
      });
      localStorage.setItem('profileEdit', JSON.stringify(existing));
    } catch (e) {
      console.warn('[Checkout] profileEdit localStorage failed', e);
      window.alert('Данные доставки не сохранены в браузере. Заказ оформлен.');
    }
  }, [saveDeliveryAsDefault, deliveryForm, userId]);

  // 결제 단계 포인트 상한 맞춤 — 훅은 early return 위에 두어 호출 순서 고정
  useEffect(() => {
    if (step !== 'payment') return;
    const maxByPercent = Math.floor(total * POINTS_MAX_PERCENT_OF_TOTAL);
    const effMax = Math.min(userPoints, MAX_POINTS_TO_USE, total, maxByPercent);
    setPointsToUse((prev) => (prev > effMax ? effMax : prev));
  }, [step, total, userPoints]);

  // CS 방어: 결제 단계 진입 시 "가격 확인" 로그 1회 + 클라이언트 IP 조회
  useEffect(() => {
    if (step === 'delivery') {
      paymentStepViewedLoggedRef.current = false;
      return;
    }
    if (step !== 'payment' || !supabase || !userId || paymentStepViewedLoggedRef.current) return;
    paymentStepViewedLoggedRef.current = true;
    const maxByPercent = Math.floor(total * POINTS_MAX_PERCENT_OF_TOTAL);
    const effMax = Math.min(userPoints, MAX_POINTS_TO_USE, total, maxByPercent);
    const clamped = Math.min(pointsToUse, effMax, total);
    const finalCents = Math.round((total - clamped) * 100);
    supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        action: 'checkout_price_viewed',
        metadata: {
          total_cents: Math.round(total * 100),
          final_cents: finalCents,
          points_used: clamped,
          items: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
        },
      })
      .then(() => {})
      .catch(() => {});
    // 클라이언트 IP (비동기, 결제 버튼 클릭 시 사용)
    fetch('https://api.ipify.org?format=json')
      .then((r) => r.json())
      .then((d: { ip?: string }) => { clientIpRef.current = d.ip ?? null; })
      .catch(() => {});
  }, [step, total, userPoints, pointsToUse, items, userId]);

  // ——— 아래부터는 early return만 허용. 새 훅(useState/useEffect/useCallback 등) 추가 시 반드시 위쪽에 선언 ———
  if (!initialized || loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-center text-slate-500">Загрузка…</p>
      </main>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (items.length === 0) {
    return <Navigate to="/cart" replace />;
  }

  const originalTotal = items.reduce(
    (sum, it) =>
      sum +
      (it.originalPrice != null && it.originalPrice > 0
        ? it.originalPrice * it.quantity
        : it.price * it.quantity),
    0
  );
  const benefitAmount = originalTotal - total;

  // 포인트: 최대 1000점, 보유 포인트·주문 금액 초과 불가, 판매가(total)의 10% 초과 불가
  const maxPointsByPercent = Math.floor(total * POINTS_MAX_PERCENT_OF_TOTAL);
  const effectivePointsMax = Math.min(userPoints, MAX_POINTS_TO_USE, total, maxPointsByPercent);
  const clampedPointsToUse = Math.min(pointsToUse, effectivePointsMax, total);
  const selectedCoupon = membershipCoupons.find((c) => c.id === selectedCouponId) ?? null;
  const maxCouponDiscount = Math.max(0, total - clampedPointsToUse);
  const couponDiscount = selectedCoupon ? Math.min(selectedCoupon.amount, maxCouponDiscount) : 0;
  const finalAmount = total - clampedPointsToUse - couponDiscount;

  const handleConfirmOrder = async () => {
    if (!canProceedDelivery && step === 'delivery') return;
    if (step === 'delivery') {
      setStep('payment');
      return;
    }
    setConfirming(true);
    try {
      await saveDeliveryToProfile();

      if (!supabase || !userId) {
        window.alert('Сессия не найдена. Войдите снова.');
        return;
      }

      const snapshotCents = Math.round(finalAmount * 100);
      // 주문 스냅샷: 당시 상품명·가격을 orders.items / snapshot_items에 저장. 관리자가 이후 상품 가격을 바꿔도 과거 주문 금액은 변경되지 않음.
      const snapshotItems = items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price }));
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

      // CS 방어: 결제 버튼 클릭 시점 로그 (타임라인 증거). 실패해도 주문 흐름은 계속
      try {
        const { error: logErr } = await supabase.from('activity_logs').insert({
          user_id: userId,
          action: 'clicked_pay_button',
          metadata: {
            total_cents: Math.round(total * 100),
            final_cents: snapshotCents,
            points_used: clampedPointsToUse,
            items: snapshotItems,
            user_agent: userAgent,
          },
        });
        if (logErr) console.warn('[Checkout] activity_logs insert:', logErr.message);
      } catch (_) {
        // 테이블 없음 등 예외 시에도 주문 진행
      }

      const receiverName = [deliveryForm.fioLast, deliveryForm.fioFirst, deliveryForm.fioMiddle]
        .filter(Boolean)
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(' ');
      const shippingAddress =
        addressQuery.trim() ||
        [deliveryForm.cityRegion, deliveryForm.streetHouse, deliveryForm.apartmentOffice, deliveryForm.postcode]
          .filter(Boolean)
          .map((s) => s?.trim())
          .filter(Boolean)
          .join(', ');

      // 필수값 검사: 하나라도 비어 있으면 orders에 저장하지 않음
      const phone = deliveryForm.phone?.trim() ?? '';
      const inn = deliveryForm.inn?.trim() ?? '';
      const passportSeries = deliveryForm.passportSeries?.trim() ?? '';
      const passportNumber = deliveryForm.passportNumber?.trim() ?? '';
      if (!receiverName || !phone || !shippingAddress || !inn || !passportSeries || !passportNumber) {
        window.alert('Заполните все обязательные поля: ФИО, телефон, адрес, ИНН, серия и номер паспорта.');
        return;
      }

      // 고객 노출용 주문번호 생성 (알파벳 1자 + 숫자 6자, 예: A123456). order_number 컬럼이 있으면 저장
      const orderNumber = await generateOrderNumber(supabase);
      const orderNumberOpt = (p: Record<string, unknown>) => ({ ...p, order_number: orderNumber });

      // 사용 포인트(코펙): Admin 주문 목록 "사용 포인트" 컬럼 표시용
      const pointsUsedCents = Math.round(clampedPointsToUse * 100);
      const buildPayloads = () => ({
        full: orderNumberOpt({
          user_id: userId,
          total_cents: snapshotCents,
          points_used: pointsUsedCents,
          status: 'pending',
          items: snapshotItems,
          receiver_name: receiverName,
          receiver_phone: phone,
          shipping_address: shippingAddress,
          inn,
          passport_series: passportSeries,
          passport_number: passportNumber,
          snapshot_total_cents: snapshotCents,
          snapshot_items: snapshotItems,
          client_ip: clientIpRef.current,
          user_agent: userAgent || null,
          ...(isTestOrder && { is_test: true }),
        }),
        minimal: orderNumberOpt({
          user_id: userId,
          total_cents: snapshotCents,
          points_used: pointsUsedCents,
          status: 'pending',
          items: snapshotItems,
          receiver_name: receiverName,
          receiver_phone: phone,
          shipping_address: shippingAddress,
          inn,
          passport_series: passportSeries,
          passport_number: passportNumber,
          ...(isTestOrder && { is_test: true }),
        }),
        minimalNoTest: orderNumberOpt({
          user_id: userId,
          total_cents: snapshotCents,
          points_used: pointsUsedCents,
          status: 'pending',
          items: snapshotItems,
          receiver_name: receiverName,
          receiver_phone: phone,
          shipping_address: shippingAddress,
          inn,
          passport_series: passportSeries,
          passport_number: passportNumber,
        }),
        absoluteMinimal: orderNumberOpt({
          user_id: userId,
          total_cents: snapshotCents,
          points_used: pointsUsedCents,
          status: 'pending',
        }),
      });

      const stripOrderNumber = (o: Record<string, unknown>) => {
        const { order_number: _, ...rest } = o;
        return rest;
      };
      const payloadsNoOrderNumber = {
        full: stripOrderNumber(buildPayloads().full as Record<string, unknown>),
        minimal: stripOrderNumber(buildPayloads().minimal as Record<string, unknown>),
        minimalNoTest: stripOrderNumber(buildPayloads().minimalNoTest as Record<string, unknown>),
        absoluteMinimal: stripOrderNumber(buildPayloads().absoluteMinimal as Record<string, unknown>),
      };

      let orderRow: { id: string; order_number?: string | null } | null = null;
      let orderError: { code?: string; message?: string; details?: unknown } | null = null;

      const selectCols = (withOrderNumber: boolean) => (withOrderNumber ? 'id, order_number' : 'id');
      const runInsert = async (withOrderNumber: boolean) => {
        const payloads = withOrderNumber ? buildPayloads() : payloadsNoOrderNumber;
        const sel = selectCols(withOrderNumber);
        const { data: fullData, error: fullError } = await supabase.from('orders').insert(payloads.full).select(sel).single();
        if (!fullError) return fullData as { id: string; order_number?: string | null };
        const { data: minData, error: minError } = await supabase.from('orders').insert(payloads.minimal).select(sel).single();
        if (!minError) return minData as { id: string; order_number?: string | null };
        const { data: minNoTestData, error: minNoTestError } = await supabase.from('orders').insert(payloads.minimalNoTest).select(sel).single();
        if (!minNoTestError) return minNoTestData as { id: string; order_number?: string | null };
        const { data: absData, error: absError } = await supabase.from('orders').insert(payloads.absoluteMinimal).select(sel).single();
        if (absError) {
          orderError = absError;
          return null;
        }
        return absData as { id: string; order_number?: string | null };
      };

      orderRow = await runInsert(true);
      if (!orderRow && orderError && (orderError.message?.includes('order_number') || orderError.message?.includes('column'))) {
        orderError = null;
        orderRow = await runInsert(false);
      }

      if (orderError || !orderRow) {
        if (orderError) {
          console.error('[Checkout] order insert 실패 — 원인:', orderError.message, orderError.code, orderError.details);
          await supabase.from('payment_logs').insert({
            user_id: userId,
            error_code: orderError.code ?? null,
            error_message: orderError.message ?? null,
            metadata: { context: 'order_insert', details: orderError.details },
          }).then(() => {});
        }
        const errHint = orderError?.message ? `\n(오류: ${orderError.message})` : '';
        window.alert('Не удалось оформить заказ. Попробуйте ещё раз.' + errHint);
        return;
      }

      const orderId = orderRow.id;
      const orderNumberForDisplay = orderRow.order_number ?? orderRow.id.slice(0, 8);

      // 2) 실제 결제 승인 (PG 미연동 시 즉시 성공. PG 연동 시 paymentGateway.ts만 교체)
      const paymentResult = await executePayment({
        orderId,
        totalCents: snapshotCents,
      });

      if (!paymentResult.success) {
        await supabase
          .from('orders')
          .update({ status: 'failed' })
          .eq('id', orderId)
          .eq('user_id', userId);
        await supabase.from('payment_logs').insert({
          user_id: userId,
          order_id: orderId,
          error_code: paymentResult.errorCode ?? null,
          error_message: paymentResult.errorMessage ?? null,
          metadata: { context: 'payment_gateway' },
        });
        window.alert(paymentResult.errorMessage || 'Ошибка оплаты. Попробуйте ещё раз.');
        return;
      }

      // 3) 결제 성공: 주문 상태 completed (+ PG 연동 시 external_transaction_id, raw_response)
      const fullUpdate = {
        status: 'completed',
        external_transaction_id: paymentResult.externalTransactionId ?? null,
        raw_response: paymentResult.rawResponse ?? null,
      };
      const { error: updateError } = await supabase
        .from('orders')
        .update(fullUpdate)
        .eq('id', orderId)
        .eq('user_id', userId);

      if (updateError) {
        const { error: statusOnlyError } = await supabase
          .from('orders')
          .update({ status: 'completed' })
          .eq('id', orderId)
          .eq('user_id', userId);
        if (statusOnlyError) {
          console.warn('[Checkout] payment ok but order update failed', statusOnlyError);
          await supabase.from('payment_logs').insert({
            user_id: userId,
            order_id: orderId,
            error_code: statusOnlyError.code ?? null,
            error_message: statusOnlyError.message ?? null,
            metadata: { context: 'payment_success_order_update_failed' },
          }).then(() => {});
          window.alert('Оплата прошла, но запись заказа не обновилась. Проверьте «История заказов». При проблеме обратитесь в поддержку.');
        }
      }

      if (clampedPointsToUse > 0) {
        const { data: current } = await supabase.from('profiles').select('points').eq('id', userId).single();
        const nextPoints = Math.max(0, (current?.points ?? 0) - clampedPointsToUse);
        await supabase.from('profiles').update({ points: nextPoints }).eq('id', userId);
      }

      if (selectedCoupon && couponDiscount > 0) {
        try {
          await supabase
            .from('membership_coupons')
            .update({ used_at: new Date().toISOString(), order_id: orderId })
            .eq('id', selectedCoupon.id)
            .eq('user_id', userId);
        } catch (e) {
          console.warn('[Checkout] membership coupon update failed', e);
        }
      }

      await new Promise((r) => setTimeout(r, 800));
      // 장바구니 이탈 명단에서 제거 (주문 완료했으므로)
      await supabase.from('cart_snapshots').delete().eq('user_id', userId);
      // clearCart는 완료 페이지(CheckoutComplete)에서 함. 여기서 하면 items가 0이 되면서 아래 Navigate to="/cart" 로 빠져서 완료 페이지가 안 보임
      // state와 쿼리 둘 다 전달 — 새로고침 시 state는 사라지므로 쿼리로 주문번호 복구 (orderNumber 우선)
      navigate(`/checkout/complete?orderNumber=${encodeURIComponent(orderNumberForDisplay)}`, {
        state: {
          total: finalAmount,
          totalCount,
          pointsUsed: clampedPointsToUse,
          orderId,
          orderNumber: orderNumberForDisplay,
        },
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.warn('[Checkout] confirm error', e);
      // 예외 발생 시에도 payment_logs에 기록
      if (supabase && userId) {
        supabase
          .from('payment_logs')
          .insert({
            user_id: userId,
            error_message: errMsg,
            metadata: { context: 'confirm_exception' },
          })
          .then(() => {});
      }
      window.alert('Произошла ошибка. Попробуйте ещё раз.\n\n' + errMsg);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="mb-6">
        <Link
          to="/cart"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"
        >
          <BackArrow /> В корзину
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Оформление заказа
      </h1>

      {/* 1. 주문 요약 — 맨 위: 품목별 사진·가격·수량 (읽기 전용) */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Ваш заказ</h2>
        <ul className="space-y-3 border-b border-slate-100 pb-4">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 text-sm">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                {it.imageUrl ? (
                  <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">—</span>
                )}
              </div>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{it.name}</span>
              <div className="flex shrink-0 items-center gap-1.5 tabular-nums">
                {it.originalPrice != null && it.originalPrice > 0 && (
                  <span className="text-slate-500 line-through">{formatPrice(it.originalPrice * it.quantity)}</span>
                )}
                <span className="font-semibold text-slate-900">{formatPrice(it.price * it.quantity)}</span>
              </div>
              <span className="shrink-0 text-slate-600">× {it.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1">
          {originalTotal > total && (
            <p className="text-sm text-slate-500 line-through">Было: {formatPrice(originalTotal)}</p>
          )}
          {benefitAmount > 0 && (
            <p className="text-sm font-medium text-brand">Скидка: −{formatPrice(benefitAmount)}</p>
          )}
          <p className="text-base font-semibold text-slate-900">К оплате: {formatPrice(total)}</p>
        </div>
      </section>

      {/* 2. 배송 — 개인정보(프로필)의 доставка 전체 */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Доставка</h2>
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Укажите данные фактического получателя. Заказы из-за рубежа проходят личную таможенную очистку. Неверные данные могут повлечь задержки, возврат посылки или отказ в выдаче — просим указывать данные внимательно.
        </p>
        <div className="space-y-4 rounded-xl border border-brand/20 bg-brand-soft/10 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Фамилия</label>
              <input type="text" value={deliveryForm.fioLast} onChange={(e) => setDeliveryField('fioLast', e.target.value.replace(/[^A-Za-z\s-']/g, '').toUpperCase())} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 uppercase ${!deliveryForm.fioLast?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Имя</label>
              <input type="text" value={deliveryForm.fioFirst} onChange={(e) => setDeliveryField('fioFirst', e.target.value.replace(/[^A-Za-z\s-']/g, '').toUpperCase())} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 uppercase ${!deliveryForm.fioFirst?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Отчество</label>
              <input type="text" value={deliveryForm.fioMiddle} onChange={(e) => setDeliveryField('fioMiddle', e.target.value.replace(/[^A-Za-z\s-']/g, '').toUpperCase())} disabled={noPatronymic} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 uppercase disabled:bg-slate-50 disabled:text-slate-400 ${noPatronymic ? 'border-slate-200' : !deliveryForm.fioMiddle?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
              <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={noPatronymic} onChange={(e) => { const v = e.target.checked; setNoPatronymic(v); if (v) setDeliveryField('fioMiddle', ''); }} className="h-3 w-3 rounded border-slate-300 text-brand focus:ring-brand" />
                <span>Нет отчества</span>
              </label>
            </div>
          </div>
          <p className="text-xs font-normal text-slate-500">* ФИО как в паспорте (латинскими буквами).</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Номер телефона</label>
            <input type="tel" value={deliveryForm.phone} onChange={(e) => setDeliveryField('phone', e.target.value)} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 ${!deliveryForm.phone?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="+7 …" />
          </div>
          {/* 주소 맨 위: Dadata 자동완성 — 선택 시 아래 필드 자동 채움 */}
          <AddressSuggest
            label="Адрес"
            placeholder="Выберите адрес — ниже заполнится само"
            title="Введите адрес и выберите из списка: город, улица, индекс и др. заполнятся автоматически."
            value={addressQuery}
            onChange={setAddressQuery}
            onPartsChange={(parts) => {
              setDeliveryForm((prev) => ({
                ...prev,
                cityRegion: parts.cityRegion ?? prev.cityRegion,
                streetHouse: parts.streetHouse ?? prev.streetHouse,
                apartmentOffice: parts.apartmentOffice ?? prev.apartmentOffice,
                postcode: parts.postcode ?? prev.postcode,
              }));
            }}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Город / Регион</label>
            <input type="text" value={deliveryForm.cityRegion} onChange={(e) => setDeliveryField('cityRegion', e.target.value)} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 ${!deliveryForm.cityRegion?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Улица, Дом, Корпус</label>
            <input type="text" value={deliveryForm.streetHouse} onChange={(e) => setDeliveryField('streetHouse', e.target.value)} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 ${!deliveryForm.streetHouse?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Кв. / Офис</label>
            <input type="text" value={deliveryForm.apartmentOffice} onChange={(e) => setDeliveryField('apartmentOffice', e.target.value)} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 ${!deliveryForm.apartmentOffice?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Postcode <span className="font-normal text-slate-500">(индекс, 6 цифр)</span></label>
            <input type="text" value={deliveryForm.postcode} onChange={(e) => setDeliveryField('postcode', e.target.value)} maxLength={6} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 ${!deliveryForm.postcode?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">INN <span className="font-normal text-slate-500">(12 цифр)</span></label>
            <input type="text" value={deliveryForm.inn} onChange={(e) => setDeliveryField('inn', e.target.value)} maxLength={12} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 ${!deliveryForm.inn?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Серия паспорта</label>
              <input type="text" value={deliveryForm.passportSeries} onChange={(e) => setDeliveryField('passportSeries', e.target.value)} maxLength={4} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 ${!deliveryForm.passportSeries?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Номер паспорта</label>
              <input type="text" value={deliveryForm.passportNumber} onChange={(e) => setDeliveryField('passportNumber', e.target.value)} maxLength={6} className={`min-h-[2.75rem] w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30 ${!deliveryForm.passportNumber?.trim() ? 'border-brand ring-1 ring-brand/30' : 'border-slate-200'}`} placeholder="—" />
            </div>
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={saveDeliveryAsDefault} onChange={(e) => setSaveDeliveryAsDefault(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand" />
          <span className="whitespace-nowrap">Сохранить как данные по умолчанию для доставки</span>
        </label>
      </section>

      {/* 3. 결제 수단 + 포인트 사용 (step payment일 때) */}
      {step === 'payment' && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Способ оплаты</h2>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
            <input
              type="radio"
              name="payment"
              checked={paymentMethod === 'card'}
              onChange={() => setPaymentMethod('card')}
              className="h-4 w-4 border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-sm font-medium text-slate-800">Банковская карта</span>
          </label>

          {/* 포인트 사용 + 멤버십 쿠폰 사용 */}
          {paymentMethod === 'card' && (
            <>
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Баллы: <span className="tabular-nums text-amber-600">{userPoints}</span> доступно (макс. {MAX_POINTS_TO_USE} или 10% от суммы заказа)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={effectivePointsMax}
                    value={pointsToUse === 0 ? '' : pointsToUse}
                    onChange={(e) => {
                      const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                      setPointsToUse(Math.min(v, effectivePointsMax));
                    }}
                    placeholder="0"
                    className="h-10 w-24 rounded-lg border border-slate-200 bg-white px-3 text-sm tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <button
                    type="button"
                    onClick={() => setPointsToUse(effectivePointsMax)}
                    disabled={effectivePointsMax <= 0}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Списать всё
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Купоны уровня участника</p>
                {membershipCoupons.length === 0 ? (
                  <p className="text-sm text-slate-500">Доступных купонов нет.</p>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCouponId(null)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                        selectedCouponId === null ? 'border-brand bg-brand-soft/20 text-brand' : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      Не использовать купон
                    </button>
                    {membershipCoupons.map((c) => {
                      const expires = new Date(c.expires_at);
                      const label = `${c.amount} ₽ · до ${expires.toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}`;
                      const selected = selectedCouponId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCouponId(c.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                            selected ? 'border-brand bg-brand-soft/30 text-brand' : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-1 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm">
                <p className="text-slate-600">Сумма заказа: {formatPrice(total)}</p>
                {clampedPointsToUse > 0 && (
                  <p className="font-medium text-brand">Баллами: −{formatPrice(clampedPointsToUse)}</p>
                )}
                {couponDiscount > 0 && (
                  <p className="font-medium text-brand">Купон: −{formatPrice(couponDiscount)}</p>
                )}
                <p className="text-base font-semibold text-slate-900">Итого к оплате: {formatPrice(finalAmount)}</p>
              </div>
            </>
          )}
        </section>
      )}

      {/* 버튼: 배송 데이터 채워져 있으면 결제 단계로, 결제 단계에서는 결제 확인 */}
      <div className="mt-8 flex flex-col gap-3">
        {step === 'delivery' ? (
          <button
            type="button"
            onClick={handleConfirmOrder}
            disabled={!canProceedDelivery}
            className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            Далее — способ оплаты
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConfirmOrder}
            disabled={confirming}
            className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {confirming ? 'Подтверждение…' : 'Подтвердить заказ'}
          </button>
        )}
        {step === 'payment' && (
          <button
            type="button"
            onClick={() => setStep('delivery')}
            className="w-full rounded-full border border-slate-200 py-3 text-sm font-medium text-slate-700"
          >
            Назад
          </button>
        )}
      </div>
    </main>
  );
};
