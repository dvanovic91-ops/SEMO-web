/**
 * sku_items.product_type — 관리자·수집기는 한국어 키(세럼, 크림…)로 저장.
 * 스토어는 언어별 표기만 바꿔 보여 줌(컬럼 추가 없음).
 */
const BY_KO_KEY: Record<string, { ko: string; en: string; ru: string }> = {
  세럼: { ko: '세럼', en: 'Serum', ru: 'Серум' },
  크림: { ko: '크림', en: 'Cream', ru: 'Крем' },
  토너: { ko: '토너', en: 'Toner', ru: 'Тонер' },
  클렌저: { ko: '클렌저', en: 'Cleanser', ru: 'Очищающее средство' },
  선크림: { ko: '선크림', en: 'Sunscreen', ru: 'Солнцезащитное средство' },
  로션: { ko: '로션', en: 'Lotion', ru: 'Лосьон' },
  에센스: { ko: '에센스', en: 'Essence', ru: 'Эссенция' },
  앰플: { ko: '앰플', en: 'Ampoule', ru: 'Ампула' },
  아이크림: { ko: '아이크림', en: 'Eye cream', ru: 'Крем для области вокруг глаз' },
  마스크: { ko: '마스크', en: 'Mask', ru: 'Маска' },
  미스트: { ko: '미스트', en: 'Mist', ru: 'Мист' },
  오일: { ko: '오일', en: 'Oil', ru: 'Масло' },
  필링: { ko: '필링', en: 'Peeling / exfoliant', ru: 'Пилинг' },
  비타민C: { ko: '비타민 C', en: 'Vitamin C', ru: 'Витамин C' },
  기타: { ko: '기타', en: 'Other', ru: 'Другое' },
};

export function formatProductTypeForLanguage(productType: string | null | undefined, language: string): string {
  const key = (productType ?? '').trim();
  if (!key) return '';
  const row = BY_KO_KEY[key];
  if (!row) return key;
  if (language === 'en') return row.en;
  if (language === 'ru') return row.ru;
  return row.ko;
}
