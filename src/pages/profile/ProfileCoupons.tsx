import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { AuthInitializingScreen, SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../../components/SemoPageSpinner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import { supabase } from '../../lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CouponRow = {
  id: string;
  amount: number;
  expires_at: string;
  used_at: string | null;
  tier?: string | null;
  quarter_label?: string | null;
};

function couponTypeLabelRu(c: CouponRow): string {
  if (c.tier === 'gift_box') {
    return 'Gift voucher';
  }
  if (c.tier === 'special' || (c.quarter_label ?? '').startsWith('special-')) {
    return 'Special coupon';
  }
  const q = (c.quarter_label ?? '').trim();
  if (/^\d{4}Q[1-4]$/.test(q)) {
    return `Quarterly (${q})`;
  }
  return q ? `Coupon (${q})` : 'Quarterly coupon';
}

/** 멤버십·특별 쿠폰 목록만 (포인트와 분리) */
export const ProfileCoupons: React.FC = () => {
  const { language } = useI18n();
  const [searchParams] = useSearchParams();
  const { userId, isLoggedIn, initialized, isAdmin } = useAuth();
  const targetUserId = useMemo(() => {
    const p = searchParams.get('userId');
    if (isAdmin && p && UUID_RE.test(p)) return p;
    return userId ?? null;
  }, [searchParams, isAdmin, userId]);

  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [selfieBalance, setSelfieBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoRedeemLoading, setPromoRedeemLoading] = useState(false);
  const [promoRedeemMessage, setPromoRedeemMessage] = useState<string | null>(null);
  const [promoSectionOpen, setPromoSectionOpen] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = targetUserId;

  const refresh = useCallback(() => {
    if (!supabase || !targetUserId) {
      setCoupons([]);
      setSelfieBalance(0);
      setLoading(false);
      return;
    }
    const requested = targetUserId;
    setLoading(true);
    Promise.all([
      supabase
        .from('membership_coupons')
        .select('id, amount, expires_at, used_at, tier, quarter_label')
        .eq('user_id', requested)
        .order('expires_at', { ascending: true }),
      supabase.from('selfie_coupon_balances').select('balance').eq('user_id', requested).maybeSingle(),
    ])
      .then(([cRes, sRes]) => {
        if (currentUserIdRef.current !== requested) return;
        setCoupons((cRes.data as CouponRow[]) ?? []);
        // 행 없음·PGRST116·기타 오류 모두 0으로 통일 — 셀피 카드는 항상 숫자로 표시
        let bal = 0;
        if (!sRes.error && sRes.data != null) {
          const raw = (sRes.data as { balance?: number | null }).balance;
          if (typeof raw === 'number' && !Number.isNaN(raw)) bal = Math.max(0, raw);
        }
        setSelfieBalance(bal);
      })
      .catch(() => {
        if (currentUserIdRef.current !== requested) return;
        setCoupons([]);
        setSelfieBalance(0);
      })
      .finally(() => {
        if (currentUserIdRef.current === requested) setLoading(false);
      });
  }, [targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (promoRedeemMessage) setPromoSectionOpen(true);
  }, [promoRedeemMessage]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);

  const isEn = language === 'en';
  const tr = (en: string, ru: string) => (isEn ? en : ru);

  const handleRedeemPromoCode = async () => {
    const raw = promoCodeInput.trim();
    if (!raw || !supabase || !targetUserId) return;
    setPromoRedeemLoading(true);
    setPromoRedeemMessage(null);
    const p_code = raw.toUpperCase();

    try {
      // 선물권 코드 (SEMO-GIFT-XXXX) → redeem_gift_voucher RPC로 라우팅
      if (p_code.startsWith('SEMO-GIFT-')) {
        const { data, error } = await supabase.rpc('redeem_gift_voucher', { p_code, p_user_id: targetUserId });
        if (error) {
          if (error.message.includes('function') || error.code === 'PGRST202') {
            setPromoRedeemMessage(tr(
              'Gift voucher activation is temporarily unavailable. Please contact support.',
              'Активация сертификата временно недоступна. Обратитесь в поддержку.',
            ));
          } else {
            setPromoRedeemMessage(error.message || tr('Failed to activate voucher.', 'Не удалось активировать сертификат.'));
          }
          return;
        }
        const ok = data && typeof data === 'object' && (data as { ok?: boolean }).ok === true;
        if (ok) {
          setPromoRedeemMessage(tr('Gift voucher activated! Box coupon has been added.', 'Подарочный сертификат активирован! Купон на бокс добавлен.'));
          setPromoCodeInput('');
          refresh();
        } else {
          const err = (data as { error?: string } | null)?.error;
          setPromoRedeemMessage(err || tr('Code is invalid or already used.', 'Код недействителен или уже использован.'));
        }
        return;
      }

      // 일반 프로모 코드 → redeem_promo_code RPC
      const { data, error } = await supabase.rpc('redeem_promo_code', { p_code });
      if (error) {
        if (error.message.includes('function') || error.code === 'PGRST202') {
          setPromoRedeemMessage(tr(
            'Promo code activation is temporarily unavailable. Please contact support or try again later.',
            'Активация промокода временно недоступна. Попробуйте позже или обратитесь в поддержку.',
          ));
        } else {
          setPromoRedeemMessage(error.message || tr('Failed to activate code.', 'Не удалось активировать код.'));
        }
        return;
      }
      const ok = data && typeof data === 'object' && (data as { ok?: boolean }).ok === true;
      if (ok) {
        setPromoRedeemMessage(tr('Promo code activated. Coupon has been added.', 'Промокод активирован. Купон добавлен.'));
        setPromoCodeInput('');
        refresh();
      } else {
        const err = (data as { error?: string } | null)?.error;
        setPromoRedeemMessage(err || tr('Code is invalid or already used.', 'Код недействителен или уже использован.'));
      }
    } catch (e) {
      setPromoRedeemMessage(e instanceof Error ? e.message : tr('Network error.', 'Ошибка сети.'));
    } finally {
      setPromoRedeemLoading(false);
    }
  };

  if (!initialized) return <AuthInitializingScreen />;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const viewingOtherUser = isAdmin && targetUserId && userId && targetUserId !== userId;

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
          <BackArrow /> {language === 'en' ? 'Profile' : 'Профиль'}
        </Link>
      </p>
      {viewingOtherUser && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          Viewing selected user coupons (admin).
        </p>
      )}
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">My coupons</h1>
        <p className="mt-2 text-sm text-slate-500">
          Quarterly tier coupons and special coupons from SEMO Box.
        </p>
      </header>

      <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          id="promo-code-toggle"
          aria-expanded={promoSectionOpen}
          aria-controls="promo-code-panel"
          onClick={() => setPromoSectionOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/80 sm:py-4"
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">
              {language === 'en' ? 'Promo / Gift code' : 'Промокод / Подарочный сертификат'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {language === 'en'
                ? 'Have a promo or gift voucher code? Tap to enter — it will appear in your list below.'
                : 'Есть промокод или код подарочного сертификата? Введите — купон появится в списке ниже.'}
            </p>
          </div>
          <svg
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${promoSectionOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {promoSectionOpen ? (
          <div id="promo-code-panel" role="region" aria-labelledby="promo-code-toggle" className="border-t border-slate-100 px-4 pb-4 pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <input
                type="text"
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value)}
                placeholder={language === 'en' ? 'Example: SEMO-GIFT-XXXXXXXX or SEMO-2026-XXXX' : 'Например: SEMO-GIFT-XXXXXXXX или SEMO-2026-XXXX'}
                autoComplete="off"
                className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => void handleRedeemPromoCode()}
                disabled={promoRedeemLoading || !promoCodeInput.trim()}
                className="min-h-11 shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
              >
                {promoRedeemLoading ? '…' : language === 'en' ? 'Activate' : 'Активировать'}
              </button>
            </div>
            {promoRedeemMessage && (
              <p
                className={`mt-2 text-sm ${promoRedeemMessage.includes('активирован') || promoRedeemMessage.includes('добавлен') || promoRedeemMessage.includes('activated') || promoRedeemMessage.includes('added') ? 'text-emerald-700' : 'text-slate-600'}`}
                role="status"
              >
                {promoRedeemMessage}
              </p>
            )}
          </div>
        ) : null}
      </section>

      {loading ? (
        <div className={SEMO_SECTION_LOADING_CLASS}>
          <SemoPageSpinner />
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {language === 'en' ? 'Your coupons' : 'Ваши купоны'}
          </p>
          <ul className="space-y-3">
            <li
              className="flex items-center justify-between gap-3 rounded-xl border-2 border-brand/45 bg-white px-4 py-3 text-sm shadow-sm"
              aria-label={language === 'en' ? 'Selfie analysis passes' : 'Проходы селфи-анализа'}
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800">
                  {language === 'en' ? 'Selfie skin analysis' : 'Селфи-анализ кожи'}
                </p>
                <p className="text-xs text-slate-500">
                  {language === 'en'
                    ? 'Separate from ₽ discounts — one pass per detailed analysis. Use on the skin test result page.'
                    : 'Отдельно от скидок на сумму — 1 проход на развёрнутый анализ. Используйте на странице результата теста.'}
                </p>
                <p className="mt-2">
                  <Link
                    to="/skin-test"
                    className="text-xs font-medium text-brand underline decoration-brand/40 underline-offset-2 hover:opacity-90"
                  >
                    {language === 'en' ? 'Open skin test →' : 'Перейти к тесту кожи →'}
                  </Link>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-medium uppercase tracking-wide text-brand">
                  {language === 'en' ? 'Available' : 'Доступно'}
                </p>
                <p className="text-lg font-bold tabular-nums text-brand sm:text-xl">{selfieBalance ?? 0}</p>
                <p className="text-[10px] text-slate-500">{language === 'en' ? 'passes' : 'шт.'}</p>
              </div>
            </li>
            {coupons.map((c) => {
              const now = new Date();
              const expires = new Date(c.expires_at);
              const isUsed = !!c.used_at;
              const isExpired = !isUsed && expires.getTime() < now.getTime();
              const statusText = isUsed
                ? language === 'en' ? 'Used' : 'Использован'
                : isExpired
                  ? language === 'en' ? 'Expired' : 'Истёк'
                  : language === 'en'
                    ? `Valid until ${expires.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : `До ${expires.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
              const isGiftBox = c.tier === 'gift_box';
              return (
                <li
                  key={c.id}
                  className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
                    isGiftBox
                      ? 'border-2 border-brand/30 bg-brand-soft/10'
                      : 'border border-slate-100 bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {isGiftBox
                        ? `🎁 ${language === 'en' ? 'Gift voucher · 1 SEMO Box' : 'Подарочный сертификат · 1 SEMO Box'}`
                        : `${c.amount} ₽ · ${couponTypeLabelRu(c)}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isGiftBox
                        ? language === 'en'
                          ? 'Covers full box cost — apply at checkout'
                          : 'Покрывает полную стоимость бокса — применить при оформлении'
                        : c.tier === 'special' || (c.quarter_label ?? '').startsWith('special-')
                          ? language === 'en' ? 'Special campaign · valid for 2 weeks from issue date' : 'Специальная акция · действует 2 недели с даты выдачи'
                          : language === 'en' ? 'Quarterly program · expiry shown in end date' : 'Ежеквартальная программа · срок указан в дате'}
                    </p>
                  </div>
                  <span
                    className={
                      isUsed || isExpired ? 'shrink-0 text-xs text-slate-400' : 'shrink-0 text-xs font-medium text-emerald-600'
                    }
                  >
                    {statusText}
                  </span>
                </li>
              );
            })}
          </ul>
          {coupons.length === 0 && (selfieBalance ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {language === 'en'
                ? 'No ₽ discount coupons yet. Selfie passes above may still apply after sign-up.'
                : 'Пока нет купонов на сумму в ₽. Проходы селфи выше начисляются после регистрации.'}
            </p>
          ) : null}
        </>
      )}
    </main>
  );
};
