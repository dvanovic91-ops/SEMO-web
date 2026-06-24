/**
 * 공유 INCI 사전 — InventoryTab(admin) 및 BoxComponentDetail(스토어) 양쪽에서 사용.
 * 키는 소문자 영문 INCI명, 값은 표시명/설명.
 */

/** 주요 INCI 영문명 → 한국어 표기명 */
export const INCI_KO: Record<string, string> = {
  water: '정제수',
  glycerin: '글리세린',
  'butylene glycol': '부틸렌글라이콜',
  'propylene glycol': '프로필렌글라이콜',
  'dipropylene glycol': '다이프로필렌글라이콜',
  'pentylene glycol': '펜틸렌글라이콜',
  'caprylyl glycol': '카프릴릴글라이콜',
  'stearic acid': '스테아릭애씨드',
  'palmitic acid': '팔미틱애씨드',
  'potassium hydroxide': '포타슘하이드록사이드',
  'glyceryl stearate se': '글리세릴스테아레이트SE',
  'glyceryl stearate': '글리세릴스테아레이트',
  fragrance: '향료',
  parfum: '향료',
  niacinamide: '나이아신아마이드',
  'hyaluronic acid': '히알루론산',
  'sodium hyaluronate': '소듐히알루로네이트',
  panthenol: '판테놀',
  retinol: '레티놀',
  adenosine: '아데노신',
  'centella asiatica extract': '병풀추출물',
  'ceramide np': '세라마이드NP',
  'ceramide ap': '세라마이드AP',
  'ceramide eop': '세라마이드EOP',
  allantoin: '알란토인',
  'snail secretion filtrate': '달팽이분비물여과액',
  'salicylic acid': '살리실산',
  'ascorbic acid': '아스코빅애씨드(비타민C)',
  'ethyl ascorbic acid': '에틸아스코빅애씨드',
  '3-o-ethyl ascorbic acid': '3-O-에틸아스코빅애씨드',
  'sodium ascorbyl phosphate': '소듐아스코빌포스페이트',
  'retinyl palmitate': '레티닐팔미테이트',
  peptide: '펩타이드',
  'palmitoyl tripeptide-1': '팔미토일트리펩타이드-1',
  'palmitoyl tetrapeptide-7': '팔미토일테트라펩타이드-7',
  argireline: '아지렐린',
  glutathione: '글루타치온',
  arbutin: '알부틴',
  'kojic acid': '코직산',
  'tranexamic acid': '트라넥삼산',
  'azelaic acid': '아젤라익애씨드',
  'lactic acid': '락틱애씨드',
  'glycolic acid': '글리콜릭애씨드',
  'beta-glucan': '베타글루칸',
  'propolis extract': '프로폴리스추출물',
  'green tea extract': '녹차추출물',
  'chamomile extract': '카모마일추출물',
  'aloe barbadensis leaf extract': '알로에베라잎추출물',
  dimethicone: '디메티콘',
  cyclopentasiloxane: '사이클로펜타실록세인',
  squalane: '스쿠알란',
  'jojoba seed oil': '호호바씨오일',
  'rosehip oil': '로즈힙오일',
  'marula oil': '마룰라오일',
  'shea butter': '시어버터',
  madecassoside: '마데카소사이드',
  asiaticoside: '아시아티코사이드',
  cica: '시카',
  'zinc oxide': '징크옥사이드',
  'titanium dioxide': '이산화티탄',
  'butyloctyl salicylate': '부틸옥틸살리실레이트',
  'ethylhexyl salicylate': '에틸헥실살리실레이트',
  'diethylamino hydroxybenzoyl hexyl benzoate': '다이에틸아미노하이드록시벤조일헥실벤조에이트',
  'ethylhexyl triazone': '에틸헥실트리아존',
  'bis-ethylhexyloxyphenol methoxyphenyl triazine': '비스-에틸헥실옥시페놀메톡시페닐트리아진',
  'methylene bis-benzotriazolyl tetramethylbutylphenol': '메틸렌비스-벤조트리아졸릴테트라메틸부틸페놀',
  octocrylene: '옥토크릴렌',
  homosalate: '호모살레이트',
  'butyl methoxydibenzoylmethane': '부틸메톡시디벤조일메탄',
  avobenzone: '아보벤존',
  ensulizole: '엔설리졸',
  'phenylbenzimidazole sulfonic acid': '페닐벤즈이미다졸설폰산',
  tocopherol: '토코페롤(비타민E)',
  'bifida ferment lysate': '비피다발효용해물',
  'lactobacillus ferment': '락토바실러스발효물',
  'hydrolyzed hyaluronic acid': '가수분해히알루론산',
  'polyglutamic acid': '폴리글루타믹애씨드',
  ethylhexylglycerin: '에틸헥실글리세린',
  '1,2-hexanediol': '1,2-헥산다이올',
  'disodium edta': '다이소듐이디티에이',
  'sodium benzoate': '소듐벤조에이트',
  // 클렌저 계면활성제
  'sodium cocoyl isethionate': '소듐코코일이세티오네이트',
  'sodium methyl cocoyl taurate': '소듐메틸코코일타우레이트',
  'cocamidopropyl betaine': '코카미도프로필베타인',
  'coco-betaine': '코코-베타인',
  'sodium lauryl sulfate': '소듐라우릴설페이트',
  'sodium laureth sulfate': '소듐라우레스설페이트',
  'decyl glucoside': '데실글루코사이드',
  'lauryl glucoside': '라우릴글루코사이드',
  'potassium cocoate': '포타슘코코에이트',
};

