import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PHONE_COUNTRY_OPTIONS, type PhoneCountry } from '../lib/phoneIntl';

type Props = {
  value: PhoneCountry;
  onChange: (next: PhoneCountry) => void;
  id?: string;
};

function formatOptionLine(o: { code: string; dial: string; label: string }) {
  const dialPart = o.dial ? ` ${o.dial}` : '';
  return `${o.label} (${o.code})${dialPart}`;
}

export const PhoneCountryCodeSelect: React.FC<Props> = ({ value, onChange, id }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => PHONE_COUNTRY_OPTIONS.find((o) => o.code === value) ?? PHONE_COUNTRY_OPTIONS[0],
    [value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDial = q.replace(/\s+/g, '').replace(/^\+/, '');
    if (!q) return PHONE_COUNTRY_OPTIONS;
    return PHONE_COUNTRY_OPTIONS.filter((o) => {
      if (o.label.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)) return true;
      if (qDial.length > 0 && o.dial) {
        const dn = o.dial.replace(/\s+/g, '').replace(/^\+/, '');
        if (dn.includes(qDial)) return true;
      }
      return false;
    });
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const idRaf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(idRaf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const triggerLabel = formatOptionLine(selected);

  const triggerClass =
    'flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-[40px]';

  return (
    <div ref={rootRef} className="relative w-full sm:w-[12rem]">
      <button
        type="button"
        id={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) setQuery('');
            return next;
          });
        }}
        className={triggerClass}
      >
        <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[100] mt-1 flex max-h-[min(20rem,calc(100vh-10rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_30px_-8px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/60"
          role="presentation"
        >
          <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code…"
              className="min-h-[36px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              aria-label="Filter country list"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <ul role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-slate-500">No matches</li>
            ) : (
              filtered.map((o) => {
                const isSel = o.code === value;
                return (
                  <li key={`${o.code}-${o.label}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      onClick={() => {
                        onChange(o.code);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition ${
                        isSel
                          ? 'bg-brand/10 font-medium text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{formatOptionLine(o)}</span>
                      {isSel && (
                        <svg className="h-4 w-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
