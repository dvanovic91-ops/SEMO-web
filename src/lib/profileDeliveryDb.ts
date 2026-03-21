/**
 * 배송·ФИО·INN·여권 등 — Supabase shipping_addresses + profiles 가 진실의 원천.
 * user_id 기준 upsert(onConflict: user_id). DB에 fio_last/fio_first/fio_middle 컬럼 필요 — docs/SUPABASE_SHIPPING_FIO_COLUMNS.sql
 * localStorage 의 profileEdit 키는 레거시 이관·오프라인 백업 전용.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMergedLegacyProfileEditData, clearLegacyProfileEditStorageKeys } from './profileEditStorage';
import { snakePatchToShippingForm, validateShippingComplete } from './shippingValidation';

/** DB shipping_addresses 한 행 (스키마 + fio_* 확장) */
export type ShippingAddressRow = {
  user_id: string;
  city_region: string | null;
  street_house: string | null;
  apartment_office: string | null;
  postcode: string | null;
  phone: string | null;
  inn: string | null;
  passport_series: string | null;
  passport_number: string | null;
  fio_last?: string | null;
  fio_first?: string | null;
  fio_middle?: string | null;
};

/** ProfileEdit / Checkout 공통 필드 (camelCase) */
export type ShippingFormCamel = {
  fioLast: string;
  fioFirst: string;
  fioMiddle: string;
  cityRegion: string;
  streetHouse: string;
  apartmentOffice: string;
  postcode: string;
  phone: string;
  inn: string;
  passportSeries: string;
  passportNumber: string;
};

const MIGRATION_FLAG = 'semo_profile_shipping_db_migrated_v1';

function rowToCamel(row: ShippingAddressRow | null): Partial<ShippingFormCamel> {
  if (!row) return {};
  return {
    fioLast: row.fio_last ?? '',
    fioFirst: row.fio_first ?? '',
    fioMiddle: row.fio_middle ?? '',
    cityRegion: row.city_region ?? '',
    streetHouse: row.street_house ?? '',
    apartmentOffice: row.apartment_office ?? '',
    postcode: row.postcode ?? '',
    phone: row.phone ?? '',
    inn: row.inn ?? '',
    passportSeries: row.passport_series ?? '',
    passportNumber: row.passport_number ?? '',
  };
}

/** 서버에서 배송 행 조회 */
export async function fetchShippingAddressRow(
  supabase: SupabaseClient,
  userId: string
): Promise<ShippingAddressRow | null> {
  const { data, error } = await supabase
    .from('shipping_addresses')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[profileDeliveryDb] fetchShippingAddressRow', error.message);
    return null;
  }
  return data as ShippingAddressRow | null;
}

export function shippingRowToFormFields(row: ShippingAddressRow | null): Partial<ShippingFormCamel> {
  return rowToCamel(row);
}

/**
 * camelCase 폼을 DB 컬럼 스네이크로 변환해 upsert (onConflict: `user_id`).
 * 필요 컬럼: `shipping_addresses`에 fio_last, fio_first, fio_middle 포함 — `docs/SUPABASE_SHIPPING_FIO_COLUMNS.sql` 참고.
 * @returns error 객체 또는 null(성공)
 */
