/**
 * 배송 국가 기준: RU → DaData만, 그 외 → Google Places만. 해당 키가 없으면 수동 입력.
 */
export type AddressSuggestMode = 'dadata' | 'google' | 'manual';

export function resolveAddressSuggestMode(country: string): AddressSuggestMode {
  const dadata = Boolean(import.meta.env.VITE_DADATA_API_KEY);
  const google = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  if (country === 'RU') return dadata ? 'dadata' : 'manual';
  return google ? 'google' : 'manual';
}