/** 한국어 INCI 표기명 → 영문 INCI (소문자) — INCI_KO의 역방향 */
export const KO_TO_EN_INCI: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [en, ko] of Object.entries(INCI_KO)) {
    const k = ko.trim().toLowerCase();
    if (k && m[k] === undefined) m[k] = en.toLowerCase();
  }
  // 추가 별칭 (라벨·브랜드 표기)
  m['에칠헥실글리세린'] = 'ethylhexylglycerin';
  m['2-헥산다이올'] = '1,2-hexanediol';
  return m;
})();

/** INCI 영문명 → 3개 언어 성분 설명 */
export const INGREDIENT_TRILINGUAL: Record<string, { ko: string; en: string; ru: string }> = {
  niacinamide: {
    ko: '피부 톤을 균일하게 하고 모공을 축소시키는 미백·피지 조절 핵심 성분',
    en: 'Brightens skin tone, minimizes pores, and controls sebum',
    ru: 'Выравнивает тон кожи, сужает поры и регулирует выработку себума',
  },
  'hyaluronic acid': {
    ko: '자기 무게의 1000배 수분을 끌어당기는 강력 보습 성분',
    en: 'Attracts 1000x its weight in water for intense hydration',
    ru: 'Притягивает воду в 1000 раз больше своего веса — мощное увлажнение',
  },
  'sodium hyaluronate': {
    ko: '피부 깊숙이 침투해 속건조까지 채워주는 고보습 성분',
    en: 'Penetrates deeply to hydrate from within',
    ru: 'Глубоко проникает в кожу, устраняя внутреннее обезвоживание',
  },
  'hydrolyzed hyaluronic acid': {
    ko: '자기 무게의 1000배 수분을 끌어당기는 강력 보습 성분',
    en: 'Attracts 1000x its weight in water for intense hydration',
    ru: 'Притягивает воду в 1000 раз больше своего веса — мощное увлажнение',
  },
  'centella asiatica extract': {
    ko: '민감하고 손상된 피부를 빠르게 진정·재생시키는 시카 핵심 성분',
    en: 'Soothes and repairs irritated, sensitive skin rapidly',
    ru: 'Быстро успокаивает раздражённую кожу и ускоряет её восстановление',
  },
  madecassoside: {
    ko: '피부 장벽을 복원하고 붉은기를 가라앉히는 시카 정제 성분',
    en: 'Restores skin barrier and calms redness',
    ru: 'Восстанавливает кожный барьер и уменьшает покраснения',
  },
  ceramide: {
    ko: '피부 지질 장벽을 채워 수분 증발을 막고 외부 자극으로부터 보호',
    en: 'Replenishes skin barrier lipids to lock in moisture',
    ru: 'Восполняет липидный барьер кожи, удерживая влагу',
  },
  'ceramide np': {
    ko: '피부 속 세라마이드를 보충해 장벽 기능을 회복시키는 필수 지질',
    en: 'Essential lipid that restores skin barrier function',
    ru: 'Необходимый липид, восстанавливающий барьерную функцию кожи',
  },
  retinol: {
    ko: '주름을 줄이고 피부 재생을 촉진하는 안티에이징 대표 성분',
    en: 'Reduces wrinkles and boosts skin cell turnover',
    ru: 'Уменьшает морщины и ускоряет обновление клеток кожи',
  },
  'ascorbic acid': {
    ko: '강력한 항산화 작용으로 칙칙한 피부를 밝히는 비타민C 원료',
    en: 'Potent antioxidant that brightens dull skin',
    ru: 'Мощный антиоксидант, осветляющий тусклую кожу',
  },
  'ethyl ascorbic acid': {
    ko: '비타민C의 안정적인 유도체로, 피부 톤을 밝게 하고 항산화 효과에 기여하는 성분',
    en: 'Stable vitamin C derivative that brightens skin tone and supports antioxidant defense',
    ru: 'Стабильное производное витамина C для сияния тона и антиоксидантной поддержки',
  },
  '3-o-ethyl ascorbic acid': {
    ko: '비타민C의 안정적인 유도체로, 피부 톤을 밝게 하고 항산화 효과에 기여하는 성분',
    en: 'Stable vitamin C derivative that brightens skin tone and supports antioxidant defense',
    ru: 'Стабильное производное витамина C для сияния тона и антиоксидантной поддержки',
  },
  adenosine: {
    ko: '콜라겐 생성을 촉진해 탄력을 높이고 주름을 완화하는 성분',
    en: 'Stimulates collagen synthesis to firm skin and reduce wrinkles',
    ru: 'Стимулирует синтез коллагена, повышая упругость и уменьшая морщины',
  },
  'snail secretion filtrate': {
    ko: '달팽이 점액으로 피부를 재생·보습·진정하는 K뷰티 대표 성분',
    en: 'K-beauty icon that regenerates, hydrates, and soothes skin',
    ru: 'Знаковый K-beauty компонент: регенерирует, увлажняет и успокаивает кожу',
  },
  'bifida ferment lysate': {
    ko: '피부 마이크로바이옴을 강화해 면역 장벽을 높이는 발효 성분',
    en: 'Ferment that strengthens skin microbiome and immune barrier',
    ru: 'Ферментированный компонент, укрепляющий микробиом кожи',
  },
  'beta-glucan': {
    ko: '피부 면역을 높이고 깊은 보습을 제공하는 다기능 성분',
    en: 'Boosts skin immunity and delivers deep hydration',
    ru: 'Укрепляет иммунитет кожи и обеспечивает глубокое увлажнение',
  },
  squalane: {
    ko: '가볍게 흡수되며 피부 유수분 밸런스를 맞춰주는 오일 성분',
    en: "Lightweight oil that balances skin's moisture and oil levels",
    ru: 'Лёгкое масло, балансирующее уровень влаги и себума в коже',
  },
  allantoin: {
    ko: '예민해진 피부를 진정시키고 세포 재생을 돕는 순한 성분',
    en: 'Gently soothes sensitive skin and promotes cell regeneration',
    ru: 'Мягко успокаивает чувствительную кожу и стимулирует регенерацию клеток',
  },
  panthenol: {
    ko: '프로비타민B5로 피부 보습·진정·회복을 동시에 케어',
    en: 'Pro-vitamin B5 that hydrates, soothes, and repairs skin',
    ru: 'Провитамин B5 — одновременно увлажняет, успокаивает и восстанавливает кожу',
  },
  'alpha-arbutin': {
    ko: '멜라닌 생성을 억제해 기미·색소침착을 완화하는 미백 성분',
    en: 'Inhibits melanin production to fade dark spots',
    ru: 'Подавляет выработку меланина, осветляя пигментные пятна',
  },
  'azelaic acid': {
    ko: '여드름·기미를 동시에 개선하는 다기능 산 성분',
    en: 'Multitasking acid that targets both acne and dark spots',
    ru: 'Многофункциональная кислота против акне и пигментации',
  },
  bakuchiol: {
    ko: '레티놀과 유사한 효능을 자극 없이 발휘하는 식물성 안티에이징 성분',
    en: 'Plant-based retinol alternative with anti-aging benefits, no irritation',
    ru: 'Растительный аналог ретинола с антивозрастным эффектом без раздражения',
  },
  'salicylic acid': {
    ko: '모공 속 피지와 각질을 녹여 블랙헤드·여드름을 개선하는 BHA',
    en: 'BHA that dissolves pore-clogging sebum and dead skin cells',
    ru: 'BHA-кислота, растворяющая себум и омертвевшие клетки в порах',
  },
  glycerin: {
    ko: '강한 보습제로 피부 표면 수분을 끌어당겨 건조함을 완화하는 기본 보습 성분',
    en: 'Powerful humectant that draws moisture to the skin surface',
    ru: 'Мощный увлажнитель, притягивающий влагу к поверхности кожи',
  },
  // 클렌저 계면활성제
  'sodium cocoyl isethionate': {
    ko: '코코넛 유래의 순한 계면활성제로 피부 자극 없이 세정력을 제공',
    en: 'Mild coconut-derived surfactant that cleanses without irritation',
    ru: 'Мягкое ПАВ на основе кокоса, очищает без раздражения кожи',
  },
  'sodium methyl cocoyl taurate': {
    ko: '아미노산 계열의 순한 세정 성분으로 피부 pH를 유지하면서 세정',
    en: 'Gentle amino acid-based cleanser that maintains skin pH',
    ru: 'Мягкое очищающее средство на основе аминокислот, сохраняет pH кожи',
  },
  'cocamidopropyl betaine': {
    ko: '거품을 풍성하게 하고 자극을 줄이는 양쪽성 계면활성제',
    en: 'Amphoteric surfactant that boosts lather and reduces irritation',
    ru: 'Амфотерное ПАВ, усиливающее пену и снижающее раздражение',
  },
  'coco-betaine': {
    ko: '코코넛 유래 순한 양쪽성 계면활성제로 피부 보호 효과를 가지는 세정 성분',
    en: 'Mild coconut-derived amphoteric surfactant with skin-conditioning properties',
    ru: 'Мягкое амфотерное ПАВ из кокоса с кондиционирующими свойствами',
  },
  'decyl glucoside': {
    ko: '식물성 유래의 매우 순한 비이온 계면활성제',
    en: 'Very mild plant-derived non-ionic surfactant',
    ru: 'Очень мягкое растительное неионогенное ПАВ',
  },
  'zinc oxide': {
    ko: '자외선을 산란·반사하는 무기 필터로 넓은 파장의 차단에 쓰이는 대표 성분',
    en: 'Mineral UV filter that scatters and reflects UV for broad-spectrum protection',
    ru: 'Минеральный УФ-фильтр, рассеивающий и отражающий излучение для широкого спектра защиты',
  },
  tocopherol: {
    ko: '활성산소로부터 피부를 보호하는 비타민E 항산화 성분',
    en: 'Vitamin E antioxidant that protects skin from free radicals',
    ru: 'Антиоксидант витамин E, защищающий кожу от свободных радикалов',
  },
};

/**
 * 주어진 INCI 영문 키로 3개 언어 설명을 반환.
 * 직접 매핑, 부분 키워드 순으로 폴백.
 */
export function lookupIngredientTrilingual(
  nameKey: string,
): { ko: string; en: string; ru: string } | null {
  const k = nameKey.trim().toLowerCase();
  const direct = INGREDIENT_TRILINGUAL[k];
  if (direct) return direct;
  // 부분 매칭 (ceramide, peptide, ferment, hyaluronate 등)
  for (const [dictKey, val] of Object.entries(INGREDIENT_TRILINGUAL)) {
    if (k.includes(dictKey) || dictKey.includes(k)) return val;
  }
  return null;
}

/**
 * 주어진 성분명(한국어 또는 영문 INCI)을 영문 INCI 키로 변환.
 * 한국어면 KO_TO_EN_INCI 로, 아니면 소문자 그대로.
 */
export function resolveInciKey(name: string): string {
  const lc = name.trim().toLowerCase();
  return KO_TO_EN_INCI[lc] ?? lc;
}
