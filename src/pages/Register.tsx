import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { InnHelpTooltip } from '../components/InnHelpTooltip';

/**
 * 회원가입 — 기본인적 / 배송(주소 세분화). 이메일 인증 구조, 전화 포맷, INN/우편 제한.
 */
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';
const hintClass = 'text-xs text-slate-500 font-normal';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [phoneValue, setPhoneValue] = useState('');

  const handleEmailBlur = () => {
    if (!email) {
      setEmailError(false);
      return;
    }
    setEmailError(!emailRegex.test(email));
  };

  const handleSendCode = () => {
    if (!email || !emailRegex.test(email)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    setCodeSent(true);
    // TODO: 백엔드에 인증 메일 발송 요청
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneValue(formatPhone(e.target.value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && !emailRegex.test(email)) {
      setEmailError(true);
      return;
    }
    if (email) {
      try {
        localStorage.setItem('userEmail', email);
      } catch (_) {}
    }
    // TODO: submit to backend
  };

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Регистрация
        </h1>
      </header>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Basic information
          </h2>
          <div className="space-y-4">
            {/* 이메일 + 인증코드 구조: 형식 검사, 인증 통과 전 다음 단계 막기 */}
            <div>
              <label htmlFor="email" className={labelClass}>
                Email <span className={hintClass}>(логин)</span>{' '}
                <span className="text-brand">*</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
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
                <button
                  type="button"
                  onClick={handleSendCode}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-700 transition hover:border-brand hover:text-brand"
                >
                  {codeSent ? 'Отправлено' : 'Код'}
                </button>
              </div>
              {emailError && (
                <p className="mt-1 text-xs text-red-500">
                  Введите корректный адрес email.
                </p>
              )}
              {codeSent && (
                <div className="mt-2">
                  <label htmlFor="emailCode" className="mb-1 block text-xs text-slate-500">
                    Код из письма
                  </label>
                  <input
                    id="emailCode"
                    type="text"
                    placeholder="Введите код"
                    className={inputClass}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    maxLength={6}
                  />
                </div>
              )}
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                Password <span className={hintClass}>(пароль)</span>{' '}
                <span className="text-brand">*</span>
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                className={inputClass}
                required
              />
            </div>
            {/* 성·이름·부칭 — 모바일에서 세로 배치, 라벨 줄바꿈 허용 */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3 sm:items-end">
              <div className="flex flex-col">
                <label htmlFor="lastName" className={`${labelClass} flex flex-wrap items-center gap-x-1`}>
                  Last name <span className={hintClass}>(фамилия)</span>{' '}
                  <span className="text-brand">*</span>
                </label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Ivanov"
                  className={inputClass}
                  pattern="[A-Za-z\s\-']+"
                  title="Only Latin letters"
                  required
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="firstName" className={`${labelClass} flex flex-wrap items-center gap-x-1`}>
                  First name <span className={hintClass}>(имя)</span>{' '}
                  <span className="text-brand">*</span>
                </label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Ivan"
                  className={inputClass}
                  pattern="[A-Za-z\s\-']+"
                  title="Only Latin letters"
                  required
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="patronymic" className={`${labelClass} flex flex-wrap items-center gap-x-1`}>
                  Patronymic <span className={hintClass}>(отчество)</span>
                </label>
                <input
                  id="patronymic"
                  type="text"
                  placeholder="Ivanovich"
                  className={inputClass}
                  pattern="[A-Za-z\s\-']+"
                  title="Only Latin letters"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Укажите как в паспорте.
            </p>
            <div>
              <p className={`${labelClass} mb-2`}>
                Gender <span className={hintClass}>(пол)</span>
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
            {/* 휴대폰: +7 999 999 9999, 숫자만 */}
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone number <span className={hintClass}>(телефон)</span>
              </label>
              <input
                id="phone"
                type="tel"
                placeholder="+7 999 999 9999"
                className={inputClass}
                value={phoneValue}
                onChange={handlePhoneChange}
                maxLength={16}
              />
            </div>
            <div>
              <label htmlFor="referrer" className={labelClass}>
                Referrer ID <span className={hintClass}>(код рекомендателя, необязательно)</span>
              </label>
              <input id="referrer" type="text" placeholder="Email или ID" className={inputClass} />
            </div>
          </div>
        </section>

        {/* 배송 — 주소 세분화: Город/Регион, Улица/Дом/Корпус, Кв/Офис */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Shipping <span className={hintClass}>(при заказе — обязательно)</span>
          </h2>
          <div className="space-y-4">
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
                pattern="[0-9]{0,6}"
                inputMode="numeric"
                autoComplete="off"
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
                pattern="[0-9]{0,12}"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="passportSeries" className={labelClass}>Series</label>
                <input
                  id="passportSeries"
                  type="text"
                  placeholder="1234"
                  className={inputClass}
                  maxLength={4}
                  pattern="[0-9]{0,4}"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="passportNumber" className={labelClass}>Number</label>
                <input
                  id="passportNumber"
                  type="text"
                  placeholder="567890"
                  className={inputClass}
                  maxLength={6}
                  pattern="[0-9]{0,6}"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Обязательно при оформлении заказа.
          </p>
        </section>

        <button
          type="submit"
          className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white transition hover:bg-brand/90"
        >
          Зарегистрироваться
        </button>
      </form>

      <p className="mt-6 text-center">
        <Link to="/login" className="text-sm text-slate-500 hover:text-slate-700">
          ← Уже есть аккаунт? Войти
        </Link>
      </p>
    </main>
  );
};
