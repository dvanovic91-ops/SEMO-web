import React, { useMemo, useRef, useState } from 'react';
import { InnHelpTooltip } from '../components/InnHelpTooltip';
import { CustomsPassportNotice } from '../components/CustomsPassportNotice';
import { clampDigits } from '../lib/digitsOnly';
import { getRegisterShippingStrings } from '../lib/registerFormCopy';
import { useRegisterFormLang } from '../lib/registerFormLocale';

/**
 * OAuth 가입 후 배송 정보만 입력. 주소 세분화, INN 12자리+도움말, 우편 6자리.
 */
const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';
const hintClass = 'text-xs text-slate-500 font-normal';

function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.startsWith('8')) digits = '7' + digits.slice(1);
  else if (!digits.startsWith('7')) digits = '7' + digits;
  const a = digits.slice(0, 1),
    b = digits.slice(1, 4),
    c = digits.slice(4, 7),
    e = digits.slice(7, 11);
  if (e.length) return `+${a} ${b} ${c} ${e}`;
  if (c.length) return `+${a} ${b} ${c}`;
  if (b.length) return `+${a} ${b}`;
  return `+${a}`;
}

export const RegisterShipping: React.FC = () => {
  const registerLang = useRegisterFormLang();
  const t = useMemo(() => getRegisterShippingStrings(registerLang), [registerLang]);
  const [phoneValue, setPhoneValue] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cityRef = useRef<HTMLInputElement>(null);
  const streetRef = useRef<HTMLInputElement>(null);
  const aptRef = useRef<HTMLInputElement>(null);
  const postcodeRef = useRef<HTMLInputElement>(null);
  const innRef = useRef<HTMLInputElement>(null);
  const seriesRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const city = cityRef.current?.value.trim() ?? '';
    const street = streetRef.current?.value.trim() ?? '';
    const apt = aptRef.current?.value.trim() ?? '';
    const postcodeDigits = (postcodeRef.current?.value ?? '').replace(/\D/g, '');
    const innDigits = (innRef.current?.value ?? '').replace(/\D/g, '');
    const seriesDigits = (seriesRef.current?.value ?? '').replace(/\D/g, '');
    const numberDigits = (numberRef.current?.value ?? '').replace(/\D/g, '');
    const phoneDigits = phoneValue.replace(/\D/g, '');

    if (!city || !street || !apt) {
      setSubmitError(t.errFillRequired);
      return;
    }
    if (postcodeDigits.length !== 6) {
      setSubmitError(t.errPostcode6);
      return;
    }
    if (phoneDigits.length < 11 || !phoneDigits.startsWith('7')) {
      setSubmitError(t.errPhone);
      return;
    }
    if (innDigits.length !== 12) {
      setSubmitError(t.errInn12);
      return;
    }
    if (seriesDigits.length !== 4) {
      setSubmitError(t.errPassportSeries4);
      return;
    }
    if (numberDigits.length !== 6) {
      setSubmitError(t.errPassportNumber6);
      return;
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{t.subtitle}</p>
      </header>

      <form
        className="space-y-6"
        noValidate
        lang={registerLang === 'ru' ? 'ru' : 'en'}
        onSubmit={handleSubmit}
      >
        <section className="space-y-4">
          <div>
            <label htmlFor="cityRegion" className={labelClass}>
              {t.cityRegion} <span className="text-brand">*</span>
            </label>
            <input
              ref={cityRef}
              id="cityRegion"
              type="text"
              placeholder={t.cityPh}
              className={inputClass}
              autoComplete="address-level2"
            />
          </div>
          <div>
            <label htmlFor="streetHouse" className={labelClass}>
              {t.street} <span className="text-brand">*</span>
            </label>
            <input
              ref={streetRef}
              id="streetHouse"
              type="text"
              placeholder={t.streetPh}
              className={inputClass}
              autoComplete="street-address"
            />
          </div>
          <div>
            <label htmlFor="apartmentOffice" className={labelClass}>
              {t.apt} <span className="text-brand">*</span>
            </label>
            <input
              ref={aptRef}
              id="apartmentOffice"
              type="text"
              placeholder={t.aptPh}
              className={inputClass}
              autoComplete="address-line2"
            />
          </div>
          <div>
            <label htmlFor="postcode" className={labelClass}>
              {t.postcode} <span className={hintClass}>{t.postcodeHint}</span>{' '}
              <span className="text-brand">*</span>
            </label>
            <input
              ref={postcodeRef}
              id="postcode"
              type="text"
              placeholder="123456"
              className={inputClass}
              maxLength={6}
              inputMode="numeric"
              autoComplete="postal-code"
              onChange={(e) => {
                e.target.value = clampDigits(e.target.value, 6);
              }}
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              {t.phone} <span className="text-brand">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+7 999 999 9999"
              className={inputClass}
              value={phoneValue}
              onChange={(e) => setPhoneValue(formatPhone(e.target.value))}
              maxLength={16}
              autoComplete="tel"
            />
          </div>
          <div>
            <label htmlFor="inn" className={`${labelClass} inline-flex items-center gap-1`}>
              {t.inn} <span className={hintClass}>{t.innHint}</span>{' '}
              <span className="text-brand">*</span>
              <InnHelpTooltip locale={registerLang} />
            </label>
            <input
              ref={innRef}
              id="inn"
              type="text"
              placeholder={t.innPh}
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
              <label htmlFor="passportSeries" className={labelClass}>
                {t.passportSeries} <span className="text-brand">*</span>
              </label>
              <input
                ref={seriesRef}
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
              <label htmlFor="passportNumber" className={labelClass}>
                {t.passportNumber} <span className="text-brand">*</span>
              </label>
              <input
                ref={numberRef}
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
        </section>
        <CustomsPassportNotice locale={registerLang} />
        {submitError ? (
          <p className="text-center text-sm font-medium text-red-600" role="alert">
            {submitError}
          </p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white transition hover:bg-brand/90"
        >
          {t.save}
        </button>
      </form>
    </main>
  );
};
