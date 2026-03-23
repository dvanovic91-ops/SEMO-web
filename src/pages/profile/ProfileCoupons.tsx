import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { AuthInitializingScreen, SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../../components/SemoPageSpinner';
import { useAuth } from '../../context/AuthContext';
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
  if (c.tier === 'special' || (c.quarter_label ?? '').startsWith('special-')) {
    return 'Специальный купон';
  }
  const q = (c.quarter_label ?? '').trim();
  if (/^\d{4}Q[1-4]$/.test(q)) {
    return `Квартальный (${q})`;
  }
  return q ? `Купон (${q})` : 'Квартальный купон';
}

/** 멤버십·특별 쿠폰 목록만 (포인트와 분리) */
export const ProfileCoupons: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { userId, isLoggedIn, initialized, isAdmin } = useAuth();
  const targetUserId = useMemo(() => {
    const p = searchParams.get('userId');
    if (isAdmin && p && UUID_RE.test(p)) return p;
    return userId ?? null;
  }, [searchParams, isAdmin, userId]);

  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoRedeemLoading, setPromoRedeemLoading] = useState(false);
  const [promoRedeemMessage, setPromoRedeemMessage] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = targetUserId;

  const refresh = useCallback(() => {
    if (!supabase || !targetUserId) {
      setCoupons([]);
      setLoading(false);
      return;
    }
    const requested = targetUserId;
    setLoading(true);
    supabase
      .from('membership_coupons')
      .select('id, amount, expires_at, used_at, tier, quarter_label')
      .eq('user_id', requested)
      .order('expires_at', { ascending: true })
      .then(({ data }) => {
        if (currentUserIdRef.current !== requested) return;
        setCoupons((data as CouponRow[]) ?? []);
      })
      .catch(() => {
        if (currentUserIdRef.current !== requested) return;
        setCoupons([]);
      })
      .finally(() => {
        if (currentUserIdRef.current === requested) setLoading(false);
      });
  }, [targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);

  const handleRedeemPromoCode = async () => {
    const raw = promoCodeInput.trim();
    if (!raw || !supabase || !targetUserId) return;
    setPromoRedeemLoading(true);
    setPromoRedeemMessage(null);
    const p_code = raw.toUpperCase();
    try {
      const { data, error } = await supabase.rpc('redeem_promo_code', { p_code });
      if (error) {
        if (error.message.includes('function') || error.code === 'PGRST202') {
          setPromoRedeemMessage(
            'Активация промокода пока недоступна. Обратитесь в поддержку или попробуйте позже.',
          );
        } else {
          setPromoRedeemMessage(error.message || 'Не удалось активировать код.');
        }
        return;
      }
      const ok = data && typeof data === 'object' && (data as { ok?: boolean }).ok === true;
      if (ok) {
        setPromoRedeemMessage('Промокод активирован. Купон добавлен.');
        setPromoCodeInput('');
        refresh();
      } else {
        const err = (data as { error?: string } | null)?.error;
        setPromoRedeemMessage(err || 'Код недействителен или уже использован.');
      }
    } catch (e) {
      setPromoRedeemMessage(e instanceof Error ? e.message : 'Ошибка сети.');
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
          <BackArrow /> Profile
        </Link>
      </p>
      {viewingOtherUser && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          Просмотр купонов выбранного пользователя (админ).
        </p>
      )}
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Мои купоны</h1>
        <p className="mt-2 text-sm text-slate-500">
          Квартальные купоны по уровню участника и специальные купоны от SEMO Box.
        </p>
      </header>

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Промокод</h2>
        <p className="mt-1 text-xs text-slate-500">
          Введите код (латиница и цифры). После активации сумма появится в списке купонов.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <input
            type="text"
            value={promoCodeInput}
            onChange={(e) => setPromoCodeInput(e.target.value)}
            placeholder="Например: SEMO-2026-XXXX"
            autoComplete="off"
            className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <button
            type="button"
            onClick={() => void handleRedeemPromoCode()}
            disabled={promoRedeemLoading || !promoCodeInput.trim()}
            className="min-h-11 shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
          >
            {promoRedeemLoading ? '…' : 'Активировать'}
          </button>
        </div>
        {promoRedeemMessage && (
          <p
            className={`mt-2 text-sm ${promoRedeemMessage.includes('активирован') || promoRedeemMessage.includes('добавлен') ? 'text-emerald-700' : 'text-slate-600'}`}
            role="status"
          >
            {promoRedeemMessage}
          </p>
        )}
      </section>

      {loading ? (
        <div className={SEMO_SECTION_LOADING_CLASS}>
          <SemoPageSpinner />
        </div>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-slate-500">Пока нет купонов.</p>
      ) : (
        <ul className="space-y-3">
          {coupons.map((c) => {
            const now = new Date();
            const expires = new Date(c.expires_at);
            const isUsed = !!c.used_at;
            const isExpired = !isUsed && expires.getTime() < now.getTime();
            const statusText = isUsed
              ? 'Использован'
              : isExpired
                ? 'Истёк'
                : `Действует до ${expires.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    {c.amount} ₽ · {couponTypeLabelRu(c)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.tier === 'special' || (c.quarter_label ?? '').startsWith('special-')
                      ? 'Специальная акция · срок 2 недели от даты выдачи'
                      : 'Квартальная программа · срок указан в дате окончания'}
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
      )}
    </main>
  );
};
