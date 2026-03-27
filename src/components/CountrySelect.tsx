import React, { useMemo, useRef, useState, useEffect } from 'react';

/** Delivery-supported countries shown first */
const PRIORITY_COUNTRIES = ['RU', 'KZ', 'AE', 'UZ'] as const;

type CountryOption = { code: string; label: string };

function buildCountryList(): CountryOption[] {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    display = null;
  }
  let regions: string[] = [];
  try {
    if ((Intl as any).supportedValuesOf) {
      const list = (Intl as any).supportedValuesOf('region') as string[];
      if (Array.isArray(list) && list.length > 0) regions = list;
    }
  } catch {
    /* fallback below */
  }
  if (!regions.length) {
    regions = [...PRIORITY_COUNTRIES];
  }
  return regions.map((code) => ({
    code,
    label: display?.of(code) ?? code,
  }));
}

const ALL_COUNTRIES = buildCountryList();

type Props = {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  className?: string;
};

export const CountrySelect: React.FC<Props> = ({ value, onChange, id, className }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(() => {
    const found = ALL_COUNTRIES.find((c) => c.code === value);
    return found ? `${found.label} (${found.code})` : value;
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? ALL_COUNTRIES.filter(
          (c) => c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
        )
      : ALL_COUNTRIES;
    // sort: priority countries first
    const prioritySet = new Set<string>(PRIORITY_COUNTRIES);
    return [
      ...list.filter((c) => prioritySet.has(c.code)),
      ...list.filter((c) => !prioritySet.has(c.code)),
    ];
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 transition focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand min-h-[44px] sm:min-h-0"
      >
        <span>{selectedLabel}</span>
        <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div className="max-h-52 overflow-y-auto px-1 pb-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">No results</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                  setQuery('');
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                  c.code === value
                    ? 'bg-brand-soft/40 font-semibold text-brand'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{c.label}</span>
                <span className="text-xs text-slate-400">({c.code})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
