import { PHONE_DIAL_BY_ISO } from './phoneCountryDialCodes';

export type PhoneCountry = string;

/** 스토어 전화 국가 선택 목록에서 제외 (ISO 3166-1 alpha-2) */
const EXCLUDED_PHONE_REGION_CODES = new Set<string>(['KP']);

function buildAllCountryOptions() {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    display = null;
  }
  /** `supportedValuesOf` 없는 환경에서도 전체 번호부가 나오도록 ISO 목록은 항상 전체 매핑 기준 */
  let regions: string[] = Object.keys(PHONE_DIAL_BY_ISO);
  try {
    if ((Intl as any).supportedValuesOf) {
      const list = (Intl as any).supportedValuesOf('region') as string[];
      if (Array.isArray(list) && list.length > 0) regions = list;
    }
  } catch {
    regions = Object.keys(PHONE_DIAL_BY_ISO);
  }
  return regions
    .map((code) => ({
      code,
      dial: PHONE_DIAL_BY_ISO[code] ?? '',
      label: display?.of(code) ?? code,
    }))
    .filter((o) => o.dial !== '' && !EXCLUDED_PHONE_REGION_CODES.has(o.code))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const PHONE_COUNTRY_OPTIONS: { code: PhoneCountry; dial: string; label: string }[] =
  buildAllCountryOptions();

export function detectCountryFromPhone(phone: string): PhoneCountry {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('971')) return 'AE';
  if (digits.startsWith('1')) return 'US';
  return 'RU';
}

export function formatIntlPhoneByCountry(value: string, country: PhoneCountry): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (country === 'AE') {
    const d = digits.startsWith('971') ? digits.slice(3) : digits.slice(0, 9);
    const a = d.slice(0, 2);
    const b = d.slice(2, 5);
    const c = d.slice(5, 9);
    return `+971 ${a}${b ? ` ${b}` : ''}${c ? ` ${c}` : ''}`.trim();
  }
  if (country === 'US') {
    const d = digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10);
    const a = d.slice(0, 3);
    const b = d.slice(3, 6);
    const c = d.slice(6, 10);
    return `+1 ${a}${b ? ` ${b}` : ''}${c ? ` ${c}` : ''}`.trim();
  }
  // RU/KZ shared +7 mask
  let d = digits.slice(0, 11);
  if (d.startsWith('8')) d = `7${d.slice(1)}`;
  if (!d.startsWith('7')) d = `7${d}`;
  const a = d.slice(1, 4);
  const b = d.slice(4, 7);
  const c = d.slice(7, 11);
  if (country === 'RU' || country === 'KZ') {
    return `+7 ${a}${b ? ` ${b}` : ''}${c ? ` ${c}` : ''}`.trim();
  }
  // 기타 국가: 숫자만 정리해 국제형으로 유지
  return `+${digits.slice(0, 15)}`;
}

