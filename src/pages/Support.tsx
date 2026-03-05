import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** 지원 메일 수신 주소 — .env의 VITE_SUPPORT_EMAIL로 변경 가능 */
const SUPPORT_RECIPIENT_EMAIL =
  import.meta.env.VITE_SUPPORT_EMAIL ?? 'admin@semo-box.ru';

const REQUEST_TYPES = [
  { value: '', label: 'Выберите тип запроса' },
  { value: 'product', label: 'Запрос по товару' },
  { value: 'price', label: 'Запрос по цене' },
  { value: 'shipping', label: 'Запрос по доставке' },
  { value: 'other', label: 'Другой запрос' },
] as const;

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';
const labelClass = 'mb-1 block text-xs font-medium text-slate-700';

export const Support: React.FC = () => {
  const { userEmail, initialized } = useAuth();
  const [subject, setSubject] = useState('');
  const [requestType, setRequestType] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  if (!initialized) return null;
  if (!userEmail) return <Navigate to="/login" replace />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: 실제 발송 API 연동
    setSent(true);
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-4">
        <p className="text-xs font-medium tracking-wide text-brand">Поддержка</p>
        <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          Написать в поддержку
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          Заполните форму — мы ответим на указанный при регистрации email.
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Для быстрой консультации — Telegram.
        </p>
      </header>

      {sent ? (
        <div className="rounded-xl border border-brand/20 bg-brand-soft/20 px-4 py-4 text-center text-slate-700">
          <p className="text-sm font-medium">Сообщение отправлено.</p>
          <p className="mt-1 text-xs">Мы ответим на {userEmail} в ближайшее время.</p>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="support-from" className={labelClass}>
              Отправитель
            </label>
            <input
              id="support-from"
              type="email"
              readOnly
              value={userEmail ?? ''}
              className={`${inputClass} cursor-default bg-slate-50 text-slate-600`}
            />
          </div>

          <div>
            <label htmlFor="support-to" className={labelClass}>
              Получатель
            </label>
            <input
              id="support-to"
              type="text"
              readOnly
              value={SUPPORT_RECIPIENT_EMAIL}
              className={`${inputClass} cursor-default bg-slate-100 text-slate-500`}
            />
          </div>

          <div>
            <label htmlFor="support-subject" className={labelClass}>
              Тема
            </label>
            <input
              id="support-subject"
              type="text"
              placeholder="Кратко опишите тему"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="support-type" className={labelClass}>
              Тип запроса
            </label>
            <select
              id="support-type"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
              className={inputClass}
            >
              {REQUEST_TYPES.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="support-message" className={labelClass}>
              Сообщение
            </label>
            <textarea
              id="support-message"
              rows={3}
              placeholder="Опишите ваш вопрос или проблему"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={`${inputClass} min-h-[80px] resize-y sm:min-h-[96px]`}
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90"
          >
            Отправить
          </button>
        </form>
      )}
    </main>
  );
};
