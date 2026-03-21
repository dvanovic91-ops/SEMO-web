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

/**
 * 프로필 수정 — 기본 인적/배송 정보 보기·수정.
 * 새로고침 시 auth 초기화를 기다린 뒤 렌더링하며, 로딩/데이터 보호/세션 재검사/에러 방어 적용.
 */
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';
const hintClass = 'text-[11px] text-slate-500 font-normal';
const fieldHintSpacing = 'mt-4';

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
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-4">
      <p className="text-center text-sm text-slate-500">Загрузка…</p>
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
  const [form, setForm] = useState<Record<string, string>>({});
  const [initialForm, setInitialForm] = useState<Record<string, string> | null>(null);
  const [telegramLinked, setTelegramLinked] = useState(false);
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
        .select('name, phone, telegram_id, telegram_reward_given')
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

  // focus=phone 이면 연동 목적 진입 → 편집 모드 자동 켜서 전화 입력·"Подтвердить в Telegram" 바로 사용 가능
  useEffect(() => {
    if (searchParams.get('focus') === 'phone') setEditing(true);
  }, [searchParams]);

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
        return;
      }
      supabase.from('profiles').select('telegram_id').eq('id', userId).single().then(({ data }) => {
        if (data?.telegram_id) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPollingForTelegram(false);
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

  useEffect(() => {
    if (!focusPhone || !(form?.email)) return;
    setEditing(true);
    setInitialForm((prev) => prev ?? { ...form });
    const t = setTimeout(() => phoneInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [focusPhone, form?.email]);

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
    if (!form?.phone) {
      setPhoneError('Укажите номер телефона.');
      return;
    }
    if (!supabase || !userId) return;
    try {
      await supabase.from('profiles').update({ phone: form?.phone ?? '' }).eq('id', userId);
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

  const handleUnlinkToChangePhone = async () => {
    if (!supabase || !userId) return;
    setPhoneError('');
    try {
      // 의도적 연동 해제: 사용자가 "Изменить номер" 클릭 시에만 telegram_id null로 설정
      await supabase.from('profiles').update({ telegram_id: null, phone_verified: false }).eq('id', userId);
      setTelegramLinked(false);
      setEditing(true);
      setInitialForm((prev) => prev ?? { ...form });
      setTimeout(() => phoneInputRef.current?.focus(), 100);
    } catch {
      setPhoneError('Не удалось отвязать. Попробуйте позже.');
    }
  };

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

        <header className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Редактировать профиль
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Основные данные и адрес доставки. Ниже — смена пароля.
          </p>
          {syncNotice && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
              {syncNotice}
            </p>
          )}
        </header>

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
              {/* Telegram + E-mail — как на странице профиля; при подтверждённом email — акцент изумрудным */}
              {userId && userId !== ADMIN_DUMMY_USER_ID && (
                <div
                  className={`overflow-hidden rounded-2xl border px-3 pt-3 pb-2 shadow-sm sm:px-5 sm:pt-5 sm:pb-3 ${
                    isEmailConfirmed
                      ? 'border-emerald-200/85 bg-gradient-to-br from-sky-50/95 via-emerald-50/20 to-emerald-50/55 ring-1 ring-emerald-100/70'
                      : 'border-sky-100/90 bg-sky-50/95'
                  }`}
                >
                  {/* Личный кабинет과 동일: 모바일도 2열(텔еграм | email) */}
                  <div className="grid grid-cols-2 gap-x-2 sm:gap-x-4 md:gap-x-0">
                    <div className="flex min-h-0 min-w-0 flex-col border-r border-slate-200/60 pr-2 sm:pr-3 md:pr-5">
                      <div className="flex items-center justify-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#26A5E4] shadow-sm ring-1 ring-sky-100/80">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                          </svg>
                        </span>
                        <p className="text-sm font-semibold tracking-tight text-slate-900">Telegram</p>
                      </div>
                      <div className="mt-2.5">
                        {telegramLinked ? (
                          <button
                            type="button"
                            disabled
                            className="flex min-h-11 w-full cursor-default items-center justify-center rounded-xl border border-emerald-200/90 bg-emerald-50/95 px-2 py-2.5 text-center text-xs font-semibold text-emerald-800 shadow-sm"
                            aria-label="Telegram привязан"
                          >
                            Telegram привязан ✅
                          </button>
                        ) : (
                          <Link
                            to="/profile/edit?focus=phone"
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#26A5E4] px-2 py-2.5 text-center text-xs font-semibold text-white shadow-md shadow-sky-500/25 transition hover:bg-[#2298d4] hover:shadow-lg hover:shadow-sky-500/30"
                          >
                            Привязать Telegram
                          </Link>
                        )}
                      </div>
                      {!telegramLinked && (
                        <p className="prose-ru mx-auto mt-3 max-w-[19rem] text-center text-[10px] leading-snug text-[#6B7280] sm:max-w-[20rem] sm:text-[11px] sm:leading-snug">
                          Привяжите Telegram для доступа к закрытым акциям
                          <br />
                          и бонус 200 баллов.
                        </p>
                      )}
                    </div>

                    <div className="flex min-h-0 min-w-0 flex-col pl-2 sm:pl-3 md:pl-5">
                      {/* Telegram 열과 동일: 아이콘+제목 한 줄, 버튼 한 줄, (선택) 짧은 안내만 */}
                      <div className="flex items-center justify-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow-sm ring-1 ring-slate-200/80">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                        </span>
                        <p className="text-sm font-semibold tracking-tight text-slate-900">E-mail</p>
                      </div>
                      <div className="mt-2.5">
                        {!initialized ? (
                          <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200/70" aria-hidden />
                        ) : isEmailConfirmed ? (
                          <button
                            type="button"
                            disabled
                            className="flex min-h-11 w-full cursor-default items-center justify-center whitespace-nowrap rounded-xl border border-emerald-200/90 bg-emerald-50/95 px-2 py-2.5 text-center text-[11px] font-semibold leading-none text-emerald-800 shadow-sm sm:text-xs"
                            aria-label="Email подтверждён"
                          >
                            Email подтверждён ✅
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={verifyEmailSending}
                            onClick={() => void handleSendProfileVerifyEmail()}
                            className="flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-xl bg-slate-800 px-2 py-2.5 text-center text-[11px] font-semibold leading-none text-white shadow-md shadow-slate-900/20 transition hover:bg-slate-900 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
                          >
                            {verifyEmailSending ? 'Отправка…' : 'Подтвердить email'}
                          </button>
                        )}
                      </div>
                      {initialized && !isEmailConfirmed && (
                        <p className="prose-ru mx-auto mt-3 max-w-[19rem] text-center text-[10px] leading-snug text-[#6B7280] sm:max-w-[20rem] sm:text-[11px]">
                          Подтвердите email для оформления заказа.
                        </p>
                      )}
                    </div>
                  </div>
                  {verifyEmailError && (
                    <p className="prose-ru mt-3 border-t border-slate-200/50 pt-3 text-xs text-red-700" role="alert">
                      {verifyEmailError}
                    </p>
                  )}
                  {verifyEmailMessage && (
                    <p
                      className={`prose-ru text-xs text-slate-600 ${verifyEmailError ? 'mt-1.5' : 'mt-3 border-t border-slate-200/50 pt-3'}`}
                      role="status"
                    >
                      {verifyEmailMessage}
                    </p>
                  )}
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
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Доставка</h2>
            <div className="space-y-4">
              <AddressSuggest
                label={
                  <span className="inline-flex items-center gap-2">
                    Адрес (поиск по базе)
                    <span className="group relative ml-0.5 inline-flex cursor-help" aria-label="Подсказка">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 text-xs font-medium transition hover:border-brand hover:text-brand">
                        ?
                      </span>
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-[220px] -translate-x-1/2 rounded px-2.5 py-1.5 text-xs font-medium leading-snug text-brand bg-white shadow-md border border-slate-100 opacity-0 transition group-hover:opacity-100">
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

              <div className="space-y-4 rounded-xl border border-brand/20 bg-brand-soft/10 px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="pe-fio-last" className={labelClass}>Фамилия</label>
                    <input id="pe-fio-last" type="text" placeholder="Ivanov" className={inputClass} {...inputProps('fioLast')} />
                  </div>
                  <div>
                    <label htmlFor="pe-fio-first" className={labelClass}>Имя</label>
                    <input id="pe-fio-first" type="text" placeholder="Ivan" className={inputClass} {...inputProps('fioFirst')} />
                  </div>
                  <div>
                    <label htmlFor="pe-fio-middle" className={labelClass}>Отчество</label>
                    <input id="pe-fio-middle" type="text" placeholder="Ivanovich" className={inputClass} {...inputProps('fioMiddle')} disabled={noPatronymic} />
                    <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                      <input type="checkbox" checked={noPatronymic} onChange={(e) => { const v = e.target.checked; setNoPatronymic(v); if (v) handleChange('fioMiddle', ''); }} className="h-3 w-3 rounded border-slate-300 text-brand focus:ring-brand" />
                      <span>Нет отчества</span>
                    </label>
                  </div>
                </div>
                <p className={`${fieldHintSpacing} ${hintClass}`}>* ФИО как в паспорте (латинскими буквами).</p>

                <div>
                  <label htmlFor="pe-phone" className={labelClass}>Номер телефона</label>
                  <div className="flex min-w-0 flex-row items-stretch gap-2">
                    <input
                      ref={phoneInputRef}
                      id="pe-phone"
                      type="tel"
                      placeholder="+7 999 999 9999"
                      className={`min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:px-4 ${telegramLinked ? 'cursor-default !bg-slate-200 text-slate-600' : ''}`}
                      value={form?.phone ?? ''}
                      onChange={editing && !telegramLinked ? handlePhoneChange : undefined}
                      readOnly={!editing || telegramLinked}
                    />
                    {telegramLinked ? (
                      <div className="flex shrink-0 flex-col justify-center gap-1 sm:flex-row sm:items-center">
                        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-2 text-center text-[11px] font-medium leading-tight text-sky-700 sm:px-3 sm:text-xs">Telegram привязан</span>
                        {editing && (
                          <button type="button" onClick={handleUnlinkToChangePhone} className="whitespace-nowrap text-center text-[11px] font-medium text-sky-600 underline hover:text-sky-800 sm:text-xs">
                            Изменить номер
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleTelegramVerify}
                        disabled={!editing}
                        className="shrink-0 self-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-2 text-center text-[11px] font-medium leading-snug text-slate-700 transition hover:bg-sky-100 disabled:opacity-60 sm:max-w-[9.5rem] sm:px-3 sm:text-xs"
                      >
                        Подтвердить в Telegram
                      </button>
                    )}
                  </div>
                  <p className={`${fieldHintSpacing} ${hintClass}`}>* Телефон подтверждается через Telegram, за подтверждение +200 баллов.</p>
                  {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
                </div>

                <div>
                  <label htmlFor="pe-city" className={labelClass}>Город / Регион</label>
                  <input id="pe-city" type="text" placeholder="Москва, Санкт-Петербург" className={inputClass} {...inputProps('cityRegion')} />
                </div>
                <div>
                  <label htmlFor="pe-street" className={labelClass}>Улица, Дом, Корпус</label>
                  <input id="pe-street" type="text" placeholder="ул. Арбат, д. 15, корп. 2" className={inputClass} {...inputProps('streetHouse')} />
                </div>
                <div>
                  <label htmlFor="pe-apt" className={labelClass}>Кв. / Офис</label>
                  <input id="pe-apt" type="text" placeholder="кв. 104" className={inputClass} {...inputProps('apartmentOffice')} />
                </div>
                <div>
                  <label htmlFor="pe-postcode" className={labelClass}>Postcode <span className={hintClass}>(индекс, 6 цифр)</span></label>
                  <input id="pe-postcode" type="text" placeholder="123456" maxLength={6} className={inputClass} {...inputProps('postcode')} />
                </div>
                <div>
                  <label htmlFor="pe-inn" className={`${labelClass} inline-flex items-center gap-1`}>INN <span className={hintClass}>(12 цифр)</span> <InnHelpTooltip /></label>
                  <input id="pe-inn" type="text" placeholder="12 цифр" maxLength={12} className={inputClass} {...inputProps('inn')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="pe-ps" className={labelClass}>Серия паспорта</label>
                    <input id="pe-ps" type="text" placeholder="1234" maxLength={4} className={inputClass} {...inputProps('passportSeries')} />
                  </div>
                  <div>
                    <label htmlFor="pe-pn" className={labelClass}>Номер паспорта</label>
                    <input id="pe-pn" type="text" placeholder="567890" maxLength={6} className={inputClass} {...inputProps('passportNumber')} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {!editing ? (
            <button type="button" onClick={() => { setSaveError(null); setInitialForm(form); setEditing(true); }} className="w-full rounded-full border border-slate-200 py-3.5 text-base font-medium text-slate-700 transition hover:border-brand hover:bg-brand-soft/10">Редактировать</button>
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

        <p className="mt-8 text-center">
          <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> Profile</Link>
        </p>

        {telegramLinkedToast && (
          <div className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-8" role="status" aria-live="polite">
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
