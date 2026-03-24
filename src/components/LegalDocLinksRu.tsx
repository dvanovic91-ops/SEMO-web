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
