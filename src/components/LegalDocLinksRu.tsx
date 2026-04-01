import React from 'react';
import { Link } from 'react-router-dom';

const linkClass =
  'font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:opacity-90';

/** Регистрация / вход — ссылки на три раздела `/legal` (текст согласован по падежам) */
export const LegalDocLinksRu: React.FC = () => (
  <>
    <Link to="/legal#privacy" className={linkClass}>
      условиями обработки персональных данных
    </Link>
    {', '}
    <Link to="/legal#terms" className={linkClass}>
      пользовательским соглашением
    </Link>
    {' и '}
    <Link to="/legal#delivery" className={linkClass}>
      условиями доставки
    </Link>
  </>
);

/** Same targets as Russian — English registration copy */
export const LegalDocLinksEn: React.FC = () => (
  <>
    <Link to="/legal#privacy" className={linkClass}>
      personal data processing terms
    </Link>
    {', '}
    <Link to="/legal#terms" className={linkClass}>
      user agreement
    </Link>
    {' and '}
    <Link to="/legal#delivery" className={linkClass}>
      delivery terms
    </Link>
  </>
);
