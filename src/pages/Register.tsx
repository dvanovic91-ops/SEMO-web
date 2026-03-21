import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InnHelpTooltip } from '../components/InnHelpTooltip';
import { supabase } from '../lib/supabase';
import { AddressSuggest } from '../components/AddressSuggest';
import { BackArrow } from '../components/BackArrow';
import { useAuth } from '../context/AuthContext';
import { REGISTER_EMAIL_HINT_RU, isValidEmailFormat } from '../lib/emailValidation';
import { clampDigits } from '../lib/digitsOnly';
import { CustomsPassportNotice } from '../components/CustomsPassportNotice';

/**
 * 회원가입 — 기본인적 / 배송(주소 세분화). 이메일 인증 구조, 전화 포맷, INN/우편 제한.
 */
const inputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';
const hintClass = 'text-[11px] text-slate-500 font-normal';

function normalizeLatin(value: string): string {
  // 여권용 FIO: 라틴 문자, пробел, -, ' 만 허용
  return value.replace(/[^A-Za-z\s-']/g, '');
}

/** 전화 입력: 숫자만 추출 후 +7 999 999 9999 형식으로 포맷 */
function formatPhone(value: string): string {
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

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [phoneValue, setPhoneValue] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [nickname, setNickname] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fioLast, setFioLast] = useState('');
  const [fioFirst, setFioFirst] = useState('');
  const [fioMiddle, setFioMiddle] = useState('');
  const [noPatronymic, setNoPatronymic] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');

  const handleEmailBlur = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError(false);
      return;
    }
    setEmailError(!isValidEmailFormat(trimmed));
  };

  const handleSendCode = () => {
    // 이메일 인증 기능은 일단 비활성화 — 단순 로그인용 필드만 사용
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneValue(formatPhone(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const trimmedEmail = email.trim().toLowerCase();
    let hasError = false;
    if (!trimmedEmail) {
      setEmailError(true);
      hasError = true;
    } else if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError(true);
      hasError = true;
    }
    if (!password || password.length < 6) {
      setPasswordError(true);
      hasError = true;
    }
    if (!nickname.trim()) {
      hasError = true;
      setSubmitError('Укажите имя для обращения.');
    }
    if (hasError) return;

    if (!supabase) {
      setSubmitError('Сервис регистрации временно недоступен.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          // Подтверждение по ссылке из письма — после перехода личный кабинет
          emailRedirectTo: `${window.location.origin}/profile`,
          data: {
            nickname,
          },
        },
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        const code = (error as { code?: string | number })?.code;
        // 운영 환경 원인 추적용(사용자에게는 노출하지 않음)
        console.error('[Register] signUp failed', { code, message: error.message });
        if (msg.includes('invalid') && msg.includes('email')) {
          setSubmitError('Этот адрес электронной почты не принимается сервисом. Попробуйте другой адрес или свяжитесь с нами.');
        } else if (msg.includes('rate limit') || msg.includes('rate_limit')) {
          setSubmitError('Слишком много попыток. Подождите около часа и попробуйте снова.');
        } else if (msg.includes('email not confirmed') || msg.includes('confirmation') || msg.includes('smtp')) {
          setSubmitError('Регистрация временно недоступна: проблема с отправкой письма подтверждения. Проверьте настройки почты в сервисе и повторите попытку.');
        } else if (msg.includes('database') || msg.includes('saving new user')) {
          setSubmitError('Регистрация отклонена настройками базы данных. Требуется проверка серверных правил (триггер/политики профиля).');
        } else if (msg.includes('captcha')) {
          setSubmitError('Сервис попросил проверку безопасности (CAPTCHA). Обновите страницу и попробуйте снова.');
        } else if (msg.includes('signup is disabled')) {
          setSubmitError('Регистрация по email отключена в настройках сервиса.');
        } else if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already registered')) {
          setSubmitError('Этот email уже зарегистрирован. Если письмо подтверждения не пришло, проверьте почту и папку «Спам».');
        } else {
          setSubmitError(error.message || 'Не удалось завершить регистрацию.');
        }
        return;
      }

      // Сессия из signUp (Confirm email OFF) или вход паролем сразу после регистрации
      let session = data.session ?? null;
      if (!session && supabase) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (!signInErr && signInData.session) {
          session = signInData.session;
        }
      }

      if (session) {
        try {
          await applySession(session);
        } catch (e) {
          console.error('[Register] applySession', e);
          setSubmitError('Регистрация создана, но сессия не применилась. Войдите вручную.');
          return;
        }
        setToastMessage('Добро пожаловать!');
        window.setTimeout(() => setToastMessage(null), 2500);
        navigate('/', { replace: true });
        return;
      }

      // Confirm email ON в Supabase: вход только после ссылки в письме — подтверждение в личном кабинете
      setSubmitSuccess(
        'Аккаунт создан. Откройте письмо и перейдите по ссылке, затем войдите — или подтвердите email в личном кабинете.',
      );
      setToastMessage('Проверьте почту (папка «Спам»).');
      window.setTimeout(() => setToastMessage(null), 3500);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative mx-auto min-w-0 max-w-4xl px-3 py-8 sm:px-10 sm:py-16">
      {toastMessage && (
        <div
          className="fixed right-4 top-20 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Регистрация
        </h1>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Основные данные
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className={labelClass}>
                Email <span className="text-brand">*</span>
              </label>
              <input
                id="email"
                type="email"
                placeholder="example@mail.ru"
                className={`${inputClass} ${emailError ? 'border-red-400' : ''}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(false);
                }}
                onBlur={handleEmailBlur}
                required
              />
              <span className="prose-ru mt-1 block text-xs text-red-500">
                Используйте реальный e-mail. Без подтверждения заказ невозможен, а перенос бонусов на другой аккаунт запрещен.
              </span>
              {emailError && (
                <p className="mt-1 text-xs text-red-500">
                  Введите корректный адрес: латиница, цифры и . _ % + - до @; домен как mail.ru или semo-box.ru.
                </p>
              )}
              <p className="prose-ru mt-1.5 min-w-0 text-[11px] leading-snug text-slate-500 sm:text-xs">
                {REGISTER_EMAIL_HINT_RU}
              </p>
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                Пароль
                <span className="text-brand">*</span>
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                className={`${inputClass} ${passwordError ? 'border-red-400' : ''}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(false);
                }}
                required
              />
            </div>
            {/* 닉네임 — 서비스에서 불러줄 이름 */}
            <div>
              <label htmlFor="nickname" className={labelClass}>
                Имя <span className="text-brand">*</span>
              </label>
              <input
                id="nickname"
                type="text"
                placeholder="Например, Анна"
                className={inputClass}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
              />
            </div>
            <div>
              <p className={`${labelClass} mb-2`}>
                Пол
              </p>
              <div className="flex gap-6">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="gender" value="M" className="h-4 w-4 border-slate-300 text-brand focus:ring-brand" />
                  <span className="text-sm text-slate-700">Мужской</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="gender" value="F" className="h-4 w-4 border-slate-300 text-brand focus:ring-brand" />
                  <span className="text-sm text-slate-700">Женский</span>
                </label>
              </div>
            </div>
            <div>
              <label htmlFor="referrer" className={labelClass}>
                Email рекомендателя
              </label>
              <input
                id="referrer"
                type="email"
                placeholder="recommender@mail.ru"
                className={inputClass}
              />
              <p className={hintClass}>
                * электронная почта человека, который порекомендовал вас
              </p>
            </div>
          </div>
        </section>

        {/* 배송 — 주소 세분화: Город/Регион, Улица/Дом/Корпус, Кв/Офис */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Доставка <span className={hintClass}>(при заказе — обязательно)</span>
          </h2>
          <div className="space-y-4">
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
                const cityEl = document.getElementById('cityRegion') as HTMLInputElement | null;
                const streetEl = document.getElementById('streetHouse') as HTMLInputElement | null;
                const aptEl = document.getElementById('apartmentOffice') as HTMLInputElement | null;
                const postEl = document.getElementById('postcode') as HTMLInputElement | null;
                if (cityRegion !== undefined && cityEl) cityEl.value = cityRegion;
                if (streetHouse !== undefined && streetEl) streetEl.value = streetHouse;
                if (apartmentOffice !== undefined && aptEl) aptEl.value = apartmentOffice;
                if (postcode !== undefined && postEl) postEl.value = postcode;
              }}
            />
            <div className="space-y-4 rounded-xl border border-brand/20 bg-brand-soft/10 px-4 py-4">
            <div>
              <label htmlFor="cityRegion" className={labelClass}>
                Город / Регион
              </label>
              <input
                id="cityRegion"
                type="text"
                placeholder="Москва, Санкт-Петербург"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="streetHouse" className={labelClass}>
                Улица, Дом, Корпус/Строение
              </label>
              <input
                id="streetHouse"
                type="text"
                placeholder="ул. Арбат, д. 15, корп. 2"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="apartmentOffice" className={labelClass}>
                Кв. / Офис
              </label>
              <input
                id="apartmentOffice"
                type="text"
                placeholder="кв. 104"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="postcode" className={labelClass}>
                Postcode <span className={hintClass}>(индекс, 6 цифр)</span>
              </label>
              <input
                id="postcode"
                type="text"
                placeholder="123456"
                className={inputClass}
                maxLength={6}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => {
                  e.target.value = clampDigits(e.target.value, 6);
                }}
              />
            </div>
            <div>
              <label htmlFor="inn" className={`${labelClass} inline-flex items-center gap-1`}>
                INN <span className={hintClass}>(ИНН, 12 цифр)</span>
                <InnHelpTooltip />
              </label>
              <input
                id="inn"
                type="text"
                placeholder="12 цифр"
                className={inputClass}
                maxLength={12}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => {
                  e.target.value = clampDigits(e.target.value, 12);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="passportSeries" className={labelClass}>Серия паспорта</label>
                <input
                  id="passportSeries"
                  type="text"
                  placeholder="1234"
                  className={inputClass}
                  maxLength={4}
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(e) => {
                    e.target.value = clampDigits(e.target.value, 4);
                  }}
                />
              </div>
              <div>
                <label htmlFor="passportNumber" className={labelClass}>Номер паспорта</label>
                <input
                  id="passportNumber"
                  type="text"
                  placeholder="567890"
                  className={inputClass}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(e) => {
                    e.target.value = clampDigits(e.target.value, 6);
                  }}
                />
              </div>
            </div>
            <CustomsPassportNotice />
            {/* ФИО для доставки — 참고용, 필수 아님 */}
            {/* items-start: 세 열 라벨·인풋 상단 정렬 (부칭 열에만 체크박스가 있어 items-end 시 높이 어긋남) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3 sm:items-start">
              <div className="flex min-h-0 flex-col">
                <label htmlFor="lastName" className={`${labelClass} flex flex-wrap items-center gap-x-1`}>
                  Фамилия
                </label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Ivanov"
                  className={`${inputClass} uppercase`}
                  value={fioLast}
                  onChange={(e) => setFioLast(normalizeLatin(e.target.value).toUpperCase())}
                />
              </div>
              <div className="flex min-h-0 flex-col">
                <label htmlFor="firstName" className={`${labelClass} flex flex-wrap items-center gap-x-1`}>
                  Имя
                </label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Ivan"
                  className={`${inputClass} uppercase`}
                  value={fioFirst}
                  onChange={(e) => setFioFirst(normalizeLatin(e.target.value).toUpperCase())}
                />
              </div>
              <div className="flex min-h-0 flex-col">
                <label htmlFor="patronymic" className={`${labelClass} flex flex-wrap items-center gap-x-1`}>
                  Отчество
                </label>
                <input
                  id="patronymic"
                  type="text"
                  placeholder="Ivanovich"
                  className={`${inputClass} uppercase disabled:bg-slate-50 disabled:text-slate-400`}
                  value={fioMiddle}
                  onChange={(e) => setFioMiddle(normalizeLatin(e.target.value).toUpperCase())}
                  disabled={noPatronymic}
                />
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:grid sm:grid-cols-3 sm:items-center sm:gap-x-3 sm:gap-y-0">
              <p className="min-w-0 max-w-full text-[11px] leading-snug text-slate-500 sm:col-span-2">
                * ФИО как в паспорте (латинскими буквами).
              </p>
              <label className="inline-flex w-fit shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-slate-500 sm:justify-self-end">
                <input type="checkbox" checked={noPatronymic} onChange={(e) => { const v = e.target.checked; setNoPatronymic(v); if (v) setFioMiddle(''); }} className="h-3 w-3 rounded border-slate-300 text-brand focus:ring-brand" />
                <span className="whitespace-nowrap">Нет отчества</span>
              </label>
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Номер телефона
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="phone"
                  type="tel"
                  placeholder="+7 999 999 9999"
                  className={`${inputClass} sm:flex-1`}
                  value={phoneValue}
                  onChange={handlePhoneChange}
                  maxLength={16}
                />
                <button
                  type="button"
                  disabled={phoneValue.replace(/\D/g, '').length < 10}
                  className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-full border border-brand/35 bg-brand-soft px-4 py-2 text-xs font-medium text-brand transition hover:bg-brand-soft/80 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  Подтвердить в Telegram
                </button>
              </div>
              <p className="prose-ru mt-1 text-[11px] leading-snug text-slate-500">
                * Подтверждается через Telegram, за подтверждение +200 баллов.
              </p>
            </div>
            <div>
              <label htmlFor="delivery-email" className={labelClass}>
                E-mail
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <input
                  id="delivery-email"
                  type="email"
                  readOnly
                  value={email}
                  className={`${inputClass} cursor-default bg-slate-50 sm:flex-1`}
                  autoComplete="email"
                />
                <button
                  type="button"
                  disabled
                  title="После регистрации откройте письмо и перейдите по ссылке"
                  className="inline-flex min-h-11 w-full shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-brand/35 bg-brand-soft px-4 py-2 text-xs font-medium text-brand opacity-70 sm:w-auto"
                >
                  Подтвердить email
                </button>
              </div>
              <p className="prose-ru mt-1 text-[11px] leading-snug text-slate-500">
                * Тот же email, что выше. После регистрации — подтверждение по ссылке из письма.
              </p>
            </div>
            </div>
          </div>
          {/* 하단 안내 문구는 제거 — 화면을 더 간결하게 유지 */}
        </section>

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full rounded-full bg-brand py-3 text-base font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
        >
          {submitting ? 'Регистрация…' : 'Зарегистрироваться'}
        </button>
        {submitError && (
          <p className="mt-2 text-sm text-red-500">
            {submitError}
          </p>
        )}
        {submitSuccess && (
          <div className="mt-3 text-sm leading-snug text-emerald-800" role="status">
            <p>{submitSuccess}</p>
            <Link
              to="/login"
              className="mt-2 inline-flex font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:opacity-90"
            >
              Перейти к входу
            </Link>
          </div>
        )}
      </form>

      <p className="mt-6 text-center">
        <Link to="/login" className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
          <BackArrow /> Уже есть аккаунт? Войти
        </Link>
      </p>
    </main>
  );
};
