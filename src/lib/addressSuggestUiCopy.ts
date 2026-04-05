import { resolveAddressSuggestMode, type AddressSuggestMode } from './addressSuggestMode';

/** 회원가입·프로필·체크아웃 공통 — 배송국가에 따른 주소 검색 필드 문구 */
export function getAddressSuggestUiCopy(
  country: string,
  lang: 'ru' | 'en',
): {
  mode: AddressSuggestMode;
  label: string;
  tooltip: string;
  placeholder: string;
  tooltipAria: string;
} {
  const mode = resolveAddressSuggestMode(country);
  const isEn = lang === 'en';

  if (mode === 'dadata') {
    return {
      mode,
      label: isEn ? 'Address (database search)' : 'Адрес (поиск по базе)',
      tooltip: isEn
        ? 'When you pick an address, the fields below fill in automatically.'
        : 'При вводе адреса нижние поля заполнятся автоматически.',
      placeholder: isEn
        ? 'Start typing, then choose from the list'
        : 'Начните вводить адрес, затем выберите вариант из списка',
      tooltipAria: isEn ? 'Hint' : 'Подсказка',
    };
  }
  if (mode === 'google') {
    return {
      mode,
      label: isEn ? 'Address (Google Maps search)' : 'Адрес (поиск Google Maps)',
      tooltip: isEn
        ? 'Suggestions come from Google Places (limited to the selected country). Pick one to fill the fields below when possible.'
        : 'Подсказки — Google Places (ограничение по выбранной стране). Выберите вариант — нижние поля заполнятся автоматически (по возможности).',
      placeholder: isEn ? 'Start typing and pick a suggestion' : 'Начните вводить адрес и выберите подсказку',
      tooltipAria: isEn ? 'Hint' : 'Подсказка',
    };
  }
  /** manual — 배송국 규칙상 자동완성을 쓰지 않거나(키는 배포 설정 이슈로 docs 참고), API 실패 시 폴백 */
  return {
    mode,
    label: isEn ? 'Delivery address' : 'Адрес доставки',
    tooltip: isEn
      ? 'Type your full street address, city, and area. The detailed fields below can be filled in by hand.'
      : 'Введите полный адрес: улицу, город, район. Нижние поля можно заполнить вручную.',
    placeholder: isEn
      ? 'Street, building, city, area — as for courier delivery'
      : 'Улица, дом, город, район — как для доставки',
    tooltipAria: isEn ? 'Hint' : 'Подсказка',
  };
}
