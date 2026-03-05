import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getProfile, setProfile } from '../../lib/profileStorage';
import { InnHelpTooltip } from '../../components/InnHelpTooltip';
import { AddressSuggest } from '../../components/AddressSuggest';
import { BackArrow } from '../../components/BackArrow';
import { supabase } from '../../lib/supabase';

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

function loadSavedProfile(): Record<string, string> {
  try {
    const raw = localStorage.getItem('profileEdit');
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
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

  const { userEmail, userId, isLoggedIn, initialized } = useAuth();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [initialForm, setInitialForm] = useState<Record<string, string> | null>(null);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [passwordSection, setPasswordSection] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [noPatronymic, setNoPatronymic] = useState(false);

  /** 페이지 진입 시 세션 재검사 — 없으면 로그인으로 보냄 */
  const [sessionChecked, setSessionChecked] = useState(false);
  const [redirectToLogin, setRedirectToLogin] = useState(false);
  /** Telegram 연동 성공 시 토스트 (연동 되었습니다) */
  const [telegramLinkedToast, setTelegramLinkedToast] = useState(false);
  /** Telegram 링크 열린 뒤 연동 완료 감지용 폴링 */
  const [pollingForTelegram, setPollingForTelegram] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const safeUserEmail = userEmail ?? '';
  const profile = safeUserEmail ? getProfile(safeUserEmail) : null;
  const safeName = profile?.name ?? (safeUserEmail ? safeUserEmail.split('@')[0] ?? '' : '');

  const loadProfileFromDb = useCallback(() => {
    if (!supabase || !userId) return;
    supabase
      .from('profiles')
      .select('name, phone, telegram_id, telegram_reward_given')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          const nextLinked = !!data?.telegram_id;
          setTelegramLinked((prev) => {
            if (prev === true && !nextLinked) console.warn('Telegram state changed! (ProfileEdit) — was linked, now unlinked. Check DB or network.');
            return nextLinked;
          });
          setForm((prev) => ({
            ...prev,
            name: data?.name ?? prev?.name ?? safeName,
            phone: data?.phone ?? prev?.phone ?? '',
          }));
        }
      })
      .catch(() => {});
  }, [userId, safeName]);

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

  useEffect(() => {
    if (!userId) return;
    loadProfileFromDb();
  }, [loadProfileFromDb, userId]);

  // focus=phone 이면 연동 목적 진입 → 편집 모드 자동 켜서 전화 입력·"Подтвердить в Telegram" 바로 사용 가능
  useEffect(() => {
    if (searchParams.get('focus') === 'phone') setEditing(true);
  }, [searchParams]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadProfileFromDb();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadProfileFromDb]);

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

  // 폼 초기값 — userEmail/profile 기반 (모든 훅은 위에서만 호출)
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      email: (safeUserEmail || prev?.email) ?? '',
      name: (prev?.name || safeName),
      fioLast: prev?.fioLast ?? '',
      fioFirst: prev?.fioFirst ?? '',
      fioMiddle: prev?.fioMiddle ?? '',
      cityRegion: prev?.cityRegion ?? '',
      streetHouse: prev?.streetHouse ?? '',
      apartmentOffice: prev?.apartmentOffice ?? '',
      postcode: prev?.postcode ?? '',
      inn: prev?.inn ?? '',
      passportSeries: prev?.passportSeries ?? '',
      passportNumber: prev?.passportNumber ?? '',
    }));
  }, [safeUserEmail, safeName]);

  // 개인정보창 진입 시 localStorage(profileEdit)에서 배송 데이터 로드 — ФИО는 항상 대문자로, 부칭 없음 체크 유지
  useEffect(() => {
    const saved = loadSavedProfile();
    if (Object.keys(saved).length === 0) return;
    const up = (s: string) => (s ?? '').replace(/[^A-Za-z\s-']/g, '').toUpperCase();
    const fioMiddleVal = up(saved.fioMiddle ?? '');
    setNoPatronymic(!fioMiddleVal.trim());
    setForm((prev) => ({
      ...prev,
      ...saved,
      fioLast: up(saved.fioLast ?? prev?.fioLast ?? ''),
      fioFirst: up(saved.fioFirst ?? prev?.fioFirst ?? ''),
      fioMiddle: fioMiddleVal,
    }));
  }, []);

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
    let next = value ?? '';
    if (key === 'fioLast' || key === 'fioFirst' || key === 'fioMiddle') next = normalizeLatin(next).toUpperCase();
    setForm((prev) => ({ ...prev, [key]: next }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneError('');
    handleChange('phone', formatPhone(e.target.value ?? ''));
  };

  const handleSave = async () => {
    try {
      if (form?.name && profile) {
        setProfile(safeUserEmail, { ...profile, name: form.name, grade: profile?.grade ?? 'Обычный участник', points: profile?.points ?? 0 });
      }
      if (supabase && userId) {
        const payload: { name?: string | null; phone?: string | null } = {};
        if (form?.name !== undefined) payload.name = form.name || null;
        if (form?.phone !== undefined) payload.phone = form.phone || null;
        if (Object.keys(payload).length > 0) {
          await supabase.from('profiles').update(payload).eq('id', userId);
        }
      }
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // 결제 화면에서도 동일한 배송·부칭 정보 쓰도록 localStorage(profileEdit)에 저장
      try {
        const saved = loadSavedProfile();
        localStorage.setItem('profileEdit', JSON.stringify({ ...saved, ...form }));
      } catch {
        // ignore
      }
    } catch {
      // ignore
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
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
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
              <div>
                <label htmlFor="pe-email" className={labelClass}>Email</label>
                <input
                  id="pe-email"
                  type="email"
                  className={`${inputClass} cursor-default bg-slate-50`}
                  value={form?.email ?? ''}
                  readOnly
                />
              </div>

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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      ref={phoneInputRef}
                      id="pe-phone"
                      type="tel"
                      placeholder="+7 999 999 9999"
                      className={`${inputClass} sm:flex-1 ${telegramLinked ? 'cursor-default !bg-slate-200 text-slate-600' : ''}`}
                      value={form?.phone ?? ''}
                      onChange={editing && !telegramLinked ? handlePhoneChange : undefined}
                      readOnly={!editing || telegramLinked}
                    />
                    {telegramLinked ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-700">Telegram привязан</span>
                        {editing && <button type="button" onClick={handleUnlinkToChangePhone} className="text-xs font-medium text-sky-600 underline hover:text-sky-800">Изменить номер</button>}
                      </div>
                    ) : (
                      <button type="button" onClick={handleTelegramVerify} disabled={!editing} className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium text-slate-700 transition hover:bg-sky-100 disabled:opacity-60">Подтвердить в Telegram</button>
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
            <button type="button" onClick={() => { setInitialForm(form); setEditing(true); }} className="w-full rounded-full border border-slate-200 py-3.5 text-base font-medium text-slate-700 transition hover:border-brand hover:bg-brand-soft/10">Редактировать</button>
          ) : (
            isDirty && (
              <button type="button" onClick={handleSave} className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white transition hover:bg-brand/90">{saved ? 'Сохранено' : 'Сохранить'}</button>
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
      </main>
    </ProfileEditErrorBoundary>
  );
};
