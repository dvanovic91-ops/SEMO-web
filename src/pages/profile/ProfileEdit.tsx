import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth, ADMIN_DUMMY_USER_ID } from '../../context/AuthContext';
import { resendSignupConfirmationEmail } from '../../lib/authSignupResend';
import { InnHelpTooltip } from '../../components/InnHelpTooltip';
import { AddressSuggest } from '../../components/AddressSuggest';
import { BackArrow } from '../../components/BackArrow';
import { supabase } from '../../lib/supabase';
import {
  migrateLegacyProfileEditToSupabase,
  shippingFormToSnakePatch,
  shippingRowToFormFields,
  upsertShippingFromForm,
  type ShippingAddressRow,
  type ShippingFormCamel,
} from '../../lib/profileDeliveryDb';
import { clearPendingShippingBackup, flushPendingShippingBackup, savePendingShippingBackup } from '../../lib/profileDeliveryOffline';
import { shippingHasAnyField, validateShippingOrEmpty } from '../../lib/shippingValidation';
import { clampDigits } from '../../lib/digitsOnly';
import { CustomsPassportNotice } from '../../components/CustomsPassportNotice';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../../components/SemoPageSpinner';
import {
  accountLinkTwoColGridClass,
  accountPrimaryCtaClass,
  accountStatusPillClass,
} from '../../lib/accountLinkUi';
import {
  deliveryContactInputEditable as contactInputEditable,
  deliveryContactInputEmailPending as contactInputEmailPending,
  deliveryContactInputLocked as contactInputLocked,
  deliveryFormFieldColClass as fieldColClass,
  deliveryFormFieldLabelClass as fieldLabelClass,
  deliveryFormFioCellClass as fioCellClass,
  deliveryFormHintClass as hintClass,
  deliveryFormInnerCardClass,
  deliveryFormInputClass as inputClass,
  deliveryFormNoteRowClass,
  deliveryFormNoteScrollClass,
  deliveryFormNoteTextClass,
  deliveryFormSectionStackClass,
} from '../../lib/profileDeliveryFormUi';

/**
 * 프로필 수정 — 기본 인적/배송 정보 보기·수정.
 * 새로고침 시 auth 초기화를 기다린 뒤 렌더링하며, 로딩/데이터 보호/세션 재검사/에러 방어 적용.
 */
/** Имя / пароль — mb-1 라벨 (delivery fieldLabelClass와 구분) */
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

function formatPhone(value: string): string {
  let digits = (value ?? '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  else if (!digits.startsWith('7')) digits = '7' + digits;
  const a = digits.slice(0, 1);
  const b = digits.slice(1, 4);
  const c = digits.slice(4, 7);
  const e = digits.slice(7, 11);
  if (e.length) return `+${a} ${b} ${c} ${e}`;
  if (c.length) return `+${a} ${b} ${c}`;
  if (b.length) return `+${a} ${b}`;
  return `+${a}`;
}

function normalizeLatin(value: string): string {
  return (value ?? '').replace(/[^A-Za-z\s-']/g, '');
}

/** 로딩 스피너 — auth/세션 대기 시 항상 이걸로 먼저 반환 */
function LoadingSpinner() {
  return (
    <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
      <SemoPageSpinner />
    </main>
  );
}

/** 에러 시 fallback — 예상치 못한 에러로 흰 화면 방지 */
function ErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <p className="text-center text-slate-600">Что-то пошло не так. Попробуйте позже.</p>
      {onRetry && (
        <p className="mt-4 text-center">
          <button
            type="button"
            onClick={onRetry}
            className="text-sm text-brand hover:underline"
          >
            Обновить страницу
          </button>
        </p>
      )}
      <p className="mt-6 text-center">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> Profile</Link>
      </p>
    </main>
  );
}

/** 에러 바운더리 — 자식 렌더 중 throw 시 fallback 표시 */
class ProfileEditErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // 로깅 가능
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}

