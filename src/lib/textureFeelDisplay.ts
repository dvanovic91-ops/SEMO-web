/** texture_feel (KO, 관리자/파i) → 스토어프론트 RU/EN */

const TEXTURE_FEEL_I18N: Record<string, { ru: string; en: string }> = {
  '촉촉한 저자극 제형': { ru: 'Увлажняющая, мягкая текстура', en: 'Moist, low-irritation texture' },
  '풍성하고 뽀드득한 거품': { ru: 'Пышная, хрустящая пена', en: 'Rich, satisfying foam' },
  '저자극 여드름 기능성': { ru: 'Мягкая, для проблемной кожи', en: 'Gentle, acne-care formula' },
  '촉촉한 에센스 제형': { ru: 'Увлажняющая эссенция', en: 'Moist essence texture' },
  '핑크색 물 제형': { ru: 'Розовая водянистая текстура', en: 'Pink watery texture' },
  '피지 조절 물 제형': { ru: 'Матовая водянистая текстура', en: 'Sebum-balancing water texture' },
  '보습감이 느껴지는 제형': { ru: 'Увлажняющая текстура', en: 'Hydrating, cushioned feel' },
  '영양감 있는 제형': { ru: 'Питательная текстура', en: 'Nourishing, rich texture' },
  '캡슐이 터지는 제형': { ru: 'Текстура с капсулами', en: 'Bursting capsule texture' },
  '탄탄한 탄력 제형': { ru: 'Упругая, подтягивающая текстура', en: 'Firm, elastic texture' },
  '매끈한 보습 제형': { ru: 'Гладкая увлажняющая текстура', en: 'Smooth, moisturizing texture' },
  '화장 궁합 좋은 영양 제형': { ru: 'Питательная, хорошо под макияж', en: 'Nourishing, makeup-friendly' },
  '쿨링 높은 수딩 젤': { ru: 'Охлаждающий успокаивающий гель', en: 'Cooling soothing gel' },
  '보습 실타래 제형': { ru: 'Увлажняющая нити-текстура', en: 'Moisture-thread texture' },
  '밀림 없는 발색': { ru: 'Лёгкое нанесение, без скатывания', en: 'No pilling, smooth laydown' },
  '저자극 핑크 톤업': { ru: 'Мягкий розовый тон-ап', en: 'Gentle pink tone-up' },
  '가벼운 선스틱': { ru: 'Лёгкий солнцезащитный стик', en: 'Lightweight sun stick' },
  '쿨링감 있는 선세럼': { ru: 'Охлаждающая SPF-серум', en: 'Cooling SPF serum' },
  '클렌징 밤': { ru: 'Очищающий бальзам', en: 'Cleansing balm' },
  '아이크림': { ru: 'Крем для области вокруг глаз', en: 'Eye cream' },
};

const HANGUL_RE = /[가-힣]/;

export function formatTextureFeelForLanguage(
  raw: string | null | undefined,
  language: string,
): string | null {
  const ko = (raw ?? '').trim();
  if (!ko) return null;
  const mapped = TEXTURE_FEEL_I18N[ko];
  if (language === 'en') return mapped?.en ?? (HANGUL_RE.test(ko) ? null : ko);
  if (language === 'ru') return mapped?.ru ?? (HANGUL_RE.test(ko) ? null : ko);
  return ko;
}
