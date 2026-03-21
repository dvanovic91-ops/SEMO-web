/**
 * 배송·신원 필드 공통 유효성 검사 (ProfileEdit, Checkout, upsert 전 서버 요청 차단).
 * UI 메시지는 러시아어(사용자 규칙).
 */

import type { ShippingFormCamel } from './profileDeliveryDb';

/** 공백 제거 후 비어 있지 않은지 */
function t(s: string | undefined | null): string {
  return (s ?? '').trim();
}

/** 배송/여권 블록에 사용자가 값을 하나라도 넣었는지 */
export function shippingHasAnyField(form: Partial<ShippingFormCamel>): boolean {
  const keys: (keyof ShippingFormCamel)[] = [
    'fioLast',
    'fioFirst',
    'fioMiddle',
    'cityRegion',
    'streetHouse',
    'apartmentOffice',
    'postcode',
    'inn',
    'passportSeries',
    'passportNumber',
  ];
  return keys.some((k) => t(form[k] as string) !== '');
}

/** 전화: 최소 +7 및 숫자 길이 (포맷은 다양) */
export function isPhoneFilled(form: Partial<ShippingFormCamel>): boolean {
  const d = t(form.phone).replace(/\D/g, '');
  return d.length >= 11;
}

/**
 * 결제/프로필 저장용 — 배송 블록을 채운 경우 필수 항목 전부 충족해야 함.
 * fioMiddle(отчество)는 없음 체크 시 빈 값 허용.
 */
export function validateShippingComplete(form: Partial<ShippingFormCamel>): { ok: true } | { ok: false; messageRu: string } {
  if (!isPhoneFilled(form)) {
    return { ok: false, messageRu: 'Укажите номер телефона (полный формат +7).' };
  }
  if (!t(form.fioLast)) {
    return { ok: false, messageRu: 'Укажите фамилию (латиницей, как в паспорте).' };
  }
  if (!t(form.fioFirst)) {
    return { ok: false, messageRu: 'Укажите имя (латиницей).' };
  }
  if (!t(form.cityRegion)) {
    return { ok: false, messageRu: 'Укажите город или регион.' };
  }
  if (!t(form.streetHouse)) {
    return { ok: false, messageRu: 'Укажите улицу, дом, корпус.' };
  }
  const pc = t(form.postcode).replace(/\D/g, '');
  if (pc.length !== 6) {
    return { ok: false, messageRu: 'Индекс (postcode) должен содержать 6 цифр.' };
  }
  const innDigits = t(form.inn).replace(/\D/g, '');
  if (innDigits.length !== 12) {
    return { ok: false, messageRu: 'ИНН должен содержать 12 цифр.' };
  }
  const ps = t(form.passportSeries).replace(/\D/g, '');
  if (ps.length !== 4) {
    return { ok: false, messageRu: 'Серия паспорта — 4 цифры.' };
  }
  const pn = t(form.passportNumber).replace(/\D/g, '');
  if (pn.length !== 6) {
    return { ok: false, messageRu: 'Номер паспорта — 6 цифр.' };
  }
  return { ok: true };
}

/**
 * 배송 필드를 하나라도 채웠으면 반드시 전체 검사. 아무것도 안 채웠으면 ok(프로필 이름·телефон만 저장 가능).
 */
export function validateShippingOrEmpty(form: Partial<ShippingFormCamel>): { ok: true } | { ok: false; messageRu: string } {
  if (!shippingHasAnyField(form)) {
    return { ok: true };
  }
  return validateShippingComplete(form);
}

/** 오프라인 플러시용 — 스네이크 패치를 camel 폼으로 변환 후 동일 규칙으로 검증 */
export function snakePatchToShippingForm(patch: Record<string, string | null>): ShippingFormCamel {
  return {
    fioLast: patch.fio_last ?? '',
    fioFirst: patch.fio_first ?? '',
    fioMiddle: patch.fio_middle ?? '',
    cityRegion: patch.city_region ?? '',
    streetHouse: patch.street_house ?? '',
    apartmentOffice: patch.apartment_office ?? '',
    postcode: patch.postcode ?? '',
    phone: patch.phone ?? '',
    inn: patch.inn ?? '',
    passportSeries: patch.passport_series ?? '',
    passportNumber: patch.passport_number ?? '',
  };
}