export const ProfileEdit: React.FC = () => {
  const [searchParams] = useSearchParams();
  const focusPhone = searchParams.get('focus') === 'phone';
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const { userEmail, userId, isLoggedIn, initialized, isEmailConfirmed, refreshEmailConfirmationFromServer } = useAuth();

  const [editing, setEditing] = useState(false);
  /** «Изменить номер» только после нажатия «Редактировать» внизу (не только focus=phone) */
  const [editStartedFromFooter, setEditStartedFromFooter] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [initialForm, setInitialForm] = useState<Record<string, string> | null>(null);
  const [telegramLinked, setTelegramLinked] = useState(false);
  /** true: пользователь нажал «Изменить номер» — поле открыто, но в БД telegram_id ещё не трогаем, пока не «Сохранить» */
  const [phoneUnlinkRequested, setPhoneUnlinkRequested] = useState(false);
  const [passwordSection, setPasswordSection] = useState(false);
  /** 저장 중 / 결과 피드백 */
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccessToast, setSaveSuccessToast] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [noPatronymic, setNoPatronymic] = useState(false);
  /** Письмо подтверждения email (как на странице профиля) */
  const [verifyEmailSending, setVerifyEmailSending] = useState(false);
  const [verifyEmailMessage, setVerifyEmailMessage] = useState<string | null>(null);
  const [verifyEmailError, setVerifyEmailError] = useState<string | null>(null);

  /** 페이지 진입 시 세션 재검사 — 없으면 로그인으로 보냄 */
  const [sessionChecked, setSessionChecked] = useState(false);
  const [redirectToLogin, setRedirectToLogin] = useState(false);
  /** Telegram 연동 성공 시 토스트 (연동 되었습니다) */
  const [telegramLinkedToast, setTelegramLinkedToast] = useState(false);
  /** Telegram 링크 열린 뒤 연동 완료 감지용 폴링 */
  const [pollingForTelegram, setPollingForTelegram] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Telegram уведомления — внизу «Основные данные» + при «Подтвердить» в Доставке */
  const [telegramNotifyOrders, setTelegramNotifyOrders] = useState(true);
  const [telegramNotifyMarketing, setTelegramNotifyMarketing] = useState(false);

  const safeUserEmail = userEmail ?? '';
  /** 서버 저장 실패 시 로컬 백업 안내(러시아어) */
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  /** DB 로드 전 표시용 기본값 — 진실의 원천은 profiles 조회 */
  const safeName = safeUserEmail ? safeUserEmail.split('@')[0] ?? '' : '';

  /** profiles + shipping_addresses 병합 — 기기가 바뀌어도 로그인 시 동일 데이터 */
  const loadProfileFromDb = useCallback(() => {
    if (!supabase || !userId) return;
    Promise.all([
      supabase
        .from('profiles')
        .select('name, phone, telegram_id, telegram_reward_given, telegram_notify_orders, telegram_notify_marketing')
        .eq('id', userId)
        .single(),
      supabase.from('shipping_addresses').select('*').eq('user_id', userId).maybeSingle(),
    ])
      .then(([{ data }, { data: shipRow }]) => {
        if (!data) return;
        const nextLinked = !!data?.telegram_id;
        setTelegramLinked((prev) => {
          if (prev === true && !nextLinked) console.warn('Telegram state changed! (ProfileEdit) — was linked, now unlinked. Check DB or network.');
          return nextLinked;
        });
        const shipForm = shippingRowToFormFields(shipRow as ShippingAddressRow | null);
        const up = (s: string) => (s ?? '').replace(/[^A-Za-z\s-']/g, '').toUpperCase();
        setForm((prev) => ({
          ...prev,
          email: safeUserEmail || prev?.email || '',
          name: data?.name ?? prev?.name ?? safeName,
          phone: data?.phone ?? prev?.phone ?? '',
          fioLast: up(shipForm.fioLast ?? prev?.fioLast ?? ''),
          fioFirst: up(shipForm.fioFirst ?? prev?.fioFirst ?? ''),
          fioMiddle: up(shipForm.fioMiddle ?? prev?.fioMiddle ?? ''),
          cityRegion: shipForm.cityRegion ?? prev?.cityRegion ?? '',
          streetHouse: shipForm.streetHouse ?? prev?.streetHouse ?? '',
          apartmentOffice: shipForm.apartmentOffice ?? prev?.apartmentOffice ?? '',
          postcode: shipForm.postcode ?? prev?.postcode ?? '',
          inn: shipForm.inn ?? prev?.inn ?? '',
          passportSeries: shipForm.passportSeries ?? prev?.passportSeries ?? '',
          passportNumber: shipForm.passportNumber ?? prev?.passportNumber ?? '',
        }));
        if (typeof data.telegram_notify_orders === 'boolean') {
          setTelegramNotifyOrders(data.telegram_notify_orders);
        } else {
          setTelegramNotifyOrders(true);
        }
        if (typeof data.telegram_notify_marketing === 'boolean') {
          setTelegramNotifyMarketing(data.telegram_notify_marketing);
        } else {
          setTelegramNotifyMarketing(false);
        }
        const fioMiddleVal = up(shipForm.fioMiddle ?? '');
        setNoPatronymic(!fioMiddleVal.trim());
        const parts = [shipForm.cityRegion, shipForm.streetHouse, shipForm.apartmentOffice, shipForm.postcode].filter(Boolean);
        if (parts.length) setAddressSearch(parts.join(', '));
      })
      .catch(() => {});
  }, [userId, safeName, safeUserEmail]);

  // [Auth 동기화] 페이지 진입 시 getSession()으로 세션 확인, 없으면 로그인 리다이렉트
  useEffect(() => {
    if (!supabase || !initialized) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user) {
        setRedirectToLogin(false);
      } else {
        setRedirectToLogin(true);
      }
      setSessionChecked(true);
    }).catch(() => {
      if (!cancelled) {
        setRedirectToLogin(true);
        setSessionChecked(true);
      }
    });
    return () => { cancelled = true; };
  }, [initialized]);

  /** 레거시 localStorage → DB 1회 이관 후 대기 중 백업 플러시, 이어서 프로필 로드 */
  useEffect(() => {
    if (!supabase || !userId || !safeUserEmail) return;
    let cancelled = false;
    (async () => {
      await migrateLegacyProfileEditToSupabase(supabase, userId, safeUserEmail);
      if (cancelled) return;
      const flushed = await flushPendingShippingBackup(supabase, userId);
      if (flushed) setSyncNotice(null);
      if (cancelled) return;
      loadProfileFromDb();
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, safeUserEmail, loadProfileFromDb]);

  useEffect(() => {
    void refreshEmailConfirmationFromServer();
  }, [userId, refreshEmailConfirmationFromServer]);

  const handleSendProfileVerifyEmail = useCallback(async () => {
    if (!supabase || !userId || !safeUserEmail?.trim()) {
      setVerifyEmailError('Не удалось определить email. Войдите снова.');
      return;
    }
    setVerifyEmailSending(true);
    setVerifyEmailMessage(null);
    setVerifyEmailError(null);
    try {
      const result = await resendSignupConfirmationEmail(supabase, safeUserEmail.trim(), '/profile');
      if (!result.ok) {
        setVerifyEmailError(result.message);
        return;
      }
      setVerifyEmailMessage(
        'Письмо отправлено. Перейдите по ссылке — после подтверждения обновите страницу.',
      );
    } finally {
      setVerifyEmailSending(false);
    }
  }, [userId, safeUserEmail]);

  /** Telegram уведомления — profiles (секция «Основные данные» внизу) */
  const saveTelegramNotificationPrefs = useCallback(
    async (patch: { telegram_notify_orders?: boolean; telegram_notify_marketing?: boolean }) => {
      if (!supabase || !userId) return;
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
      if (error) {
        console.warn('[telegram prefs ProfileEdit]', error.message);
        void loadProfileFromDb();
        return;
      }
    },
    [supabase, userId, loadProfileFromDb],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !supabase || !userId) return;
      void flushPendingShippingBackup(supabase, userId).then((ok) => {
        if (ok) setSyncNotice(null);
        loadProfileFromDb();
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadProfileFromDb, supabase, userId]);

  // Telegram 링크 연 뒤 연동 완료될 때까지 폴링; 연동되면 토스트 표시 후 폴링 중단
  useEffect(() => {
    if (!pollingForTelegram || !supabase || !userId) return;
    const maxUntil = Date.now() + 2 * 60 * 1000;
    const tick = () => {
      if (Date.now() > maxUntil) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setPollingForTelegram(false);
        setPhoneError('Связать Telegram не удалось вовремя. Откройте бота и нажмите «Подтвердить» ещё раз.');
        return;
      }
      supabase
        .from('profiles')
        .select('telegram_id')
        .eq('id', userId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            setPhoneError('Не удалось проверить статус Telegram. Проверьте интернет и попробуйте снова.');
            return;
          }
          if (data?.telegram_id) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setPollingForTelegram(false);
            setPhoneUnlinkRequested(false);
            setTelegramLinked(true);
            setTelegramLinkedToast(true);
            setTimeout(() => setTelegramLinkedToast(false), 3000);
            loadProfileFromDb();
          }
        });
    };
    tick();
    pollingRef.current = setInterval(tick, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [pollingForTelegram, userId, supabase]);

  // 이메일·표시 이름만 동기화 — 배송 필드는 loadProfileFromDb(shipping_addresses)에서 채움
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      email: (safeUserEmail || prev?.email) ?? '',
      name: (prev?.name || safeName),
    }));
  }, [safeUserEmail, safeName]);

  /** 온라인 복구 시 대기 중인 배송 데이터 서버 전송 */
  useEffect(() => {
    if (!supabase || !userId) return;
    const onOnline = () => {
      void flushPendingShippingBackup(supabase, userId).then((ok) => {
        if (ok) {
          setSyncNotice(null);
          loadProfileFromDb();
        }
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [supabase, userId, loadProfileFromDb]);

  /** ?focus=phone: после «Редактировать» фокус на поле телефона */
  useEffect(() => {
    if (!focusPhone || !editing || !(form?.email)) return;
    const t = setTimeout(() => phoneInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [focusPhone, form?.email, editing]);

  // ——— [로딩 상태 처리] 최상단: 데이터 없으면 에러 안 뱉고 로딩만 ———
  if (!initialized || (!sessionChecked && !redirectToLogin)) {
    return <LoadingSpinner />;
  }
  if (redirectToLogin || !isLoggedIn || !safeUserEmail) {
    return <Navigate to="/login" replace />;
  }

  const isDirty = editing && initialForm !== null && JSON.stringify(form) !== JSON.stringify(initialForm);

  const handleChange = (key: string, value: string) => {
    setSaveError(null);
    let next = value ?? '';
    if (key === 'fioLast' || key === 'fioFirst' || key === 'fioMiddle') next = normalizeLatin(next).toUpperCase();
    else if (key === 'inn') next = clampDigits(next, 12);
    else if (key === 'passportSeries') next = clampDigits(next, 4);
    else if (key === 'passportNumber') next = clampDigits(next, 6);
    else if (key === 'postcode') next = clampDigits(next, 6);
    setForm((prev) => ({ ...prev, [key]: next }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneError('');
    handleChange('phone', formatPhone(e.target.value ?? ''));
  };

  const handleSave = async () => {
    if (!supabase || !userId) return;
    setSaveError(null);
    const shippingForm: ShippingFormCamel = {
      fioLast: form?.fioLast ?? '',
      fioFirst: form?.fioFirst ?? '',
      fioMiddle: form?.fioMiddle ?? '',
      cityRegion: form?.cityRegion ?? '',
      streetHouse: form?.streetHouse ?? '',
      apartmentOffice: form?.apartmentOffice ?? '',
      postcode: form?.postcode ?? '',
      phone: form?.phone ?? '',
      inn: form?.inn ?? '',
      passportSeries: form?.passportSeries ?? '',
      passportNumber: form?.passportNumber ?? '',
    };
    const profilesPatch = {
      name: (form?.name ?? '').trim() || null,
      phone: (form?.phone ?? '').trim() || null,
      ...(phoneUnlinkRequested ? { telegram_id: null as null, phone_verified: false } : {}),
    };

    const block = validateShippingOrEmpty(shippingForm);
    if (!block.ok) {
      setSaveError(block.messageRu);
      return;
    }
    const wantShipping = shippingHasAnyField(shippingForm);

    setSaveLoading(true);
    try {
      const { error: profErr } = await supabase.from('profiles').update(profilesPatch).eq('id', userId);
      if (profErr) throw new Error(profErr.message);
      if (wantShipping) {
        const shipErr = await upsertShippingFromForm(supabase, userId, shippingForm);
        if (shipErr) throw new Error(shipErr.message);
      }
      clearPendingShippingBackup(userId);
      setSyncNotice(null);
      setPhoneUnlinkRequested(false);
      setEditStartedFromFooter(false);
      setEditing(false);
      setInitialForm(null);
      setSaveSuccessToast(true);
      window.setTimeout(() => setSaveSuccessToast(false), 3500);
      void loadProfileFromDb();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Не удалось сохранить. Проверьте подключение и попробуйте снова.';
      setSaveError(msg);
      savePendingShippingBackup(userId, {
        userId,
        profilesPatch,
        shippingPatch: shippingFormToSnakePatch(shippingForm),
      });
      setSyncNotice(
        'Не удалось сохранить на сервер. Введённые данные не сброшены — исправьте сеть и нажмите «Сохранить» снова.',
      );
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTelegramVerify = async () => {
    setPhoneError('');
    if (!supabase || !userId) return;
    try {
      await supabase
        .from('profiles')
        .update({
          phone: form?.phone ?? '',
          telegram_notify_orders: telegramNotifyOrders,
          telegram_notify_marketing: telegramNotifyMarketing,
        })
        .eq('id', userId);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('link_tokens')
        .insert({ user_id: userId, expires_at: expiresAt })
        .select('token')
        .single();
      if (error || !data?.token) {
        setPhoneError('Не удалось создать ссылку для Telegram. Проверьте доступ к link_tokens (RLS).');
        return;
      }
      window.open(`https://t.me/My_SEMO_Beautybot?start=link_${data.token}`, '_blank');
      setPollingForTelegram(true);
    } catch {
      setPhoneError('Не удалось подтвердить номер. Попробуйте позже.');
    }
  };

  /** Номер можно править локально; в БД telegram_id снимается только при «Сохранить», чтобы «Назад» не ломал привязку */
  const handleUnlinkToChangePhone = () => {
    setPhoneError('');
    setPhoneUnlinkRequested(true);
    setTimeout(() => phoneInputRef.current?.focus(), 100);
  };

  const showChangePhoneControl =
    editing && editStartedFromFooter && telegramLinked && !phoneUnlinkRequested;

  const phoneLockedByTelegram = telegramLinked && !phoneUnlinkRequested;
  const phoneFieldClass = !editing
    ? telegramLinked
      ? contactInputLocked
      : contactInputEmailPending
    : phoneLockedByTelegram
      ? contactInputLocked
      : contactInputEditable;

  const inputProps = (key: string) =>
    editing
      ? { value: form?.[key] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleChange(key, e.target.value ?? '') }
      : { value: form?.[key] ?? '', readOnly: true, className: `${inputClass} cursor-default bg-slate-50` };

  return (
    <ProfileEditErrorBoundary>
      <main className="mx-auto min-w-0 max-w-xl px-3 py-5 sm:px-6 sm:py-10 md:py-14">
        <p className="mb-6">
          <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> Profile</Link>
        </p>

        {syncNotice && (
          <div className="mb-8">
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
              {syncNotice}
            </p>
          </div>
        )}

        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Основные данные</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="pe-name" className={labelClass}>Имя</label>
                <input
                  id="pe-name"
                  type="text"
                  placeholder="Имя для обращения"
                  className={inputClass}
                  {...inputProps('name')}
                />
              </div>
              {/* Telegram + E-mail — иконка Telegram только #26A5E4; остальное — фирменный оранжевый */}
              {userId && userId !== ADMIN_DUMMY_USER_ID && (
                <div
                  className={`overflow-hidden rounded-2xl border px-3 pt-3 pb-2 shadow-sm sm:px-5 sm:pt-5 sm:pb-3 ${
                    isEmailConfirmed
                      ? 'border-brand/35 bg-gradient-to-br from-brand-soft/95 via-brand-soft/70 to-brand-soft ring-1 ring-brand/15'
                      : 'border-brand/25 bg-brand-soft/95 ring-1 ring-brand/10'
                  }`}
                >
                  {/* Личный кабинет과 동일: 모바일도 2열(텔еграм | email) */}
                  <div className={`${accountLinkTwoColGridClass} md:gap-x-0`}>
                    <div className="flex min-h-0 min-w-0 flex-col border-r border-slate-200/60 pr-2 sm:pr-3 md:pr-5">
                      <div className="flex items-center justify-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-[#26A5E4] shadow-sm ring-1 ring-slate-200/80">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                          </svg>
                        </span>
                        <p className="text-sm font-semibold tracking-tight text-slate-900">Telegram</p>
                      </div>
                      {/* Только статус привязки — действия (кнопки) в блоке «Доставка» */}
                      <div className="mt-2.5">
                        {!initialized ? (
                          <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200/70" aria-hidden />
                        ) : (
                          <div
                            className={accountStatusPillClass}
                            role="status"
                            aria-label={telegramLinked ? 'Telegram привязан' : 'Telegram не привязан'}
                          >
                            {telegramLinked ? 'Telegram привязан ✓' : 'Telegram не привязан'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex min-h-0 min-w-0 flex-col pl-2 sm:pl-3 md:pl-5">
                      <div className="flex items-center justify-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-brand shadow-sm ring-1 ring-brand/25">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                        </span>
                        <p className="text-sm font-semibold tracking-tight text-slate-900">E-mail</p>
                      </div>
                      <div className="mt-2.5">
                        {!initialized ? (
                          <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200/70" aria-hidden />
                        ) : (
                          <div
                            className={accountStatusPillClass}
                            role="status"
                            aria-label={isEmailConfirmed ? 'Email подтверждён' : 'Email не подтверждён'}
                          >
                            {isEmailConfirmed ? 'Email подтверждён ✓' : 'Email не подтверждён'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 border-t border-slate-100 pt-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Сменить пароль</h3>
                {!passwordSection ? (
                  <button
                    type="button"
                    onClick={() => setPasswordSection(true)}
                    className="rounded-full border border-slate-200 py-2.5 px-4 text-sm font-medium text-slate-700 hover:border-brand hover:text-brand"
                  >
                    Изменить пароль
                  </button>
                ) : (
                  <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                    <div>
                      <label htmlFor="pw-current" className={labelClass}>Текущий пароль</label>
                      <input id="pw-current" type="password" className={inputClass} placeholder="••••••••" value={pwCurrent} onChange={(e) => { setPwCurrent(e.target.value); setPwError(''); }} />
                    </div>
                    <div>
                      <label htmlFor="pw-new" className={labelClass}>Новый пароль</label>
                      <input id="pw-new" type="password" className={inputClass} placeholder="••••••••" value={pwNew} onChange={(e) => { setPwNew(e.target.value); setPwError(''); }} />
                    </div>
                    <div>
                      <label htmlFor="pw-confirm" className={labelClass}>Повторите новый пароль</label>
                      <input id="pw-confirm" type="password" className={inputClass} placeholder="••••••••" value={pwConfirm} onChange={(e) => { setPwConfirm(e.target.value); setPwError(''); }} />
                    </div>
                    {pwError && <p className="text-sm text-red-600">{pwError}</p>}
                    {pwSuccess && <p className="text-sm text-green-600">Пароль успешно изменён.</p>}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setPwError('');
                          setPwSuccess(false);
                          if (!pwNew || pwNew.length < 6) { setPwError('Новый пароль не менее 6 символов.'); return; }
                          if (pwNew !== pwConfirm) { setPwError('Пароли не совпадают.'); return; }
                          if (!supabase) { setPwError('Сервис недоступен.'); return; }
                          const { error } = await supabase.auth.updateUser({ password: pwNew });
                          if (error) {
                            setPwError(error.message === 'New password should be different from the old password.' ? 'Новый пароль должен отличаться.' : error.message);
                            return;
                          }
                          setPwSuccess(true);
                          setPwCurrent('');
                          setPwNew('');
                          setPwConfirm('');
                        }}
                        className="rounded-full bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
                      >
                        Сменить пароль
                      </button>
                      <button type="button" onClick={() => { setPasswordSection(false); setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwError(''); setPwSuccess(false); }} className="text-sm text-slate-500 hover:text-slate-700">Отмена</button>
                    </div>
                  </div>
                )}
              </div>

              {userId && userId !== ADMIN_DUMMY_USER_ID && (
                <div className="prose-ru mt-6 min-w-0 max-w-full border-t border-slate-100 pt-4">
                  <p className="text-sm font-semibold leading-snug text-slate-900">Уведомления в Telegram</p>
                  <p className="mt-1.5 text-xs leading-snug text-slate-500">
                    Привязка Telegram — в разделе «Доставка» ниже. Уведомления о заказах и акциях.
                  </p>
                  <label className="mt-3 flex min-w-0 cursor-pointer items-start gap-2.5 text-sm leading-snug text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
                      checked={telegramNotifyOrders}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setTelegramNotifyOrders(v);
                        void saveTelegramNotificationPrefs({ telegram_notify_orders: v });
                      }}
                    />
                    <span className="min-w-0 flex-1">Заказы и доставка (статус, трекинг)</span>
                  </label>
                  <label className="mt-2.5 flex min-w-0 cursor-pointer items-start gap-2.5 text-sm leading-snug text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
                      checked={telegramNotifyMarketing}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setTelegramNotifyMarketing(v);
                        void saveTelegramNotificationPrefs({ telegram_notify_marketing: v });
                      }}
                    />
                    <span className="min-w-0 flex-1">Новинки, скидки и акции</span>
                  </label>
                </div>
              )}
            </div>
          </section>

          <section className="min-w-0">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Доставка <span className={hintClass}>(при заказе — обязательно)</span>
            </h2>
            <div className={deliveryFormSectionStackClass}>
              <div className={deliveryFormInnerCardClass}>
                {/* ФИО — Register.tsx와 동일한 그리드·«Нет отчества»·힌트 */}
                <div className={fieldColClass}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3 sm:items-start">
                    <div className={fioCellClass}>
                      <label htmlFor="pe-fio-last" className={`${fieldLabelClass} flex flex-wrap items-center gap-x-1`}>
                        Фамилия
                      </label>
                      <input
                        id="pe-fio-last"
                        type="text"
                        placeholder="Ivanov"
                        className={`${inputClass} uppercase${!editing ? ' cursor-default bg-slate-50' : ''}`}
                        value={form?.fioLast ?? ''}
                        readOnly={!editing}
                        onChange={editing ? (e) => handleChange('fioLast', e.target.value) : undefined}
                      />
                    </div>
                    <div className={fioCellClass}>
                      <label htmlFor="pe-fio-first" className={`${fieldLabelClass} flex flex-wrap items-center gap-x-1`}>
                        Имя
                      </label>
                      <input
                        id="pe-fio-first"
                        type="text"
                        placeholder="Ivan"
                        className={`${inputClass} uppercase${!editing ? ' cursor-default bg-slate-50' : ''}`}
                        value={form?.fioFirst ?? ''}
                        readOnly={!editing}
                        onChange={editing ? (e) => handleChange('fioFirst', e.target.value) : undefined}
                      />
                    </div>
                    <div className={fioCellClass}>
                      <label htmlFor="pe-fio-middle" className={`${fieldLabelClass} flex flex-wrap items-center gap-x-1`}>
                        Отчество
                      </label>
                      <input
                        id="pe-fio-middle"
                        type="text"
                        placeholder="Ivanovich"
                        className={`${inputClass} uppercase disabled:bg-slate-50 disabled:text-slate-400${!editing ? ' cursor-default bg-slate-50' : ''}`}
                        value={form?.fioMiddle ?? ''}
                        readOnly={!editing}
                        disabled={editing && noPatronymic}
                        onChange={editing ? (e) => handleChange('fioMiddle', e.target.value) : undefined}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col-reverse items-start gap-1 sm:grid sm:grid-cols-3 sm:items-start sm:justify-items-start sm:gap-x-3 sm:gap-y-0">
                    <p className="min-w-0 max-w-full text-[11px] leading-snug text-slate-500 sm:col-span-2 sm:row-start-1">
                      * ФИО как в паспорте (латинскими буквами).
                    </p>
                    <label className="inline-flex w-fit shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-slate-500 sm:col-start-3 sm:row-start-1 sm:place-self-start">
                      <input
                        type="checkbox"
                        checked={noPatronymic}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setNoPatronymic(v);
                          if (v) handleChange('fioMiddle', '');
                        }}
                        className="h-3 w-3 rounded border-slate-300 text-brand focus:ring-brand"
                      />
                      <span className="whitespace-nowrap">Нет отчества</span>
                    </label>
                  </div>
                </div>

                {/* E-mail — над телефоном; подтверждён: серое поле; нет — как телефон + кнопка «Подтвердить email» */}
                <div className={fieldColClass}>
                  <label htmlFor="pe-delivery-email" className={fieldLabelClass}>
                    E-mail
                  </label>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                    <input
                      id="pe-delivery-email"
                      type="email"
                      autoComplete="email"
                      readOnly
                      className={`min-w-0 flex-1 ${isEmailConfirmed ? contactInputLocked : contactInputEmailPending}`}
                      value={form?.email ?? safeUserEmail ?? ''}
                      aria-readonly
                    />
                    {!isEmailConfirmed && (
                      <button
                        type="button"
                        disabled={verifyEmailSending || !safeUserEmail?.trim()}
                        onClick={() => void handleSendProfileVerifyEmail()}
                        className={`${accountPrimaryCtaClass} w-full shrink-0 sm:w-auto sm:px-5`}
                      >
                        {verifyEmailSending ? 'Отправка…' : 'Подтвердить email'}
                      </button>
                    )}
                  </div>
                  {!isEmailConfirmed && (
                    <div className={deliveryFormNoteRowClass} role="note">
                      <span aria-hidden className="shrink-0 select-none">
                        *
                      </span>
                      <div className={deliveryFormNoteScrollClass}>
                        <span className={deliveryFormNoteTextClass}>
                          Подтвердите email для оформления заказа.
                        </span>
                      </div>
                    </div>
                  )}
                  {verifyEmailError && (
                    <p className="mt-2 text-xs text-red-600" role="alert">
                      {verifyEmailError}
                    </p>
                  )}
                  {verifyEmailMessage && (
                    <p className="mt-2 text-xs text-slate-600" role="status">
                      {verifyEmailMessage}
                    </p>
                  )}
                </div>

                {/* Телефон — поле flex-1 + узкая кнопка «Подтвердить» (текст без «в Telegram») */}
                <div className={fieldColClass}>
                  <label htmlFor="pe-phone" className={fieldLabelClass}>
                    Номер телефона
                  </label>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                    <input
                      ref={phoneInputRef}
                      id="pe-phone"
                      type="tel"
                      placeholder="+7 999 999 9999"
                      title="+200 баллов за подтверждение в Telegram"
                      className={`${phoneFieldClass} min-w-0 flex-1`}
                      value={form?.phone ?? ''}
                      onChange={editing && (!telegramLinked || phoneUnlinkRequested) ? handlePhoneChange : undefined}
                      readOnly={!editing || phoneLockedByTelegram}
                      maxLength={16}
                    />
                    {!telegramLinked && (
                      <button
                        type="button"
                        disabled={pollingForTelegram}
                        onClick={() => void handleTelegramVerify()}
                        className={`${accountPrimaryCtaClass} w-full shrink-0 sm:w-auto sm:px-5`}
                      >
                        {pollingForTelegram ? 'Ожидание…' : 'Подтвердить'}
                      </button>
                    )}
                  </div>
                  <div className={deliveryFormNoteRowClass} role="note">
                    <span aria-hidden className="shrink-0 select-none">
                      *
                    </span>
                    <div className={deliveryFormNoteScrollClass}>
                      <span className={deliveryFormNoteTextClass}>
                        Подтверждается через Telegram, за подтверждение +200 баллов.
                      </span>
                    </div>
                  </div>
                  {showChangePhoneControl && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={handleUnlinkToChangePhone}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-semibold text-brand shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/20"
                      >
                        Изменить номер
                      </button>
                    </div>
                  )}
                  {editing && phoneUnlinkRequested && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPhoneUnlinkRequested(false);
                          void loadProfileFromDb();
                        }}
                        className="text-xs font-medium text-slate-600 underline hover:text-slate-800"
                      >
                        Отмена
                      </button>
                    </div>
                  )}
                  {phoneUnlinkRequested && (
                    <p className="mt-2 text-[11px] leading-snug text-slate-600">
                      Нажмите «Сохранить», чтобы записать номер и снять привязку Telegram. «Отмена» — без изменений в аккаунте.
                    </p>
                  )}
                  {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
                </div>

                <AddressSuggest
                  label={
                    <span className="inline-flex items-center gap-2">
                      Адрес (поиск по базе)
                      <span className="group relative ml-0.5 inline-flex cursor-help" aria-label="Подсказка">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 text-xs font-medium transition hover:border-brand hover:text-brand">
                          ?
                        </span>
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 inline-block w-max -translate-x-1/2 whitespace-nowrap rounded border border-slate-100 bg-white px-2.5 py-1.5 text-left text-xs font-medium leading-none text-brand shadow-md opacity-0 transition group-hover:opacity-100">
                          При вводе адреса нижние поля заполнятся автоматически.
                        </span>
                      </span>
                    </span>
                  }
                  placeholder="Начните вводить адрес, затем выберите вариант из списка"
                  value={addressSearch}
                  onChange={setAddressSearch}
                  onPartsChange={({ cityRegion, streetHouse, apartmentOffice, postcode }) => {
                    if (cityRegion !== undefined) handleChange('cityRegion', cityRegion);
                    if (streetHouse !== undefined) handleChange('streetHouse', streetHouse);
                    if (apartmentOffice !== undefined) handleChange('apartmentOffice', apartmentOffice);
                    if (postcode !== undefined) handleChange('postcode', postcode);
                  }}
                />

                <div className={fieldColClass}>
                  <label htmlFor="pe-city" className={fieldLabelClass}>
                    Город / Регион
                  </label>
                  <input id="pe-city" type="text" placeholder="Москва, Санкт-Петербург" className={inputClass} {...inputProps('cityRegion')} />
                </div>
                <div className={fieldColClass}>
                  <label htmlFor="pe-street" className={fieldLabelClass}>
                    Улица, Дом, Корпус/Строение
                  </label>
                  <input id="pe-street" type="text" placeholder="ул. Арбат, д. 15, корп. 2" className={inputClass} {...inputProps('streetHouse')} />
                </div>
                <div className={fieldColClass}>
                  <label htmlFor="pe-apt" className={fieldLabelClass}>
                    Кв. / Офис
                  </label>
                  <input id="pe-apt" type="text" placeholder="кв. 104" className={inputClass} {...inputProps('apartmentOffice')} />
                </div>
                <div className={fieldColClass}>
                  <label htmlFor="pe-postcode" className={fieldLabelClass}>
                    Postcode <span className={hintClass}>(индекс, 6 цифр)</span>
                  </label>
                  <input
                    id="pe-postcode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="123456"
                    maxLength={6}
                    className={inputClass}
                    {...inputProps('postcode')}
                  />
                </div>
                <div className={fieldColClass}>
                  <label htmlFor="pe-inn" className={`${fieldLabelClass} inline-flex items-center gap-1`}>
                    INN <span className={hintClass}>(ИНН, 12 цифр)</span>
                    <InnHelpTooltip />
                  </label>
                  <input
                    id="pe-inn"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="12 цифр"
                    maxLength={12}
                    className={inputClass}
                    {...inputProps('inn')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={fieldColClass}>
                    <label htmlFor="pe-ps" className={fieldLabelClass}>
                      Серия паспорта
                    </label>
                    <input
                      id="pe-ps"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="1234"
                      maxLength={4}
                      className={inputClass}
                      {...inputProps('passportSeries')}
                    />
                  </div>
                  <div className={fieldColClass}>
                    <label htmlFor="pe-pn" className={fieldLabelClass}>
                      Номер паспорта
                    </label>
                    <input
                      id="pe-pn"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="567890"
                      maxLength={6}
                      className={inputClass}
                      {...inputProps('passportNumber')}
                    />
                  </div>
                </div>
                <CustomsPassportNotice />
              </div>
            </div>
          </section>

          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setSaveError(null);
                setInitialForm(form);
                setEditing(true);
                setEditStartedFromFooter(true);
              }}
              className="w-full rounded-full border border-slate-200 py-3.5 text-base font-medium text-slate-700 transition hover:border-brand hover:bg-brand-soft/10"
            >
              Редактировать
            </button>
          ) : (
            isDirty && (
              <div className="space-y-3">
                {saveError && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">
                    {saveError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saveLoading}
                  className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saveLoading ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            )
          )}
        </form>

        {telegramLinkedToast && (
          <div className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-8" role="status" aria-live="polite">
            Telegram привязан. Аккаунт успешно связан.
          </div>
        )}
        {saveSuccessToast && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              className="max-w-[min(100vw-2rem,24rem)] rounded-2xl bg-[#1a2f4a] px-5 py-3 text-center text-sm font-medium text-white shadow-lg"
              role="status"
              aria-live="polite"
            >
              Сохранено.
            </div>
          </div>
        )}
      </main>
    </ProfileEditErrorBoundary>
  );
};
