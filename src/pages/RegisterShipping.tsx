import React, { useState } from 'react';
import { InnHelpTooltip } from '../components/InnHelpTooltip';
import { CustomsPassportNotice } from '../components/CustomsPassportNotice';
import { clampDigits } from '../lib/digitsOnly';

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
  const a = digits.slice(0, 1), b = digits.slice(1, 4), c = digits.slice(4, 7), e = digits.slice(7, 11);
  if (e.length) return `+${a} ${b} ${c} ${e}`;
  if (c.length) return `+${a} ${b} ${c}`;
  if (b.length) return `+${a} ${b}`;
  return `+${a}`;
}

export const RegisterShipping: React.FC = () => {
  const [phoneValue, setPhoneValue] = useState('');

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Данные для доставки
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Укажите адрес и данные для таможенного оформления
        </p>
      </header>

      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        <section className="space-y-4">
          <div>
            <label htmlFor="cityRegion" className={labelClass}>
              Город / Регион <span className="text-brand">*</span>
            </label>
            <input
              id="cityRegion"
              type="text"
              placeholder="Москва, Санкт-Петербург"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="streetHouse" className={labelClass}>
              Улица, Дом, Корпус/Строение <span className="text-brand">*</span>
            </label>
            <input
              id="streetHouse"
              type="text"
              placeholder="ул. Арбат, д. 15, корп. 2"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="apartmentOffice" className={labelClass}>
              Кв. / Офис <span className="text-brand">*</span>
            </label>
            <input
              id="apartmentOffice"
              type="text"
              placeholder="кв. 104"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="postcode" className={labelClass}>
              Postcode <span className={hintClass}>(индекс, 6 цифр)</span>{' '}
              <span className="text-brand">*</span>
            </label>
            <input
              id="postcode"
              type="text"
              placeholder="123456"
              className={inputClass}
              maxLength={6}
              inputMode="numeric"
              autoComplete="off"
              required
              onChange={(e) => {
                e.target.value = clampDigits(e.target.value, 6);
              }}
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              Телефон <span className="text-brand">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+7 999 999 9999"
              className={inputClass}
              value={phoneValue}
              onChange={(e) => setPhoneValue(formatPhone(e.target.value))}
              maxLength={16}
              required
            />
          </div>
          <div>
            <label htmlFor="inn" className={`${labelClass} inline-flex items-center gap-1`}>
              INN <span className={hintClass}>(12 цифр)</span>{' '}
              <span className="text-brand">*</span>
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
              required
              onChange={(e) => {
                e.target.value = clampDigits(e.target.value, 12);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="passportSeries" className={labelClass}>
                Series <span className="text-brand">*</span>
              </label>
              <input
                id="passportSeries"
                type="text"
                placeholder="1234"
                className={inputClass}
                maxLength={4}
                inputMode="numeric"
                autoComplete="off"
                required
                onChange={(e) => {
                  e.target.value = clampDigits(e.target.value, 4);
                }}
              />
            </div>
            <div>
              <label htmlFor="passportNumber" className={labelClass}>
                Number <span className="text-brand">*</span>
              </label>
              <input
                id="passportNumber"
                type="text"
                placeholder="567890"
                className={inputClass}
                maxLength={6}
                inputMode="numeric"
                autoComplete="off"
                required
                onChange={(e) => {
                  e.target.value = clampDigits(e.target.value, 6);
                }}
              />
            </div>
          </div>
        </section>
        <CustomsPassportNotice />
        <button
          type="submit"
          className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white transition hover:bg-brand/90"
        >
          Сохранить
        </button>
      </form>
    </main>
  );
};
