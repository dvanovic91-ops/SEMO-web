import React, { useEffect, useRef, useState } from 'react';
import { resolveAddressSuggestMode } from '../lib/addressSuggestMode';
import { loadGoogleMapsWithPlaces } from '../lib/loadGoogleMapsPlaces';
import { parseGooglePlaceToParts } from '../lib/parseGooglePlaceAddress';

export { resolveAddressSuggestMode } from '../lib/addressSuggestMode';

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

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

interface AddressSuggestProps {
  label: React.ReactNode;
  placeholder?: string;
  title?: string;
  value: string;
  onChange: (value: string) => void;
  onPartsChange?: (parts: {
    cityRegion?: string;
    streetHouse?: string;
    apartmentOffice?: string;
    postcode?: string;
  }) => void;
  country?: string;
  /** Google Places 자동완성 후보·지도 UI 언어 */
  mapsUiLanguage?: 'ru' | 'en';
}

const DADATA_TOKEN = import.meta.env.VITE_DADATA_API_KEY as string | undefined;
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const GooglePlacesField: React.FC<
  Omit<AddressSuggestProps, 'country'> & { country: string; mapsUiLanguage?: 'ru' | 'en' }
> = ({ label, placeholder, title, value, onChange, onPartsChange, country, mapsUiLanguage = 'en' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  const onPartsRef = useRef(onPartsChange);
  onChangeRef.current = onChange;
  onPartsRef.current = onPartsChange;

  const [mapsReady, setMapsReady] = useState(false);
  const [usePlainInput, setUsePlainInput] = useState(!GOOGLE_KEY);

  useEffect(() => {
    if (!GOOGLE_KEY || usePlainInput) return;
    const input = inputRef.current;
    if (!input) return;
    let cancelled = false;
    let ac: google.maps.places.Autocomplete | null = null;
    const lang = mapsUiLanguage === 'ru' ? 'ru' : 'en';

    void loadGoogleMapsWithPlaces(GOOGLE_KEY, lang)
      .then((g) => {
        if (cancelled || !inputRef.current) return;
        ac = new g.maps.places.Autocomplete(inputRef.current, {
          fields: ['address_components', 'formatted_address'],
          componentRestrictions: { country: [country.toLowerCase()] },
        });
        ac.addListener('place_changed', () => {
          const place = ac!.getPlace();
          const formatted = place.formatted_address ?? '';
          if (formatted) onChangeRef.current(formatted);
          if (place.address_components?.length) {
            onPartsRef.current?.(parseGooglePlaceToParts(place));
          }
        });
        if (!cancelled) setMapsReady(true);
      })
      .catch(() => {
        if (!cancelled) setUsePlainInput(true);
      });

    return () => {
      cancelled = true;
      if (ac && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(ac);
      }
    };
  }, [country, mapsUiLanguage, usePlainInput]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el || document.activeElement === el) return;
    if (el.value !== value) el.value = value;
  }, [value]);

  if (usePlainInput) {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
        <input
          type="text"
          className={inputClass}
          placeholder={placeholder}
          title={title}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className={inputClass}
          placeholder={placeholder}
          title={title}
          defaultValue={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {!mapsReady && (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
          </div>
        )}
      </div>
    </div>
  );
};

export const AddressSuggest: React.FC<AddressSuggestProps> = ({
  label,
  placeholder,
  title,
  value,
  onChange,
  onPartsChange,
  country = 'RU',
  mapsUiLanguage = 'en',
}) => {
  const mode = resolveAddressSuggestMode(country);
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<DadataAddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (mode !== 'dadata' || !DADATA_TOKEN) return;
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Token ${DADATA_TOKEN}`,
          },
          body: JSON.stringify({ query, count: 5 }),
          signal: controller.signal,
        });
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
  }, [query, mode]);

  const handleSelectDadata = (s: DadataAddressSuggestion) => {
    onChange(s.value);
    if (onPartsChange && s.data) {
      const d = s.data;
      const cityRegion = d.city_with_type || d.settlement_with_type || d.region_with_type || '';
      const housePart = [d.house_type, d.house].filter(Boolean).join(' ');
      const blockPart = [d.block_type, d.block].filter(Boolean).join(' ');
      const streetHouse = [d.street_with_type, [housePart, blockPart].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(', ');
      const apartmentOffice = [d.flat_type, d.flat].filter(Boolean).join(' ');
      const postcode = d.postal_code || '';
      onPartsChange({ cityRegion, streetHouse, apartmentOffice, postcode });
    }
    setSuggestions([]);
    setOpen(false);
  };

  if (mode === 'google') {
    return (
      <GooglePlacesField
        key={`${country}-${mapsUiLanguage}`}
        label={label}
        placeholder={placeholder}
        title={title}
        value={value}
        onChange={onChange}
        onPartsChange={onPartsChange}
        country={country}
        mapsUiLanguage={mapsUiLanguage}
      />
    );
  }

  if (mode !== 'dadata') {
    return (
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
        <input
          type="text"
          className={inputClass}
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
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type="text"
        className={inputClass}
        placeholder={placeholder}
        title={title}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
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
                handleSelectDadata(s);
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
