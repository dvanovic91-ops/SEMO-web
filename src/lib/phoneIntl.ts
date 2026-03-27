export type PhoneCountry = string;

const DIAL_CODE_MAP: Record<string, string> = {
  RU: '+7',
  KZ: '+7',
  AE: '+971',
  US: '+1',
  KR: '+82',
  JP: '+81',
  CN: '+86',
  DE: '+49',
  FR: '+33',
  GB: '+44',
  IT: '+39',
  ES: '+34',
  TR: '+90',
  IN: '+91',
  ID: '+62',
  TH: '+66',
  VN: '+84',
  SA: '+966',
  QA: '+974',
  KW: '+965',
  OM: '+968',
  BH: '+973',
  UZ: '+998',
};

function buildAllCountryOptions() {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    display = null;
  }
  let regions: string[] = Object.keys(DIAL_CODE_MAP);
  try {
    if ((Intl as any).supportedValuesOf) {
      const list = (Intl as any).supportedValuesOf('region') as string[];
      if (Array.isArray(list) && list.length > 0) regions = list;
    }
  } catch {
    regions = Object.keys(DIAL_CODE_MAP);
  }
  return regions
    .map((code) => ({
      code,
      dial: DIAL_CODE_MAP[code] ?? '',
      label: (display?.of(code) ?? code),
    }))
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

