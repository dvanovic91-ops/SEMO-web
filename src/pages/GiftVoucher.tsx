import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackArrow } from '../components/BackArrow';
import { SemoPageSpinner } from '../components/SemoPageSpinner';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { supabase } from '../lib/supabase';

/** 선물권 코드 생성: SEMO-GIFT-XXXXXXXX (8자, 혼동 없는 문자만) */
function generateGiftCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SEMO-GIFT-${part}`;
}

const DEFAULT_GIFT_PRICE_RUB = 10_000;
const GIFT_EXPIRES_DAYS = 365;

type PageState = 'loading' | 'idle' | 'confirm' | 'purchasing' | 'done' | 'error';

export const GiftVoucher: React.FC = () => {
  const { initialized, isLoggedIn, userId } = useAuth();
  const { language } = useI18n();
  const isEn = language === 'en';
  const tr = (en: string, ru: string) => (isEn ? en : ru);

  const [pageState, setPageState] = useState<PageState>('loading');
  const [giftPriceRub, setGiftPriceRub] = useState(DEFAULT_GIFT_PRICE_RUB);
  const [giftCode, setGiftCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /* ── site_settings에서 선물권 가격 로드 ── */
  useEffect(() => {
    if (!supabase) { setPageState('idle'); return; }
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'gift_voucher_price_rub')
      .maybeSingle()
      .then(({ data }) => {
        const raw = Number((data as { value?: string } | null)?.value ?? '');
        if (raw > 0) setGiftPriceRub(raw);
        setPageState('idle');
      })
      .catch(() => setPageState('idle'));
  }, []);

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  /* ── 클립보드 복사 ── */
  const handleCopy = async () => {
    if (!giftCode) return;
    try { await navigator.clipboard.writeText(giftCode); } catch { /* 폴백 무시 */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  };

  /* ── Web Share API ── */
  const handleShare = async () => {
    if (!giftCode) return;
    const shareText = tr(
      `A gift for you — SEMO K-Beauty Box! 🎁\nVoucher code: ${giftCode}\nActivate at: semo-box.com/profile/coupons`,
      `Тебе подарок — SEMO K-Beauty бокс! 🎁\nКод сертификата: ${giftCode}\nАктивируй на: semo-box.com/profile/coupons`,
    );
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text: shareText }); } catch { /* 취소됨 */ }
    } else {
      await handleCopy();
    }
  };

  /* ── 결제 확정 및 코드 발급 ── */
  const handlePurchase = async () => {
    if (!supabase || !userId || pageState === 'purchasing') return;
    setPageState('purchasing');
    setErrorMsg(null);
    try {
      const code = generateGiftCode();
      const expiresAt = new Date(Date.now() + GIFT_EXPIRES_DAYS * 86_400 * 1_000).toISOString();

      const { error: giftErr } = await supabase.from('gift_vouchers').insert({
        code,
        purchased_by: userId,
        amount_rub: giftPriceRub,
        expires_at: expiresAt,
      });
      if (giftErr) throw giftErr;

      const { error: orderErr } = await supabase.from('orders').insert({
        user_id: userId,
        order_type: 'gift_voucher',
        total_cents: giftPriceRub * 100,
        status: 'completed',
        items: [{
          id: code,
          name: tr('SEMO Beauty Box Gift Voucher', 'Подарочный сертификат SEMO'),
          quantity: 1,
          price: giftPriceRub,
        }],
      });
      if (orderErr) throw orderErr;

      setGiftCode(code);
      setPageState('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : tr('Unknown error', 'Неизвестная ошибка'));
      setPageState('error');
    }
  };

  /* ═══════════════════════════════
     로딩 화면
  ═══════════════════════════════ */
  if (pageState === 'loading') {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <SemoPageSpinner />
      </main>
    );
  }

  /* ═══════════════════════════════
     성공 화면 (코드 발급 완료)
  ═══════════════════════════════ */
  if (pageState === 'done' && giftCode) {
    return (
      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-10 md:py-14">
        <p className="mb-6">
          <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
            <BackArrow /> {tr('Shop', 'Магазин')}
          </Link>
        </p>

        <div className="mb-6 text-center">
          <span className="text-5xl" role="img" aria-label="gift">🎁</span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            {tr('Voucher is ready!', 'Сертификат готов!')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {tr(
              'Copy the code and send it to whoever you want to gift SEMO.',
              'Скопируй код и отправь тому, кому хочешь подарить SEMO.',
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-brand/25 bg-brand-soft/80 px-6 py-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            {tr('Your voucher code', 'Код сертификата')}
          </p>
          <p className="mt-3 font-mono text-3xl font-bold tracking-widest text-slate-900">
            {giftCode}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {tr('Valid for 1 year from today', 'Действует 1 год с момента покупки')}
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {tr('Send gift', 'Отправить подарок')}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-brand/25 bg-white px-6 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft/40"
            >
              {copied ? (
                <>{tr('Copied!', 'Скопировано!')}</>
              ) : (
                <>{tr('Copy code', 'Скопировать код')}</>
              )}
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {tr('How to activate', 'Как активировать')}
          </p>
          <ol className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li>1. {tr('Recipient creates an account on semo-box.com', 'Получатель регистрируется на semo-box.com')}</li>
            <li>2. {tr('Goes to Profile → Coupons', 'Переходит в Профиль → Купоны')}</li>
            <li>3. {tr('Enters the voucher code and clicks Activate', 'Вводит код сертификата и нажимает Активировать')}</li>
            <li>4. {tr('Places an order for free', 'Оформляет заказ бесплатно')}</li>
          </ol>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          {tr('Purchase saved in', 'Покупка сохранена в')}{' '}
          <Link to="/profile/orders" className="font-medium text-brand hover:opacity-90">
            {tr('your orders', 'истории заказов')}
          </Link>.
        </p>
      </main>
    );
  }

  /* ═══════════════════════════════
     2단계: 결제 확인 화면
  ═══════════════════════════════ */
  if (pageState === 'confirm' || pageState === 'purchasing' || pageState === 'error') {
    return (
      <main className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-10 md:py-14">
        <p className="mb-6">
          <button
            type="button"
            onClick={() => { if (pageState !== 'purchasing') setPageState('idle'); }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"
          >
            <BackArrow /> {tr('Back', 'Назад')}
          </button>
        </p>

        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            {tr('Order confirmation', 'Подтверждение заказа')}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {tr('Confirm purchase', 'Подтвердите покупку')}
          </h1>
        </header>

        {/* 주문 요약 */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl" role="img" aria-label="gift">🎁</span>
              <div>
                <p className="font-semibold text-slate-900">
                  {tr('SEMO Gift Voucher', 'Подарочный сертификат SEMO')}
                </p>
                <p className="text-xs text-slate-500">
                  {tr('Personalised K-beauty box · 1 delivery · Valid 1 year', 'Персонализированный K-beauty бокс · 1 доставка · 1 год')}
                </p>
              </div>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">{tr('Amount', 'Сумма')}</span>
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {giftPriceRub.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {tr(
                'After confirming, a unique gift code will be generated. Send it to your friend — she activates it on semo-box.com.',
                'После подтверждения генерируется уникальный код. Отправь его подруге — она активирует на semo-box.com.',
              )}
            </p>
          </div>

          {pageState === 'error' && errorMsg && (
            <div className="border-t border-rose-100 bg-rose-50 px-5 py-3">
              <p className="text-xs text-rose-700">{errorMsg}</p>
            </div>
          )}

          <div className="border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              disabled={pageState === 'purchasing'}
              onClick={() => void handlePurchase()}
              className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
            >
              {pageState === 'purchasing' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  {tr('Processing…', 'Оформляем…')}
                </span>
              ) : (
                `${tr('Confirm & get code', 'Подтвердить и получить код')} — ${giftPriceRub.toLocaleString('ru-RU')} ₽`
              )}
            </button>
            {pageState !== 'purchasing' && (
              <button
                type="button"
                onClick={() => setPageState('idle')}
                className="mt-2 w-full rounded-full border border-slate-200 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
              >
                {tr('Cancel', 'Отмена')}
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  /* ═══════════════════════════════
     1단계: 상품 소개 화면 (idle)
  ═══════════════════════════════ */
  return (
    <main className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
          <BackArrow /> {tr('Shop', 'Магазин')}
        </Link>
      </p>

      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
          {tr('Gift', 'Подарок')}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {tr('SEMO Gift Voucher', 'Подарочный сертификат SEMO')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {tr(
            'Gift a personalised K-beauty box — your friend takes the skin test and receives products selected just for her.',
            'Подари персонализированный K-beauty бокс — подруга проходит тест кожи и получает продукты, подобранные именно для неё.',
          )}
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-brand/20 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-brand/80 via-brand to-brand/80 px-6 py-5 text-center">
          <span className="text-4xl" role="img" aria-label="gift">🎁</span>
          <p className="mt-2 text-sm font-semibold text-white/90">SEMO K-BEAUTY BOX</p>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {tr('Personalised beauty box — 1 delivery', 'Персонализированный бокс — 1 доставка')}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {tr('Valid 1 year · Digital code sent instantly', 'Действует 1 год · Код выдаётся сразу')}
              </p>
            </div>
            <p className="shrink-0 text-xl font-bold tabular-nums text-slate-900">
              {giftPriceRub.toLocaleString('ru-RU')} ₽
            </p>
          </div>

          <ul className="mt-4 space-y-2">
            {(isEn
              ? [
                  'Personalised skin test for the recipient',
                  '5-7 Korean skincare products matched to her skin type',
                  'Ingredient & usage guide in Russian',
                  'Delivered to Russia, Kazakhstan, UAE, Uzbekistan',
                ]
              : [
                  'Персонализированный тест кожи для получателя',
                  '5–7 корейских средств под её тип кожи',
                  'Гид по составу и применению на русском',
                  'Доставка в Россию, Казахстан, ОАЭ, Узбекистан',
                ]
            ).map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={() => setPageState('confirm')}
            className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand/90"
          >
            {tr('Buy voucher', 'Купить сертификат')} — {giftPriceRub.toLocaleString('ru-RU')} ₽
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            {tr(
              'A unique code will appear after confirmation. Copy and send to your friend.',
              'После подтверждения появится уникальный код. Скопируй и отправь подруге.',
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {tr('How it works', 'Как это работает')}
        </p>
        <ol className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>1. {tr('Buy the voucher — a code is generated instantly', 'Покупаешь сертификат — код генерируется сразу')}</li>
          <li>2. {tr('Copy and send via any messenger', 'Копируешь и отправляешь в любом мессенджере')}</li>
          <li>3. {tr('Your friend registers on semo-box.com and takes the skin test', 'Подруга регистрируется на semo-box.com и проходит тест')}</li>
          <li>4. {tr('She activates the code in Profile → Coupons', 'Активирует код в Профиле → Купоны')}</li>
          <li>5. {tr('SEMO sends a box matched to her unique skin profile', 'SEMO отправляет бокс под её профиль кожи')}</li>
        </ol>
      </div>
    </main>
  );
};
