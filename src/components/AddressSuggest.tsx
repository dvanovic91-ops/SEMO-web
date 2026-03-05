import React, { useEffect, useState } from 'react';

type DadataAddressSuggestion = {
  value: string;
  data?: {
    city_with_type?: string | null;
    settlement_with_type?: string | null;
    region_with_type?: string | null;
    street_with_type?: string | null;
    house_type?: string | null;
    house?: string | null;
    block_type?: string | null;
    block?: string | null;
    flat_type?: string | null;
    flat?: string | null;
    postal_code?: string | null;
  };
};

interface AddressSuggestProps {
  label: React.ReactNode;
  placeholder?: string;
  /** 호버 시 브라우저 툴팁으로 표시 */
  title?: string;
  value: string;
  onChange: (value: string) => void;
  onPartsChange?: (parts: {
    cityRegion?: string;
    streetHouse?: string;
    apartmentOffice?: string;
    postcode?: string;
  }) => void;
}

const DADATA_TOKEN = import.meta.env.VITE_DADATA_API_KEY as string | undefined;

export const AddressSuggest: React.FC<AddressSuggestProps> = ({
  label,
  placeholder,
  title,
  value,
  onChange,
  onPartsChange,
}) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<DadataAddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!DADATA_TOKEN) return;
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Token ${DADATA_TOKEN}`,
            },
            body: JSON.stringify({ query, count: 5 }),
            signal: controller.signal,
          },
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { suggestions?: DadataAddressSuggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen(true);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (s: DadataAddressSuggestion) => {
    onChange(s.value);
    if (onPartsChange && s.data) {
      const d = s.data;
      const cityRegion =
        d.city_with_type ||
        d.settlement_with_type ||
        d.region_with_type ||
        '';
      const housePart = [d.house_type, d.house].filter(Boolean).join(' ');
      const blockPart = [d.block_type, d.block].filter(Boolean).join(' ');
      const streetHouse = [
        d.street_with_type,
        [housePart, blockPart].filter(Boolean).join(', '),
      ]
        .filter(Boolean)
        .join(', ');
      const apartmentOffice = [d.flat_type, d.flat].filter(Boolean).join(' ');
      const postcode = d.postal_code || '';
      onPartsChange({ cityRegion, streetHouse, apartmentOffice, postcode });
    }
    setSuggestions([]);
    setOpen(false);
  };

  // DaData 키가 없으면 그냥 일반 인풋만 보여준다.
  if (!DADATA_TOKEN) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
        <input
          type="text"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder={placeholder}
          title={title}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        type="text"
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        placeholder={placeholder}
        title={title}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          // 약간 딜레이를 줘서 클릭을 처리할 수 있게 한다.
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {loading && (
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {suggestions.map((s) => (
            <li
              key={s.value}
              className="cursor-pointer px-3 py-2 text-slate-800 hover:bg-brand-soft/20"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(s);
              }}
            >
              {s.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

