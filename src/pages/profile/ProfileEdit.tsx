import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getProfile, setProfile } from '../../lib/profileStorage';
import { InnHelpTooltip } from '../../components/InnHelpTooltip';
import { AddressSuggest } from '../../components/AddressSuggest';
import { supabase } from '../../lib/supabase';

/**
 * 프로필 수정 — 기본 인적/배송 정보 보기·수정, 수정하기 버튼으로 편집 모드, 비밀번호 변경.
 */
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';
const hintClass = 'text-[11px] text-slate-500 font-normal';

function formatPhone(value: string): string {
  // 회원가입/배송 입력과 동일한 형식: +7 999 999 9999
  let digits = value.replace(/\D/g, '').slice(0, 11);
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
  // 여권용 FIO: 라틴 문자, пробел, -, ' 만 허용
  return value.replace(/[^A-Za-z\s-']/g, '');
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

  const profile = userEmail ? getProfile(userEmail) : null;

  // DB에서 프로필 로드 (개인정보 새로고침 버튼에서도 호출)
  const loadProfileFromDb = useCallback(() => {
    if (!supabase || !userId) return;
    supabase
      .from('profiles')
      .select('name, phone, telegram_id')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setTelegramLinked(!!data.telegram_id);
          setForm((prev) => ({
            ...prev,
            name: data.name ?? prev.name ?? (userEmail ? userEmail.split('@')[0] : ''),
            phone: data.phone ?? prev.phone ?? '',
          }));
        }
      })
      .catch(() => {});
  }, [userId, userEmail]);

  useEffect(() => {
    loadProfileFromDb();
  }, [loadProfileFromDb]);

  // Telegram 연동 후 다른 탭에서 돌아오면 DB에서 다시 불러와 연동 상태 반영
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadProfileFromDb();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadProfileFromDb]);

  if (!initialized) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8">
        <p className="text-center text-sm text-slate-500">Загрузка…</p>
      </main>
    );
  }
  if (!isLoggedIn || !userEmail) return <Navigate to="/login" replace />;

  // 이메일·로컬 기본값만 채움. phone/연동 여부는 DB(loadProfileFromDb) 결과로만 덮어쓰도록 함.
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      email: userEmail ?? prev.email ?? '',
      name: prev.name || (profile?.name ?? (userEmail ? userEmail.split('@')[0] : '')),
      fioLast: prev.fioLast ?? '',
      fioFirst: prev.fioFirst ?? '',
      fioMiddle: prev.fioMiddle ?? '',
      cityRegion: prev.cityRegion ?? '',
      streetHouse: prev.streetHouse ?? '',
      apartmentOffice: prev.apartmentOffice ?? '',
      postcode: prev.postcode ?? '',
      inn: prev.inn ?? '',
      passportSeries: prev.passportSeries ?? '',
      passportNumber: prev.passportNumber ?? '',
    }));
  }, [userEmail, profile?.name]);

  // 인증 배너에서 넘어온 경우: 편집 모드 켜고 휴대폰 필드에 포커스
  useEffect(() => {
    if (!focusPhone || !form.email) return;
    setEditing(true);
    setInitialForm((prev) => prev ?? { ...form });
    const t = setTimeout(() => phoneInputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [focusPhone, form.email]);

  const isDirty = editing && initialForm !== null && JSON.stringify(form) !== JSON.stringify(initialForm);

  const handleChange = (key: string, value: string) => {
    let next = value;
    if (key === 'fioLast' || key === 'fioFirst' || key === 'fioMiddle') {
      next = normalizeLatin(next);
    }
    setForm((prev) => ({ ...prev, [key]: next }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneError('');
    handleChange('phone', formatPhone(e.target.value));
  };

  const handleSave = async () => {
    try {
      if (form.name && profile) {
        setProfile(userEmail, { ...profile, name: form.name, grade: profile.grade, points: profile.points });
      }
      if (supabase && userId) {
        await supabase
          .from('profiles')
          .update({ name: form.name ?? undefined, phone: form.phone || null })
          .eq('id', userId);
      }
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    }
  };
  const handleTelegramVerify = async () => {
    setPhoneError('');
    if (!form.phone) {
      setPhoneError('Укажите номер телефона.');
      return;
    }
    if (!supabase || !userId) return;
    try {
      // 프로필에 전화번호 저장
      await supabase.from('profiles').update({ phone: form.phone }).eq('id', userId);
      // 기존 Telegram 연동과 같은 토큰 방식 사용
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('link_tokens')
        .insert({ user_id: userId, expires_at: expiresAt })
        .select('token')
        .single();
      if (error || !data?.token) {
        setPhoneError('Не удалось создать ссылку для Telegram.');
        return;
      }
      const url = `https://t.me/My_SEMO_Beautybot?start=link_${data.token}`;
      window.open(url, '_blank');
    } catch {
      setPhoneError('Не удалось подтвердить номер. Попробуйте позже.');
    }
  };

  // 연동된 상태에서 휴대폰 번호 변경 시: 연동 해제 후 새 번호 입력·재연동
  const handleUnlinkToChangePhone = async () => {
    if (!supabase || !userId) return;
    setPhoneError('');
    try {
      await supabase
        .from('profiles')
        .update({ telegram_id: null, phone_verified: false })
        .eq('id', userId);
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
      ? { value: form[key] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleChange(key, e.target.value) }
      : { value: form[key] ?? '', readOnly: true, className: `${inputClass} cursor-default bg-slate-50` };

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="text-sm text-slate-500 hover:text-slate-700">
          ← Profile
        </Link>
      </p>

      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Редактировать профиль
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Основные данные и адрес доставки. Ниже — смена пароля.
        </p>
        <button
          type="button"
          onClick={loadProfileFromDb}
          className="mt-2 text-xs text-slate-500 underline hover:text-slate-700"
        >
          Обновить данные
        </button>
      </header>

      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        {/* 기본 인적 사항 */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Основные данные</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="pe-name" className={labelClass}>
                Имя
              </label>
              <input
                id="pe-name"
                type="text"
                placeholder="Имя для обращения"
                className={inputClass}
                {...inputProps('name')}
              />
            </div>
            <div>
              <label htmlFor="pe-email" className={labelClass}>
                Email
              </label>
              <input
                id="pe-email"
                type="email"
                className={`${inputClass} cursor-default bg-slate-50`}
                value={form.email ?? ''}
                readOnly
              />
            </div>

            {/* 비밀번호 변경 */}
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
                    <label htmlFor="pw-current" className={labelClass}>
                      Текущий пароль
                    </label>
                    <input
                      id="pw-current"
                      type="password"
                      className={inputClass}
                      placeholder="••••••••"
                      value={pwCurrent}
                      onChange={(e) => {
                        setPwCurrent(e.target.value);
                        setPwError('');
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="pw-new" className={labelClass}>
                      Новый пароль
                    </label>
                    <input
                      id="pw-new"
                      type="password"
                      className={inputClass}
                      placeholder="••••••••"
                      value={pwNew}
                      onChange={(e) => {
                        setPwNew(e.target.value);
                        setPwError('');
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="pw-confirm" className={labelClass}>
                      Повторите новый пароль
                    </label>
                    <input
                      id="pw-confirm"
                      type="password"
                      className={inputClass}
                      placeholder="••••••••"
                      value={pwConfirm}
                      onChange={(e) => {
                        setPwConfirm(e.target.value);
                        setPwError('');
                      }}
                    />
                  </div>
                  {pwError && <p className="text-sm text-red-600">{pwError}</p>}
                  {pwSuccess && <p className="text-sm text-green-600">Пароль успешно изменён.</p>}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setPwError('');
                        setPwSuccess(false);
                        if (!pwNew || pwNew.length < 6) {
                          setPwError('Новый пароль не менее 6 символов.');
                          return;
                        }
                        if (pwNew !== pwConfirm) {
                          setPwError('Пароли не совпадают.');
                          return;
                        }
                        if (!supabase) {
                          setPwError('Сервис недоступен.');
                          return;
                        }
                        const { error } = await supabase.auth.updateUser({ password: pwNew });
                        if (error) {
                          setPwError(
                            error.message === 'New password should be different from the old password.'
                              ? 'Новый пароль должен отличаться.'
                              : error.message,
                          );
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
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordSection(false);
                        setPwCurrent('');
                        setPwNew('');
                        setPwConfirm('');
                        setPwError('');
                        setPwSuccess(false);
                      }}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 배송 + 주소 자동완성 */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Доставка</h2>
          <div className="space-y-4">
            <AddressSuggest
              label={
                <span className="inline-flex items-center gap-2">
                  Адрес (поиск по базе)
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-brand text-[10px] text-brand cursor-help"
                    title="При вводе адреса нижние поля заполнятся автоматически."
                  >
                    ?
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
                  <label htmlFor="pe-fio-last" className={labelClass}>
                    Фамилия
                  </label>
                  <input
                    id="pe-fio-last"
                    type="text"
                    placeholder="Ivanov"
                    className={inputClass}
                    {...inputProps('fioLast')}
                  />
                </div>
                <div>
                  <label htmlFor="pe-fio-first" className={labelClass}>
                    Имя
                  </label>
                  <input
                    id="pe-fio-first"
                    type="text"
                    placeholder="Ivan"
                    className={inputClass}
                    {...inputProps('fioFirst')}
                  />
                </div>
                <div>
                  <label htmlFor="pe-fio-middle" className={labelClass}>
                    Отчество <span className={hintClass}>(если есть)</span>
                  </label>
                  <input
                    id="pe-fio-middle"
                    type="text"
                    placeholder="Ivanovich"
                    className={inputClass}
                    {...inputProps('fioMiddle')}
                  />
                </div>
              </div>
              <p className={hintClass}>* ФИО как в паспорте (латинскими буквами).</p>

              <div>
                <label htmlFor="pe-phone" className={labelClass}>
                  Номер телефона
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    ref={phoneInputRef}
                    id="pe-phone"
                    type="tel"
                    placeholder="+7 999 999 9999"
                    className={`${inputClass} sm:flex-1 ${telegramLinked ? 'cursor-default bg-slate-100 text-slate-500' : ''}`}
                    value={form.phone ?? ''}
                    onChange={editing && !telegramLinked ? handlePhoneChange : undefined}
                    readOnly={!editing || telegramLinked}
                  />
                  {telegramLinked ? (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-700">
                      Telegram привязан
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleTelegramVerify}
                      disabled={!editing}
                      className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-60"
                    >
                      Подтвердить в Telegram
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  * Телефон подтверждается через Telegram, за подтверждение +200 баллов.
                </p>
                {phoneError && <p className="mt-1 text-xs text-red-500">{phoneError}</p>}
              </div>

              <div>
                <label htmlFor="pe-city" className={labelClass}>
                  Город / Регион
                </label>
                <input
                  id="pe-city"
                  type="text"
                  placeholder="Москва, Санкт-Петербург"
                  className={inputClass}
                  {...inputProps('cityRegion')}
                />
              </div>
              <div>
                <label htmlFor="pe-street" className={labelClass}>
                  Улица, Дом, Корпус
                </label>
                <input
                  id="pe-street"
                  type="text"
                  placeholder="ул. Арбат, д. 15, корп. 2"
                  className={inputClass}
                  {...inputProps('streetHouse')}
                />
              </div>
              <div>
                <label htmlFor="pe-apt" className={labelClass}>
                  Кв. / Офис
                </label>
                <input
                  id="pe-apt"
                  type="text"
                  placeholder="кв. 104"
                  className={inputClass}
                  {...inputProps('apartmentOffice')}
                />
              </div>
              <div>
                <label htmlFor="pe-postcode" className={labelClass}>
                  Postcode <span className={hintClass}>(индекс, 6 цифр)</span>
                </label>
                <input
                  id="pe-postcode"
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  className={inputClass}
                  {...inputProps('postcode')}
                />
              </div>
              <div>
                <label htmlFor="pe-inn" className={`${labelClass} inline-flex items-center gap-1`}>
                  INN <span className={hintClass}>(12 цифр)</span> <InnHelpTooltip />
                </label>
                <input
                  id="pe-inn"
                  type="text"
                  placeholder="12 цифр"
                  maxLength={12}
                  className={inputClass}
                  {...inputProps('inn')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pe-ps" className={labelClass}>
                    Серия паспорта
                  </label>
                  <input
                    id="pe-ps"
                    type="text"
                    placeholder="1234"
                    maxLength={4}
                    className={inputClass}
                    {...inputProps('passportSeries')}
                  />
                </div>
                <div>
                  <label htmlFor="pe-pn" className={labelClass}>
                    Номер паспорта
                  </label>
                  <input
                    id="pe-pn"
                    type="text"
                    placeholder="567890"
                    maxLength={6}
                    className={inputClass}
                    {...inputProps('passportNumber')}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setInitialForm(form);
              setEditing(true);
            }}
            className="w-full rounded-full border border-slate-200 py-3.5 text-base font-medium text-slate-700 transition hover:border-brand hover:bg-brand-soft/10"
          >
            Редактировать
          </button>
        ) : (
          isDirty && (
            <button
              type="button"
              onClick={handleSave}
              className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white transition hover:bg-brand/90"
            >
              {saved ? 'Сохранено' : 'Сохранить'}
            </button>
          )
        )}
      </form>

      <p className="mt-8 text-center">
        <Link to="/profile" className="text-sm text-slate-500 hover:text-slate-700">
          ← Profile
        </Link>
      </p>
    </main>
  );
};

