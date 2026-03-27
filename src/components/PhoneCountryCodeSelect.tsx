import React, { useMemo, useState } from 'react';
import { PHONE_COUNTRY_OPTIONS, type PhoneCountry } from '../lib/phoneIntl';

type Props = {
  value: PhoneCountry;
  onChange: (next: PhoneCountry) => void;
  id?: string;
};

export const PhoneCountryCodeSelect: React.FC<Props> = ({ value, onChange, id }) => {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHONE_COUNTRY_OPTIONS;
    return PHONE_COUNTRY_OPTIONS.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q) ||
        o.dial.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')),
    );
  }, [query]);

  return (
    <div className="w-full sm:w-[12rem]">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search country (EN)"
        className="mb-1 min-h-[36px] w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0"
        aria-label="Search country by English name"
      />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as PhoneCountry)}
        className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0"
        aria-label="Phone country code"
      >
        {filtered.map((o) => (
          <option key={`${o.code}-${o.label}`} value={o.code}>
            {o.label} ({o.code}) {o.dial}
          </option>
        ))}
      </select>
    </div>
  );
};