export async function upsertShippingFromForm(
  supabase: SupabaseClient,
  userId: string,
  form: ShippingFormCamel
): Promise<{ message: string } | null> {
  const pre = validateShippingComplete(form);
  if (!pre.ok) return { message: pre.messageRu };

  const row = {
    user_id: userId,
    fio_last: form.fioLast?.trim() || null,
    fio_first: form.fioFirst?.trim() || null,
    fio_middle: form.fioMiddle?.trim() || null,
    city_region: form.cityRegion?.trim() || null,
    street_house: form.streetHouse?.trim() || null,
    apartment_office: form.apartmentOffice?.trim() || null,
    postcode: form.postcode?.trim() || null,
    phone: form.phone?.trim() || null,
    inn: form.inn?.trim() || null,
    passport_series: form.passportSeries?.trim() || null,
    passport_number: form.passportNumber?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('shipping_addresses').upsert(row, { onConflict: 'user_id' });
  if (error) return { message: error.message };
  return null;
}

const SHIPPING_SNAKE_KEYS = [
  'fio_last',
  'fio_first',
  'fio_middle',
  'city_region',
  'street_house',
  'apartment_office',
  'postcode',
  'phone',
  'inn',
  'passport_series',
  'passport_number',
] as const;

/** 오프라인 플러시용 — 스네이크 키 레코드 */
export async function upsertShippingAddressRow(
  supabase: SupabaseClient,
  userId: string,
  patch: Record<string, string | null>
): Promise<{ message: string } | null> {
  const asForm = snakePatchToShippingForm(patch);
  const pre = validateShippingComplete(asForm);
  if (!pre.ok) return { message: pre.messageRu };

  const row: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  for (const k of SHIPPING_SNAKE_KEYS) {
    if (k in patch) row[k] = patch[k] ?? null;
  }
  const { error } = await supabase.from('shipping_addresses').upsert(row, { onConflict: 'user_id' });
  if (error) return { message: error.message };
  return null;
}

/** camelCase 폼 → 스네이크 레코드 (오프라인 백업 저장용) */
export function shippingFormToSnakePatch(form: ShippingFormCamel): Record<string, string | null> {
  return {
    fio_last: form.fioLast?.trim() || null,
    fio_first: form.fioFirst?.trim() || null,
    fio_middle: form.fioMiddle?.trim() || null,
    city_region: form.cityRegion?.trim() || null,
    street_house: form.streetHouse?.trim() || null,
    apartment_office: form.apartmentOffice?.trim() || null,
    postcode: form.postcode?.trim() || null,
    phone: form.phone?.trim() || null,
    inn: form.inn?.trim() || null,
    passport_series: form.passportSeries?.trim() || null,
    passport_number: form.passportNumber?.trim() || null,
  };
}

function legacyMergedToShippingForm(merged: Record<string, string>): ShippingFormCamel {
  return {
    fioLast: merged.fioLast ?? '',
    fioFirst: merged.fioFirst ?? '',
    fioMiddle: merged.fioMiddle ?? '',
    cityRegion: merged.cityRegion ?? '',
    streetHouse: merged.streetHouse ?? '',
    apartmentOffice: merged.apartmentOffice ?? '',
    postcode: merged.postcode ?? '',
    phone: merged.phone ?? '',
    inn: merged.inn ?? '',
    passportSeries: merged.passportSeries ?? '',
    passportNumber: merged.passportNumber ?? '',
  };
}

function rowHasMeaningfulShipping(row: ShippingAddressRow | null): boolean {
  if (!row) return false;
  const s = (v: unknown) => (v != null && String(v).trim() !== '');
  return (
    s(row.city_region) ||
    s(row.street_house) ||
    s(row.fio_last) ||
    s(row.fio_first) ||
    s(row.inn) ||
    s(row.passport_series)
  );
}

function legacyHasMeaningfulData(merged: Record<string, string>): boolean {
  const keys: (keyof ShippingFormCamel)[] = [
    'fioLast',
    'fioFirst',
    'cityRegion',
    'streetHouse',
    'postcode',
    'inn',
    'passportSeries',
    'passportNumber',
  ];
  return keys.some((k) => merged[k]?.trim());
}

/**
 * 레거시 profileEdit* 키에만 있던 데이터를 1회 서버로 이관 후 로컬 키 정리.
 * DB에 이미 의미 있는 행이 있으면 플래그만 세우고 로컬만 정리(선택).
 */
export async function migrateLegacyProfileEditToSupabase(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | null
): Promise<void> {
  if (typeof window === 'undefined' || !userId) return;

  try {
    if (localStorage.getItem(`${MIGRATION_FLAG}:${userId}`)) return;
  } catch {
    return;
  }

  const row = await fetchShippingAddressRow(supabase, userId);
  const dbOk = rowHasMeaningfulShipping(row);

  const merged = getMergedLegacyProfileEditData(userId, userEmail);
  const legacyOk = legacyHasMeaningfulData(merged);

  if (dbOk) {
    try {
      localStorage.setItem(`${MIGRATION_FLAG}:${userId}`, '1');
      if (legacyOk) clearLegacyProfileEditStorageKeys(userId, userEmail);
    } catch {
      /* */
    }
    return;
  }

  if (!legacyOk) {
    try {
      localStorage.setItem(`${MIGRATION_FLAG}:${userId}`, '1');
    } catch {
      /* */
    }
    return;
  }

  const form = legacyMergedToShippingForm(merged);
  /** 불완전 레거시는 서버에 넣지 않음. 플래그만 세워 매 로드마다 재시도하지 않음(사용자는 프로필에서 직접 저장). */
  if (!validateShippingComplete(form).ok) {
    try {
      localStorage.setItem(`${MIGRATION_FLAG}:${userId}`, '1');
    } catch {
      /* */
    }
    return;
  }
  const err = await upsertShippingFromForm(supabase, userId, form);
  if (!err) {
    try {
      localStorage.setItem(`${MIGRATION_FLAG}:${userId}`, '1');
      clearLegacyProfileEditStorageKeys(userId, userEmail);
    } catch {
      /* */
    }
  }
}
