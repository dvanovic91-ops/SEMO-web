import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchIngredientLibraryMap,
  normalizeInciKey,
  upsertIngredientLibraryFromJson,
  upsertIngredientLibraryFromSkuId,
  type IngredientLibraryRow,
} from '../../lib/ingredientLibrary';
import { stripLegacyMockHeroClaimPrefix } from '../../lib/skuMarketingDescriptions';
import { supabase } from '../../lib/supabase';
import { getSkinApiBaseUrl, skinApiHeaders } from '../../lib/skinApiBaseUrl';
import {
  axisResultForEndpoint,
  computeAxisScores,
  getAxisDisplayForProductType,
  getProductTypeSummaryKo,
  pctForEndpoint,
  type AxisResult,
} from '../../lib/admin/ingredientAxisScoring';

const SKIN_API_URL = getSkinApiBaseUrl();

function skinApiFetchErrorDetail(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  return `${m} — 요청 베이스: ${SKIN_API_URL}`;
}

/* ─── 타입 ─── */
type SkuCategory = 'beauty' | 'fit' | 'hair';

type IngredientsStatus = 'pending' | 'fetching' | 'done' | 'failed';

type HeroIngredient = { name: string; ko: string; en: string; ru: string };

/** /regenerate-hero-ingredients 의 hero_selection_audit */
type HeroAuditPickRow = {
  name_lower: string;
  display: string;
  position: number;
  concentration_band: string;
  tags: string[];
  score: number | null;
  pool_reasons: string[];
  in_narrow_pool: boolean;
};

type HeroSelectionAudit = {
  product_type: string | null;
  selection_source: string;
  cutoff_pos: number;
  pool_top: number;
  use_narrow_pool: boolean;
  narrow_pool_size: number;
  final_picks: HeroAuditPickRow[];
  eliminated_high_scorers: HeroAuditPickRow[];
  swap_suggestions: HeroAuditPickRow[];
  rationale_ko: string;
};
type IngredientItem = {
  name: string;
  name_lower: string;
  position?: number;
  benefit_tags?: string[];
  avoid_skin_types?: string[];
  /** 라이브러리 Gemini 5축 0–10 */
  axis_scores?: Record<string, number> | null;
  is_sensitizing?: boolean;
  [key: string]: unknown;
};

const PRODUCT_TYPE_OPTIONS = [
  { key: '', label: '— 유형 선택 —' },
  { key: '세럼', label: '세럼 / Serum' },
  { key: '크림', label: '크림 / Cream' },
  { key: '토너', label: '토너 / Toner' },
  { key: '클렌저', label: '클렌저 / Cleanser' },
  { key: '선크림', label: '선크림 / Sunscreen' },
  { key: '로션', label: '로션 / Lotion' },
  { key: '에센스', label: '에센스 / Essence' },
  { key: '앰플', label: '앰플 / Ampoule' },
  { key: '아이크림', label: '아이크림 / Eye Cream' },
  { key: '마스크', label: '마스크 / Mask' },
  { key: '미스트', label: '미스트 / Mist' },
  { key: '오일', label: '오일 / Oil' },
  { key: '필링', label: '필링·스크럽 / Exfoliator' },
  { key: '비타민C', label: '비타민 C / Vitamin C' },
  { key: '기타', label: '기타 / Other' },
] as const;

/**
 * 전성분 카드 ★ 후보: 제품 유형과 INCI benefit_tags가 겹치면 API 선정과 별개로 후보 강조
 * (Flask가 hero_selection_hint를 쓰면 LLM 선정도 같은 축을 따름)
 */
const PRODUCT_TYPE_FOCUS_TAGS: Record<string, string[]> = {
  세럼: ['brightening', 'anti_aging', 'firming', 'antioxidant', 'hydrating', 'exfoliating'],
  크림: ['barrier', 'hydrating', 'soothing', 'anti_aging', 'oil_control'],
  토너: ['hydrating', 'soothing', 'exfoliating', 'barrier'],
  클렌저: ['soothing', 'hydrating', 'barrier'],
  선크림: ['uv_protection', 'antioxidant', 'barrier', 'soothing', 'brightening'],
  비타민C: ['brightening', 'antioxidant', 'anti_aging', 'hydrating', 'soothing'],
  로션: ['hydrating', 'barrier', 'soothing', 'oil_control'],
  에센스: ['hydrating', 'brightening', 'anti_aging', 'antioxidant'],
  앰플: ['brightening', 'anti_aging', 'hydrating', 'antioxidant', 'exfoliating'],
  아이크림: ['anti_aging', 'firming', 'hydrating', 'soothing'],
  마스크: ['hydrating', 'soothing', 'brightening', 'barrier'],
  미스트: ['hydrating', 'soothing', 'barrier'],
  오일: ['barrier', 'hydrating', 'soothing'],
  필링: ['exfoliating', 'brightening', 'acne', 'oil_control'],
  기타: [],
};

/**
 * 전성분 목록 ★ — `isAiHighlightedIngredient`에서만 사용.
 * 정제수·글리세린·범용 글리콜 등은 HERO 사전에 긴 설명이 있어도 히어로 «후보»로 찍히면 안 됨.
 * (이미 DB key_ingredients_desc에 들어간 항목은 아래 함수에서 먼저 처리해 ★ 유지)
 */
const INCI_HERO_STAR_EXCLUDE_LOWER = new Set(
  [
    'water',
    'aqua',
    'eau',
    'glycerin',
    'glycerol',
    'butylene glycol',
    'dipropylene glycol',
    'propylene glycol',
    'pentylene glycol',
    'hexylene glycol',
    '1,2-hexanediol',
    'ethylhexylglycerin',
    'caprylyl glycol',
    'phenoxyethanol',
    'chlorphenesin',
    'disodium edta',
    'tetrasodium edta',
    'sodium benzoate',
    'potassium sorbate',
    'citric acid',
    'sodium citrate',
    'sodium hydroxide',
    'hydrochloric acid',
    'triethanolamine',
    'carbomer',
    'xanthan gum',
    'cellulose gum',
    'ethylhexyl palmitate',
    'cyclopentasiloxane',
    'cyclohexasiloxane',
    'isohexadecane',
    'mineral oil',
    'paraffinum liquidum',
    'ethanol',
    'alcohol denat',
    'denatured alcohol',
    'benzyl alcohol',
    'isopropyl alcohol',
    'sd alcohol 40-b',
  ].map((s) => s.toLowerCase()),
);

function isInciExcludedFromHeroStarHint(nameLower: string): boolean {
  const n = nameLower.trim().toLowerCase();
  if (!n) return false;
  if (INCI_HERO_STAR_EXCLUDE_LOWER.has(n)) return true;
  if (n === 'alcohol' || n.startsWith('alcohol ')) return true;
  return false;
}

/** fetch-ingredients / parse-ingredients-text 바디에 실어 보내는 유형별 선정 가이드 (서버 프롬프트에 반영 권장) */
const HERO_SELECTION_HINTS_BY_TYPE: Record<string, string> = {
  세럼: '집중·고기능 케어에 맞게 미백·안티에이징·탄력·항산화·보습 등 활성이 드러나는 성분을 핵심 3종으로 선정하고, 각각 스토어용 마케팅 문구를 붙이세요.',
  크림: '보습·장벽·지속 촉촉함·진정에 기여하는 성분을 우선 검토해 핵심 3종과 마케팅 문구를 만드세요.',
  토너: '수분 공급·pH·가벼운 각질·진정 등 토너 단계에 맞는 성분을 우선해 핵심 3종을 고르세요.',
  클렌저: '세정·유화·세정 후 당김 완화·진정과 연결되는 성분을 중심으로 핵심 3종을 선정하세요.',
  선크림:
    '광노화·색소(P/N)와 필터·제형 자극(S/R)이 중심입니다. UV 필터(유기·무기)·광안정·분산·필름 형성과 직결된 성분을 히어로로 우선하세요. 글리세린·히알루론산 등 일반 보습만 세 개 대표로 세우지 마세요. 세럼형 미백·주름 활성은 차단 스토리의 핵심이 아니면 히어로로 내세우지 마세요. 알킬 글루코사이드(예: 데실 글루코사이드)는 미백 활성이 아니라 세정·유화 보조이고, 카보머·폴리 알킬 아크릴레이트류는 장벽 강화가 아니라 점도 조절(증점)이므로 히어로·효능 스토리의 중심으로 쓰지 마세요. 의료 효능·과장 SPF 표현은 피하세요.',
  비타민C:
    '톤·광채·항산화(P/N)와 자극·안정화(S/R)가 중심입니다. 비타민C 본체·유도체·안정화 페어(페롤산·토코페롤 등)를 우선하고, 단순 베이스 보습제만 대표로 세우지 마세요.',
  로션: '가벼운 보습·유연·유수분 밸런스에 맞는 성분으로 핵심 3종을 뽑으세요.',
  에센스: '침투·유효 성분 중심으로 보습·미백·안티에이징 등을 드러내는 3종을 선정하세요.',
  앰플: '고농축·집중 케어에 어울리는 소수 정예 활성 성분 3종과 강한 소구 문구를 만드세요.',
  아이크림: '눈가 얇은 피부용 촉촉함·탄력·진정·부기 완화에 연결되는 성분을 우선하세요.',
  마스크: '집중 공급·밀봉·진정·보습·톤 케어에 맞는 성분으로 핵심 3종을 고르세요.',
  미스트: '즉각 수분·쿨링·진정·가벼운 장벽 보조 성분을 중심으로 선정하세요.',
  오일: '유연·밀봉·장벽·영양 공급에 기여하는 지용·보습 성분을 우선 검토하세요.',
  필링: '각질·모공·피지·톤 개선에 직결되는 성분(AHA/BHA/PHA 등)을 우선해 3종을 고르세요.',
  기타: '제품 실제 카테고리에 맞게 기능적으로 의미 있는 성분 3종과 마케팅 문구를 선정하세요.',
};

function buildHeroSelectionApiFields(productType: string | null | undefined): {
  product_type: string | null;
  hero_selection_hint: string | null;
} {
  const t = typeof productType === 'string' ? productType.trim() : '';
  if (!t) return { product_type: null, hero_selection_hint: null };
  const hero_selection_hint =
    HERO_SELECTION_HINTS_BY_TYPE[t] ??
    `제품 유형은「${t}」입니다. 이 유형의 소비자 혜택에 맞게 핵심 성분 3종과 성분별 마케팅 문구를 선정하세요.`;
  return { product_type: t, hero_selection_hint };
}

/** 성분 API 요청 시 선택 — DB에 저장된 카피 컨텍스트만 실음 */
function buildClaimContextApiFields(sku: Partial<SkuItem> | null | undefined): {
  brand_story_hook?: string;
  consumer_theme_summary?: string;
} {
  if (!sku) return {};
  const hook = typeof sku.claim_brand_hook === 'string' ? sku.claim_brand_hook.trim() : '';
  const themes = typeof sku.consumer_theme_summary === 'string' ? sku.consumer_theme_summary.trim() : '';
  const o: { brand_story_hook?: string; consumer_theme_summary?: string } = {};
  if (hook) o.brand_story_hook = hook;
  if (themes) o.consumer_theme_summary = themes;
  return o;
}

/** 효능 태그 → 한국어 */
const BENEFIT_TAG_KO: Record<string, string> = {
  hydrating: '보습', soothing: '진정', brightening: '미백', anti_aging: '안티에이징',
  oil_control: '피지조절', barrier: '장벽강화', exfoliating: '각질제거',
  antioxidant: '항산화', firming: '탄력', acne: '여드름', sensitizing: '주의성분',
  uv_protection: '자외선 차단',
};

/** 효능 태그 → 한 줄 효과 설명 (사전 미매칭 성분의 본문 요약용) */
const BENEFIT_EFFICACY_KO: Record<string, string> = {
  hydrating: '수분을 끌어당기거나 증발을 줄여 촉촉함을 유지하는 보습',
  soothing: '붉은기·불편감을 완화하는 진정',
  brightening: '칙칙한 톤·잡티 완화에 도움을 주는 미백·톤 케어',
  anti_aging: '탄력·주름 개선에 기여하는 안티에이징',
  oil_control: '피지 분비를 조절하는 유·수분 밸런스',
  barrier: '피부 장벽을 보강해 외부 자극으로부터 보호',
  exfoliating: '각질·피지를 녹여 매끈하게 정돈',
  antioxidant: '활성산소로부터 피부를 보호하는 항산화',
  firming: '처짐을 완화하고 탄력감을 높임',
  acne: '트러블·여드름 관리에 쓰이는 케어',
  sensitizing: '민감 피부에 자극이 될 수 있어 주의가 필요할 수 있음',
  uv_protection: 'UV를 흡수·반사·산란해 광선으로부터 피부를 보호하는 자외선 필터·차단 계열 역할',
};

/** 주요 INCI → 한국어 이름 */
const INCI_KO: Record<string, string> = {
  'water': '정제수',
  'glycerin': '글리세린',
  'stearic acid': '스테아릭애씨드',
  'palmitic acid': '팔미틱애씨드',
  'potassium hydroxide': '포타슘하이드록사이드',
  'glyceryl stearate se': '글리세릴스테아레이트SE',
  'glyceryl stearate': '글리세릴스테아레이트',
  fragrance: '향료',
  parfum: '향료',
  'niacinamide': '나이아신아마이드',
  'hyaluronic acid': '히알루론산', 'sodium hyaluronate': '소듐히알루로네이트',
  'panthenol': '판테놀', 'retinol': '레티놀', 'adenosine': '아데노신',
  'centella asiatica extract': '병풀추출물', 'ceramide np': '세라마이드NP',
  'ceramide ap': '세라마이드AP', 'ceramide eop': '세라마이드EOP',
  'allantoin': '알란토인', 'snail secretion filtrate': '달팽이분비물여과액',
  'salicylic acid': '살리실산',   'ascorbic acid': '아스코빅애씨드(비타민C)',
  'ethyl ascorbic acid': '에틸아스코빅애씨드',
  '3-o-ethyl ascorbic acid': '3-O-에틸아스코빅애씨드',
  'sodium ascorbyl phosphate': '소듐아스코빌포스페이트', 'retinyl palmitate': '레티닐팔미테이트',
  'peptide': '펩타이드', 'palmitoyl tripeptide-1': '팔미토일트리펩타이드-1',
  'palmitoyl tetrapeptide-7': '팔미토일테트라펩타이드-7', 'argireline': '아지렐린',
  'glutathione': '글루타치온', 'arbutin': '알부틴', 'kojic acid': '코직산',
  'tranexamic acid': '트라넥삼산', 'azelaic acid': '아젤라익애씨드',
  'lactic acid': '락틱애씨드', 'glycolic acid': '글리콜릭애씨드',
  'beta-glucan': '베타글루칸', 'propolis extract': '프로폴리스추출물',
  'green tea extract': '녹차추출물', 'chamomile extract': '카모마일추출물',
  'aloe barbadensis leaf extract': '알로에베라잎추출물',
  'dimethicone': '디메티콘', 'cyclopentasiloxane': '사이클로펜타실록세인',
  'squalane': '스쿠알란', 'jojoba seed oil': '호호바씨오일',
  'rosehip oil': '로즈힙오일', 'marula oil': '마룰라오일',
  'shea butter': '시어버터', 'madecassoside': '마데카소사이드',
  'asiaticoside': '아시아티코사이드', 'cica': '시카',   'zinc oxide': '징크옥사이드',
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
  'tocopherol': '토코페롤(비타민E)',
  'bifida ferment lysate': '비피다발효용해물', 'lactobacillus ferment': '락토바실러스발효물',
  'hydrolyzed hyaluronic acid': '가수분해히알루론산',
  'polyglutamic acid': '폴리글루타믹애씨드',
  'ethylhexylglycerin': '에틸헥실글리세린',
  '1,2-hexanediol': '1,2-헥산다이올',
  'disodium edta': '다이소듐이디티에이',
  'sodium benzoate': '소듐벤조에이트',
};

/** 파싱된 한글 성분명 → 영문 INCI 키 (사전·효능 문구 lookup용) */
const KO_LABEL_TO_EN_INCI: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [enKey, koLabel] of Object.entries(INCI_KO)) {
    const k = koLabel.trim().toLowerCase();
    if (k && m[k] === undefined) m[k] = enKey.toLowerCase();
  }
  return m;
})();

/** INCI_KO에 없는 표기(라벨·수동 입력) → 영문 키 */
const KO_INCI_ALIASES: Record<string, string> = {
  에칠헥실글리세린: 'ethylhexylglycerin',
  '2-헥산다이올': '1,2-hexanediol',
};

/** 성분명 한국어 변환 (없으면 원명 반환) */
function toKoName(name: string): string {
  return INCI_KO[name.toLowerCase()] ?? name;
}

/** HERO_MARKETING 클라이언트 사본 (Flask와 동기화) */
const HERO_COPY_KO: Record<string, string> = {
  'niacinamide': '피부 톤을 균일하게 하고 모공을 축소시키는 미백·피지 조절 핵심 성분',
  'hyaluronic acid': '자기 무게의 1000배 수분을 끌어당기는 강력 보습 성분',
  'sodium hyaluronate': '피부 깊숙이 침투해 속건조까지 채워주는 고보습 성분',
  'hydrolyzed hyaluronic acid': '자기 무게의 1000배 수분을 끌어당기는 강력 보습 성분',
  'polyglutamic acid': '히알루론산의 4배 보습력으로 오랜 시간 수분을 잡아두는 성분',
  'panthenol': '프로비타민B5로 피부 보습·진정·회복을 동시에 케어',
  'adenosine': 'INCI 기준 주름 개선 고시 성분 — 탄력과 윤기를 높여주는 안티에이징 핵심',
  'retinol': '강력한 세포 재생 유도 성분 — 주름·색소 등 복합 노화에 대응',
  'centella asiatica extract': '병풀 유래 진정·재생 성분 — 민감하고 손상된 피부를 빠르게 회복',
  'madecassoside': '병풀 활성 성분 — 자극 받은 피부를 진정시키고 장벽을 강화',
  'allantoin': '피부 자극을 완화하고 세포 재생을 도와 매끄러운 피부결을 형성',
  'ceramide np': '피부 지질 성분 — 손상된 피부 장벽을 물리적으로 복구',
  'beta-glucan': '피부 장벽을 강화하고 면역력을 높이는 보습·진정 성분',
  'propolis extract': '강력한 항산화·항균 성분 — 여드름성 피부의 트러블을 억제',
  'salicylic acid': '모공 속 각질·피지를 용해해 블랙헤드와 여드름을 관리하는 BHA 성분',
  'glycolic acid': '가장 침투력 높은 AHA — 죽은 각질을 빠르게 제거해 피부결 개선',
  'lactic acid': '순한 AHA — 각질을 제거하면서 보습까지 동시에 제공',
  'arbutin': '멜라닌 생성을 억제해 기미·잡티를 옅게 하는 미백 성분',
  'tranexamic acid': '색소침착을 억제하고 피부 톤을 균일하게 만드는 성분',
  'ascorbic acid': '강력한 항산화 작용으로 칙칙한 피부 톤을 환하게 밝히는 비타민C',
  'ethyl ascorbic acid':
    '비타민C의 안정적인 유도체로, 피부 톤을 밝게 하고 항산화 효과에 기여하는 성분',
  '3-o-ethyl ascorbic acid':
    '비타민C의 안정적인 유도체로, 피부 톤을 밝게 하고 항산화 효과에 기여하는 성분',
  'glutathione': '피부 전체 톤을 투명하게 밝히는 천연 항산화 미백 성분',
  'tocopherol': '활성산소로부터 피부를 보호하는 비타민E 항산화 성분',
  'squalane': '피부와 유사한 오일 — 보습막을 형성하며 가볍게 흡수',
  'snail secretion filtrate': '달팽이 분비물이 피부 재생·보습·탄력을 동시에 케어',
  'bifida ferment lysate': '비피다 발효 유래 성분으로 피부 마이크로바이옴 균형을 강화',
  glycerin:
    '강한 보습제(습윤제)로 피부 표면 수분을 끌어당겨 건조함을 완화하고 제형 안정에도 자주 쓰임',
  'stearic acid':
    '지방산으로 유화·제형 안정에 쓰이며 피부에 얇은 보호막을 남겨 보습감을 보조',
  'palmitic acid':
    '연화·유화를 돕는 지방산으로 씻어내는 제형에서 세정 후 당김을 줄이는 데 기여할 수 있음',
  water: '제품의 기제로 희석·분산을 돕고 피부에 수분을 공급하는 용매',
  'potassium hydroxide':
    'pH 조절·비누화 반응에 쓰이는 염기로, 최종 제형에서는 균형 잡힌 농도로 남는 경우가 많음',
  'glyceryl stearate':
    '유화를 돕는 계면활성 구조로 오일·수분을 섞어 제형을 안정시키고 촉촉한 사용감을 줌',
  'glyceryl stearate se':
    '자가 유화성 유화제로 크림·로션에서 오일과 수분을 안정적으로 결합',
  dimethicone:
    '실리콘계로 피부 표면에 매끈한 막을 형성해 미끌거림을 줄이고 수분 증발을 완화',
  phenoxyethanol: '방부·보존 목적으로 제한 농도에서 쓰이는 합성 보존제',
  ethylhexylglycerin:
    '보존제와 함께 쓰일 때 방부 효과를 보조하고, 피부 컨디셔닝에도 쓰이는 흔한 제형 성분',
  '1,2-hexanediol': '용매·습윤 보조로 제형 안정과 촉촉함에 기여하는 다목적 성분',
  'disodium edta':
    '금속 이온을 칠레이트해 산화·변색을 줄이고 보존계·제형 안정에 도움을 주는 성분',
  'sodium benzoate': '산성 조건에서 곰팡이·효모 번식을 억제하는 방부 성분',
  fragrance: '향을 부여하나 민감 피부에서는 자극 원인이 될 수 있어 패치 테스트가 권장됨',
  parfum: '향료 혼합물로 사용감을 높이지만 알레르기 반응이 보고될 수 있음',
};

/** Flask ingredient_fetcher.HERO_MARKETING 과 동기화 (적용 시 en/ru 저장용) */
const HERO_TRILINGUAL: Record<string, { ko: string; en: string; ru: string }> = {
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
  'tranexamic acid': {
    ko: '기미·잡티에 직접 작용하는 고효율 미백 성분',
    en: 'Directly targets dark spots and uneven pigmentation',
    ru: 'Целенаправленно воздействует на пигментные пятна',
  },
  'salicylic acid': {
    ko: '모공 속 피지와 각질을 녹여 블랙헤드·여드름을 개선하는 BHA',
    en: 'BHA that dissolves pore-clogging sebum and dead skin cells',
    ru: 'BHA-кислота, растворяющая себум и омертвевшие клетки в порах',
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
  'coenzyme q10': {
    ko: '세포 에너지를 활성화해 피부 활력과 탄력을 회복시키는 성분',
    en: 'Energizes skin cells to restore vitality and firmness',
    ru: 'Активирует клеточную энергию, восстанавливая упругость кожи',
  },
  resveratrol: {
    ko: '강력한 항산화 성분으로 노화를 유발하는 활성산소를 차단',
    en: 'Powerful antioxidant that neutralizes free radicals causing aging',
    ru: 'Мощный антиоксидант, нейтрализующий свободные радикалы, вызывающие старение',
  },
  'zinc pca': {
    ko: '피지 분비를 조절하고 여드름균 증식을 억제하는 성분',
    en: 'Regulates sebum and inhibits acne-causing bacteria',
    ru: 'Регулирует выработку себума и подавляет бактерии, вызывающие акне',
  },
  'zinc oxide': {
    ko: '자외선을 산란·반사하는 무기 필터로 넓은 파장의 차단에 쓰이는 대표 성분',
    en: 'Mineral UV filter that scatters and reflects UV for broad-spectrum protection',
    ru: 'Минеральный УФ-фильтр, рассеивающий и отражающий излучение для широкого спектра защиты',
  },
  'titanium dioxide': {
    ko: '자외선을 주로 반사·산란시키는 무기 필터로 가시광·UV 차단 제형에 흔히 쓰임',
    en: 'Mineral filter that mainly reflects and scatters UV; common in protective formulas',
    ru: 'Минеральный фильтр, в основном отражающий и рассеивающий УФ; часто в солнцезащитных формулах',
  },
  'butyloctyl salicylate': {
    ko: 'UVB를 흡수하는 유기 필터이며, 다른 유기 필터의 용해·분산을 돕고 발림성·내수성을 높이는 데 기여',
    en: 'Organic UVB filter; helps solubilize and disperse other filters and improves spread and water resistance',
    ru: 'Органический УФВ-фильтр; помогает растворять и диспергировать другие фильтры, улучшая нанесение и водостойкость',
  },
  'ethylhexyl salicylate': {
    ko: 'UVB를 흡수하는 유기 필터(옥티살레이트 계열)로 선크림 제형에서 널리 쓰임',
    en: 'Organic UVB-absorbing filter (octisalate family), widely used in sunscreens',
    ru: 'Органический фильтр УФВ (семейство октисалата), широко применяется в солнцезащите',
  },
  'diethylamino hydroxybenzoyl hexyl benzoate': {
    ko: 'UVA를 흡수하는 유기 필터로 장파장 UVA 차단·광노화 케어 제형에 중요한 역할',
    en: 'Organic UVA filter important for long-UVA protection and photoaging-focused formulas',
    ru: 'Органический фильтр UVA, важен для защиты от длинноволнового UVA и фотостарения',
  },
  'ethylhexyl triazone': {
    ko: 'UVB를 강하게 흡수하는 유기 필터(트리아존 계열)로 높은 SPF 설계에 자주 사용',
    en: 'High-efficacy organic UVB filter (triazine class), often used for high-SPF designs',
    ru: 'Эффективный органический фильтр УФВ (триазины), часто в формулах с высоким SPF',
  },
  'bis-ethylhexyloxyphenol methoxyphenyl triazine': {
    ko: 'UVA·UVB를 넓게 흡수하는 유기 필터로 광안정성이 좋은 편이라 복합 필터 제형에 쓰임',
    en: 'Broad organic UVA/UVB filter with good photostability, common in multi-filter systems',
    ru: 'Широкий органический фильтр UVA/UVB с хорошей фотостабильностью, часто в комбинациях',
  },
  'methylene bis-benzotriazolyl tetramethylbutylphenol': {
    ko: '자외선을 산란·흡수하는 하이브리드 필터로 넓은 스펙트럼 차단에 기여',
    en: 'Hybrid UV filter that scatters and absorbs, contributing to broad-spectrum coverage',
    ru: 'Гибридный УФ-фильтр (рассеивание и поглощение), расширяет спектр защиты',
  },
  octocrylene: {
    ko: 'UVB 흡수·광안정 보조에 쓰이는 유기 필터로 아보벤존 등과 병용될 때 안정화에 기여하는 경우가 많음',
    en: 'Organic UVB filter and photostabilizer helper, often paired to stabilize avobenzone and similar filters',
    ru: 'Органический фильтр УФВ и помощник фотостабилизации, часто с авобензоном',
  },
  homosalate: {
    ko: 'UVB를 흡수하는 유기 필터로 다른 필터와 병용해 차단 스펙트럼을 넓히는 데 쓰임',
    en: 'Organic UVB filter used with others to broaden protection in sunscreen formulas',
    ru: 'Органический фильтр УФВ, в комбинации расширяет спектр солнцезащиты',
  },
  'butyl methoxydibenzoylmethane': {
    ko: 'UVA를 흡수하는 유기 필터(아보벤존)로 광노화 관련 UVA 차단의 핵심 축으로 쓰임',
    en: 'Organic UVA filter (avobenzone), a core axis for UVA and photoaging-oriented protection',
    ru: 'Органический фильтр UVA (авобензон), ключевой для защиты от UVA и фотостарения',
  },
  avobenzone: {
    ko: 'UVA를 흡수하는 유기 필터로 장파장 UVA 차단에 쓰이며 광안정 제형 설계가 중요',
    en: 'Organic UVA filter; photostable formulation design matters for lasting protection',
    ru: 'Органический фильтр UVA; важна фотостабильность формулы',
  },
  ensulizole: {
    ko: '주로 UVB를 흡수하는 유기 필터(벤즈이미다졸 설폰산 계열)로 수성·가벼운 제형에 쓰일 수 있음',
    en: 'Organic UVB filter (phenylbenzimidazole sulfonic acid family), suited to lighter aqueous formulas',
    ru: 'Органический фильтр УФВ (сульфоновые бензимидазолы), подходит для лёгких формул',
  },
  'phenylbenzimidazole sulfonic acid': {
    ko: '수용성에 가까운 UVB 흡수 필터로 끈적임을 줄인 선 제형에 활용되는 경우가 있음',
    en: 'Water-soluble UVB-absorbing filter sometimes used in lighter-feel sun products',
    ru: 'Водорастворимый фильтр УФВ для более лёгких солнцезащитных текстур',
  },
};

/** ingredient_fetcher.HERO_MARKETING_RINSE_OFF 와 동기화 — 제품 유형이 클렌저일 때만 적용 */
const HERO_TRILINGUAL_RINSE_OFF: Record<string, { ko: string; en: string; ru: string }> = {
  panthenol: {
    ko: '세안 중·직후 당김을 완화하고 진정에 도움을 주는 프로비타민B5',
    en: 'Pro-vitamin B5 that eases tightness during and right after cleansing and soothes skin',
    ru: 'Провитамин B5 смягчает стянутость во время и сразу после умывания и успокаивает кожу',
  },
  adenosine: {
    ko: '세안 후 당김 없이 부드러운 마무리감을 돕는 보습·진정 보조 성분',
    en: 'Supports a comfortable, soft after-cleanse feel in rinse-off formulas (not a leave-on wrinkle-care claim)',
    ru: 'Делает кожу мягче после смываемого очищения (без обещаний ухода от морщин как у сыворотки)',
  },
};

const PARTIAL_HERO_DESC: { kw: string; ko: string; en: string; ru: string }[] = [
  {
    kw: 'ethyl ascorbic',
    ko: '비타민C의 안정적인 유도체로, 피부 톤을 밝게 하고 항산화 효과에 기여하는 성분',
    en: 'Stable vitamin C derivative that brightens skin tone and supports antioxidant defense',
    ru: 'Стабильное производное витамина C для сияния тона и антиоксидантной поддержки',
  },
  { kw: 'ceramide', ko: '피부 지질 장벽을 채워 수분 손실을 막고 외부 자극으로부터 보호', en: 'Fills lipid barrier gaps to retain moisture and shield skin', ru: 'Заполняет липидный барьер, удерживая влагу и защищая кожу' },
  { kw: 'peptide', ko: '피부 단백질 합성을 촉진해 탄력·주름 개선에 기여하는 펩타이드', en: 'Stimulates protein synthesis for firmer, smoother skin', ru: 'Стимулирует синтез белков для упругой и гладкой кожи' },
  { kw: 'hyaluronate', ko: '피부 깊숙이 침투하는 고보습 히알루론산 계열 성분', en: 'Deep-penetrating hyaluronate for lasting hydration', ru: 'Гиалуронат глубокого проникновения для длительного увлажнения' },
  { kw: 'ascorbyl', ko: '안정적으로 작용하는 비타민C 유도체 미백 성분', en: 'Stable vitamin C derivative for effective brightening', ru: 'Стабильное производное витамина C для эффективного осветления' },
  { kw: 'retinyl', ko: '피부 재생과 주름 개선을 돕는 레티놀 계열 성분', en: 'Retinol derivative that promotes skin renewal and wrinkle reduction', ru: 'Производное ретинола для обновления кожи и уменьшения морщин' },
  { kw: 'ferment', ko: '발효 공법으로 피부 흡수율을 높인 바이오틱 성분', en: 'Fermented ingredient for enhanced skin absorption and biotic benefits', ru: 'Ферментированный компонент с улучшенным поглощением и биотическими свойствами' },
];

/** 긴 문자열 우선 매칭 (ingredient_fetcher HERO_ACTIVES 중 len>5) */
const HERO_ACTIVES_LONG: string[] = [
  'snail secretion filtrate', 'centella asiatica extract', 'bifida ferment lysate', 'palmitoyl tetrapeptide-7',
  'palmitoyl tripeptide-1', 'sodium ascorbyl phosphate', '3-o-ethyl ascorbic acid', 'epidermal growth factor',
  'camellia sinensis leaf extract', 'melaleuca alternifolia leaf oil', 'artemisia vulgaris extract',
  'green tea extract', 'licorice root extract', 'madecassoside', 'asiaticoside', 'ceramide np',
  'ceramide ap', 'ceramide eop', 'tranexamic acid', 'hyaluronic acid', 'sodium hyaluronate',
  'hydrolyzed hyaluronic acid', 'polyglutamic acid', 'salicylic acid', 'glycolic acid', 'lactic acid',
  'alpha-arbutin', 'coenzyme q10', 'beta-glucan', 'snail secretion', 'bakuchiol',
  'diethylamino hydroxybenzoyl hexyl benzoate',
  'bis-ethylhexyloxyphenol methoxyphenyl triazine',
  'methylene bis-benzotriazolyl tetramethylbutylphenol',
  'phenylbenzimidazole sulfonic acid',
  'butyl methoxydibenzoylmethane',
  'ethylhexyl salicylate',
  'butyloctyl salicylate',
  'ethylhexyl triazone',
].sort((a, b) => b.length - a.length);

function resolveMarketingTriple(
  name: string,
  nameLower: string,
  productType?: string | null,
): { ko: string; en: string; ru: string; isTemplate: boolean } {
  const pt = (productType ?? '').trim();
  if (pt === '클렌저') {
    const ro = HERO_TRILINGUAL_RINSE_OFF[nameLower];
    if (ro) return { ...ro, isTemplate: false };
  }
  const direct = HERO_TRILINGUAL[nameLower];
  if (direct) return { ...direct, isTemplate: false };
  for (const p of PARTIAL_HERO_DESC) {
    if (nameLower.includes(p.kw)) return { ko: p.ko, en: p.en, ru: p.ru, isTemplate: false };
  }
  for (const h of HERO_ACTIVES_LONG) {
    if (nameLower.includes(h)) {
      const d = HERO_TRILINGUAL[h];
      if (d) return { ...d, isTemplate: false };
    }
  }
  if (nameLower.includes('arbutin') && !nameLower.includes('alpha-arbutin')) {
    const a = HERO_TRILINGUAL['alpha-arbutin'];
    return { ...a, isTemplate: false };
  }
  const koOnly = HERO_COPY_KO[nameLower];
  if (koOnly) {
    return { ko: koOnly, en: `Key benefit: ${name}`, ru: `Ключевой компонент: ${name}`, isTemplate: false };
  }
  return {
    ko: `${toKoName(name)} 함유`,
    en: `Contains ${name}`,
    ru: `Содержит ${name}`,
    isTemplate: true,
  };
}

/** 전성분 행: 한글 라벨·별칭 → 영문 INCI 키 (사전·마케팅 문구 lookup 통일) */
function ingredientInciLookupKey(ing: IngredientItem): string {
  const koLc = ing.name.trim().toLowerCase();
  return (KO_INCI_ALIASES[koLc] ?? KO_LABEL_TO_EN_INCI[koLc] ?? ing.name_lower).toLowerCase();
}

/** 라이브러리·태그·사전 문구로도 못 채울 때만 Gemini 보강 API 호출 가치 있음 */
function rowNeedsLibrarySummary(
  ing: IngredientItem,
  libRow: IngredientLibraryRow | undefined | null,
  productType: string | null | undefined,
): boolean {
  if (libRow?.description_ko?.trim()) return false;
  const lookupKey = ingredientInciLookupKey(ing);
  const mk = resolveMarketingTriple(ing.name, lookupKey, productType);
  if (!mk.isTemplate) return false;
  const tagSet = new Set([...(ing.benefit_tags ?? []), ...(libRow?.benefit_tags ?? [])]);
  if (tagSet.size > 0) return false;
  if (ing.is_sensitizing) return false;
  return true;
}

/** 전성분 카드 본문: 효능·역할 중심 + ingredient_library 캐시 병합 */
function resolveIngredientEffectLine(
  ing: IngredientItem,
  libRow?: IngredientLibraryRow | null,
  productType?: string | null,
  opts?: { skinApiOffline?: boolean; libraryEnrichPending?: boolean; geminiMissingOnServer?: boolean },
): string {
  const lookupKey = ingredientInciLookupKey(ing);
  const mk = resolveMarketingTriple(ing.name, lookupKey, productType);
  if (!mk.isTemplate) return mk.ko;

  if (libRow?.description_ko?.trim()) return libRow.description_ko.trim();

  const tagSet = Array.from(new Set([...(ing.benefit_tags ?? []), ...(libRow?.benefit_tags ?? [])]));
  const effParts = tagSet.map((t) => BENEFIT_EFFICACY_KO[t]).filter(Boolean);
  if (effParts.length > 0) {
    return `${effParts.join(' · ')} 효과로 배합에서 기대되는 역할이 정리된 성분입니다.`;
  }
  if (tagSet.length > 0) {
    const short = tagSet.map((t) => BENEFIT_TAG_KO[t] ?? t).join('·');
    return `${toKoName(ing.name)} — 자동 분류 태그: ${short}.`;
  }
  if (ing.is_sensitizing) {
    return `${toKoName(ing.name)} — 자극·민감 반응이 보고될 수 있어 주의가 필요할 수 있습니다.`;
  }
  if (opts?.libraryEnrichPending) {
    return `${toKoName(ing.name)} — 라이브러리 요약 생성 중…`;
  }
  if (opts?.geminiMissingOnServer) {
    return `${toKoName(ing.name)} — 서버에 GEMINI_API_KEY 없음. 무제 폴더/.env 또는 웹사이트/.env에 넣고 Flask 재시작.`;
  }
  if (opts?.skinApiOffline) {
    return `${toKoName(ing.name)} — 요약은 로컬 성분 API(Gemini) 연결 후 자동으로 채워집니다.`;
  }
  return `${toKoName(ing.name)} — 요약을 생성하지 못했습니다. 잠시 후 접었다 펼치거나 재수집해 보세요.`;
}

/** 농도만 있는 줄 (100 ppm 등) — 성분명 아님 */
function isConcentrationOnlyJunk(name: string): boolean {
  const s = name.trim().toLowerCase();
  if (!s) return true;
  if (/^[\d\s.,]+\s*(ppm|ppb|mg\/kg|µg\/ml|ug\/ml|μg\/ml)\s*\)?$/i.test(s)) return true;
  if (/^[\d\s.,]+%\s*\)?$/i.test(s) && s.length < 32) return true;
  return false;
}

/** INCI Decoder 등에서 앵커 텍스트로 잘못 들어온 비성분 줄 (기존 DB 행도 목록에서 제외) */
function isProbableInciScraperJunk(name: string): boolean {
  const s = name.trim().toLowerCase();
  if (!s || s.length > 140) return true;
  if (isConcentrationOnlyJunk(name)) return true;
  if (/https?:\/\/|www\./.test(s)) return true;
  // URL 앵커 fragment: glycerin#details, water#more 등
  if (s.includes('#')) return true;
  // 대괄호 UI 요소: [more], [+more], [read more] 등
  if (/^\[.{0,20}\]$/.test(s.trim())) return true;
  if (/\b(best|worst)\s+drying\b/.test(s)) return true;
  if (s.startsWith('and at ') || s.startsWith('or at ')) return true;
  if (/\bis\s+/.test(s) && s.length < 48 && !/\b(acid|oil|wax|extract|ester|water|alcohol|glycol)\s*$/.test(s.split(/\s+is\s+/)[0] ?? '')) {
    return true;
  }
  const junk = [
    'read all the',
    'geeky details',
    'click here',
    'about it here',
    'read about all',
    'read about',
    'here >>',
    'here >',
    'show more',
    '[more]',
    'show less',
    'learn more',
    'details about',
    'find out more',
    'see all ingredients',
    'view all',
    'check out',
    'at best',
    'at worst',
    'skin-damaging',
    'skin damaging',
    'alcohol is',
    'is at best',
    'is at worst',
    'and at worst',
    'and at best',
  ];
  return junk.some((j) => s.includes(j));
}

function parseIngredientsJson(raw: unknown[] | null | undefined): IngredientItem[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: IngredientItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : '';
    if (!name.trim() || isProbableInciScraperJunk(name)) continue;
    const name_lower = typeof o.name_lower === 'string' ? o.name_lower : name.toLowerCase();
    const position = typeof o.position === 'number' ? o.position : out.length + 1;
    const benefit_tags = Array.isArray(o.benefit_tags)
      ? (o.benefit_tags.filter((t) => typeof t === 'string') as string[])
      : [];
    const is_sensitizing = Boolean(o.is_sensitizing);
    out.push({ name, name_lower, position, benefit_tags, is_sensitizing });
  }
  return out;
}

function buildHeroNameLowerSet(desc: HeroIngredient[] | null | undefined): Set<string> {
  const s = new Set<string>();
  if (!desc) return s;
  for (const h of desc) {
    if (h.name === '__claim__') continue;
    s.add(h.name.toLowerCase());
  }
  return s;
}

/** Supabase·클라이언트에서 jsonb가 문자열로 올 때 대비 */
function normalizeKeyIngredientsDesc(raw: unknown): HeroIngredient[] {
  if (raw == null) return [];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) arr = p;
    } catch {
      return [];
    }
  } else return [];
  const out: HeroIngredient[] = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.name !== 'string') continue;
    out.push({
      name: o.name,
      ko: typeof o.ko === 'string' ? o.ko : '',
      en: typeof o.en === 'string' ? o.en : '',
      ru: typeof o.ru === 'string' ? o.ru : '',
    });
  }
  return out;
}

/** Flask 응답의 product_claim을 DB key_ingredients_desc 앞줄(__claim__)에 반영 (서버가 jsonb를 안 채우는 경우 보정) */
type ProductClaimApi = { ko: string; en?: string; ru?: string };

function mergeProductClaimIntoDesc(rawDesc: unknown, claim: ProductClaimApi): HeroIngredient[] {
  const k = claim.ko?.trim();
  if (!k) return normalizeKeyIngredientsDesc(rawDesc);
  const kid = normalizeKeyIngredientsDesc(rawDesc);
  const rest = kid.filter((h) => h.name !== '__claim__');
  return [
    { name: '__claim__', ko: k, en: (claim.en ?? '').trim(), ru: (claim.ru ?? '').trim() },
    ...rest,
  ];
}

async function persistProductClaimToSku(skuId: string, claim: ProductClaimApi | null | undefined): Promise<void> {
  if (!supabase || !claim?.ko?.trim()) return;
  const { data: row, error } = await supabase.from('sku_items').select('key_ingredients_desc').eq('id', skuId).single();
  if (error || !row) return;
  const next = mergeProductClaimIntoDesc((row as { key_ingredients_desc: unknown }).key_ingredients_desc, claim);
  await supabase.from('sku_items').update({ key_ingredients_desc: next }).eq('id', skuId);
}

function normalizeIngredientsJsonField(raw: unknown): unknown[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeSkuFromDb(row: Record<string, unknown>): SkuItem {
  const base = { ...row } as unknown as SkuItem;
  const ing = normalizeIngredientsJsonField(row.ingredients_json);
  const coo = row.country_of_origin;
  return {
    ...base,
    country_of_origin: typeof coo === 'string' ? coo : null,
    key_ingredients_desc: normalizeKeyIngredientsDesc(row.key_ingredients_desc),
    ingredients_json: (ing ?? base.ingredients_json) as SkuItem['ingredients_json'],
  };
}

/** 수집 로직과 유사: DB 핵심 성분 + 유형별 태그 우선 + 전용 마케팅 문구가 매핑된 성분 */
function isAiHighlightedIngredient(
  ing: IngredientItem,
  heroLowerSet: Set<string>,
  productType: string | null | undefined,
): boolean {
  const nl = ing.name_lower.trim().toLowerCase();
  if (heroLowerSet.has(nl)) return true;
  const lookupKey = ingredientInciLookupKey(ing).trim().toLowerCase();
  if (isInciExcludedFromHeroStarHint(nl) || isInciExcludedFromHeroStarHint(lookupKey)) return false;
  const pt = productType?.trim();
  if (pt) {
    const focus = PRODUCT_TYPE_FOCUS_TAGS[pt];
    const tags = ing.benefit_tags ?? [];
    if (focus?.length && tags.some((x) => focus.includes(x))) return true;
  }
  const r = resolveMarketingTriple(ing.name, lookupKey, productType);
  return !r.isTemplate;
}

function detectProductType(nameEn: string): string {
  const n = nameEn.toLowerCase();
  if (
    /vitamin\s*c|vita\s*c\b|ethyl\s*ascorbic|ascorbic\s*acid|aa2g|ascorbyl\s*glucoside/i.test(n) &&
    /\b(serum|ampoule|ampule|essence|cream|toner|fluid|concentrate)\b/i.test(n)
  ) {
    return '비타민C';
  }
  if (/\bserum\b/.test(n)) return '세럼';
  // sun cream / sunscreen에는 "cream"이 들어가므로 반드시 일반 크림보다 먼저 판별
  if (/sunscreen|sun\s+cream|sun\s+block|sunblock|\bspf\b|\bpa\+|\buv\b/.test(n)) return '선크림';
  // eye *cream* 도 일반 크림보다 먼저
  if (/eye cream|eye gel|eye serum/.test(n)) return '아이크림';
  if (/\bcream\b/.test(n)) return '크림';
  if (/\btoner?\b/.test(n)) return '토너';
  if (/cleanser|cleansing|foam wash|face wash/.test(n)) return '클렌저';
  if (/\blotion\b/.test(n)) return '로션';
  if (/\bessence\b/.test(n)) return '에센스';
  if (/ampoule|ampule/.test(n)) return '앰플';
  if (/mask|sheet mask/.test(n)) return '마스크';
  if (/\bmist\b|\bspray\b/.test(n)) return '미스트';
  if (/\boil\b/.test(n)) return '오일';
  if (/peel|exfoliant|exfoliator|scrub/.test(n)) return '필링';
  return '';
}

/**
 * INCI 검색·영문명 반영 시 자동 추론 유형 — 이미 저장/선택된 값이
 * 선크림·아이크림·비타민C·클렌저면 덮어쓰지 않음(sun cream → 크림 오분류 방지).
 */
function mergeDetectedProductType(current: string | null | undefined, detected: string): string {
  const cur = (current ?? '').trim();
  const det = (detected ?? '').trim();
  if (!det) return cur;
  if (!cur) return det;
  if (cur === det) return cur;
  const locked = new Set(['선크림', '아이크림', '비타민C', '클렌저']);
  if (locked.has(cur)) return cur;
  return det;
}

type SkuItem = {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  image_url: string | null;
  current_stock: number;
  safety_stock: number;
  unit: string;
  is_active: boolean;
  memo: string | null;
  category: SkuCategory;
  product_type: string | null;
  created_at: string;
  updated_at: string;
  // 성분 분석 필드
  brand: string | null;
  name_en: string | null;
  key_ingredients: string | null;
  key_ingredients_desc: HeroIngredient[] | null;
  ingredients_status: IngredientsStatus | null;
  ingredients_json: unknown[] | null;
  ingredients_fetched_at: string | null;
  /** INCI Decoder 제품 페이지 URL (검색·선택 시 저장, 수집 시 우선 사용) */
  inci_product_url: string | null;
  /** 관리자가 붙여 넣은 전성분 원문 (재오픈 시 유지) */
  ingredients_raw: string | null;
  /** ① 검색란에 적은 브랜드+상품 한 줄(한글) — 재오픈 시 유지 */
  ingredient_search_query_ko: string | null;
  /** 스토어 구성품 상세 — 용량 표기 (예: 50 ml) */
  volume_label: string | null;
  /** 스토어 구성품 상세 — 생산지 (비우면 고객 화면 기본: Made in Korea / Сделано в Корее) */
  country_of_origin: string | null;
  /** 사용법 (다국어) */
  how_to_use: string | null;
  how_to_use_en: string | null;
  how_to_use_ru: string | null;
  description_en?: string | null;
  description_ru?: string | null;
  /** Gemini 핵심 한 줄용 — 브랜드 차별 포인트(추출물·라인 등) */
  claim_brand_hook?: string | null;
  /** 외부 의견 테마 요약 — 수집 시 한국어 우선 권장 */
  consumer_theme_summary?: string | null;
};

type StockTx = {
  id: string;
  sku_id: string;
  type: 'inbound' | 'outbound' | 'adjust';
  qty: number;
  memo: string | null;
  order_id: string | null;
  created_at: string;
};

const BUCKET = 'promos'; // 기존 스토리지 버킷 재사용

const CATEGORIES: { key: SkuCategory; label: string }[] = [
  { key: 'beauty', label: '뷰티박스' },
  { key: 'fit', label: '핏박스' },
  { key: 'hair', label: '헤어박스' },
];

const inputClass =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand min-h-[44px] sm:min-h-0 sm:text-sm';

/** 한글 포함 여부 (브랜드/영문명 필드 검증용) */
function hasHangul(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[가-힣]/.test(text);
}

/** SKU 수정 저장: 상태에 필드가 없으면(undefined) DB 값 유지 — `?.trim() || null` 만으로는 undefined가 null이 되어 전성분 등이 통째로 지워짐 */
function mergeTextFieldForSkuUpdate(stateVal: string | null | undefined, dbVal: unknown): string | null {
  if (stateVal !== undefined) {
    if (stateVal === null) return null;
    return stateVal.trim() || null;
  }
  return typeof dbVal === 'string' ? dbVal : null;
}

function mergeJsonFieldForSkuUpdate<T>(stateVal: T | null | undefined, dbVal: unknown): T | null {
  if (stateVal !== undefined) return (stateVal ?? null) as T | null;
  return (dbVal as T | null) ?? null;
}

/** ① 검색 한 줄 + ②행·표시명에 남아 있는 한글을 한데 모음 (② 라벨이 EN이어도 한글 입력 시 번역 가능) */
function collectHangulProductContext(
  searchQ: string,
  displayName: string | null | undefined,
  rowBrand: string | null | undefined,
  rowNameEn: string | null | undefined,
): string {
  const chunks = [searchQ, displayName ?? '', rowBrand ?? '', rowNameEn ?? '']
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0 && hasHangul(s));
  return Array.from(new Set(chunks)).join(' ').trim();
}

/** 목록 카드: DB 줄바꿈 유지 + 한 줄에 ✨만 이어진 히어로 설명은 항목별 줄로 분리 */
function SkuCardDescription({ text }: { text: string }) {
  const t = text.trim();
  if (!t) return null;
  if (t.includes('\n')) {
    return <p className="mt-0.5 whitespace-pre-line text-[11px] leading-relaxed text-slate-600">{t}</p>;
  }
  if (/✨/.test(t)) {
    const chunks = t.split(/(?=✨\s*)/).map((s) => s.trim()).filter(Boolean);
    if (chunks.length > 1) {
      return (
        <ul className="mt-0.5 list-none space-y-1.5 text-[11px] leading-snug text-slate-600">
          {chunks.map((line, i) => (
            <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
          ))}
        </ul>
      );
    }
  }
  return <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{t}</p>;
}

type SearchProductApiResponse = {
  success: boolean;
  results?: { name_en: string; url: string }[];
  translated_name?: string;
  translated_name_ru?: string;
  translated_brand?: string;
  error?: string;
  note?: string;
};

/* ─── 메인 컴포넌트 ─── */
export function InventoryTab() {
  const [allSkus, setAllSkus] = useState<SkuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<SkuCategory>('beauty');

  // 폼 상태
  const [editingSku, setEditingSku] = useState<Partial<SkuItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** 마지막 INCI 검색 응답의 영문 브랜드·상품명 (목록에서 후보 클릭 시 ②행 브랜드 채움용) */
  const lastInciSearchMetaRef = useRef<{ brandEn?: string; productEn?: string } | null>(null);

  // 입고/조정 모달
  const [txModal, setTxModal] = useState<{ sku: SkuItem; type: 'inbound' | 'adjust' } | null>(null);
  const [txQty, setTxQty] = useState('');
  const [txMemo, setTxMemo] = useState('');
  const [txSaving, setTxSaving] = useState(false);

  // 이력 보기
  const [txHistory, setTxHistory] = useState<{ sku: SkuItem; rows: StockTx[] } | null>(null);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);

  // 성분 분석 요청
  const [fetchingIngredientId, setFetchingIngredientId] = useState<string | null>(null);
  const [generatingClaimSkuId, setGeneratingClaimSkuId] = useState<string | null>(null);
  /** 기존 전성분 JSON으로 AI 핵심 3개만 다시 선정 */
  const [regeneratingHeroSkuId, setRegeneratingHeroSkuId] = useState<string | null>(null);

  // 제품 검색 (모달 내) — 한국어 입력 행 (검색용, DB 저장 안 됨)
  /** ① INCI 검색용 한 줄 (브랜드+상품명 함께) — DB ingredient_search_query_ko 와 동기 */
  const [searchQueryKo, setSearchQueryKo] = useState('');
  const [searchResults, setSearchResults] = useState<{ name_en: string; url: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [pendingTranslation, setPendingTranslation] = useState<{ brand?: string; name?: string } | null>(null);

  // 접기/펼치기
  const [stockSummaryOpen, setStockSummaryOpen] = useState(true);
  /** 목록 카드에서 히어로 문구 EN/RU 줄 펼침 (한글은 항상 표시) */
  const [expandedHeroI18nBySku, setExpandedHeroI18nBySku] = useState<Set<string>>(new Set());
  /** 전성분(한국어) 패널 펼침 */
  const [expandedFullInciBySku, setExpandedFullInciBySku] = useState<Set<string>>(new Set());
  /** 펼친 SKU별 ingredient_library 조회 결과 (전성분 카드 효능 문구 병합) */
  const [ingredientLibMaps, setIngredientLibMaps] = useState<Record<string, Map<string, IngredientLibraryRow>>>({});
  /** 전성분 패널에서 서버 Gemini 라이브러리 보강 호출 중인 SKU */
  const [libraryEnrichingSkuIds, setLibraryEnrichingSkuIds] = useState<Set<string>>(() => new Set());
  /** 동일 ingredients_json에 대해 보강 API 중복 호출 방지 (skuId → JSON 문자열 해시) */
  const libraryAutoEnrichedRef = useRef<Record<string, string>>({});

  /** 성분 API(Flask) 연결 상태 — useEffect 의존성 배열보다 앞에 선언해야 함 */
  const [skinApiHealth, setSkinApiHealth] = useState<'checking' | 'ok' | 'offline'>('checking');
  /** /health 의 gemini_configured (없으면 null = 구버전 서버) */
  const [serverGeminiConfigured, setServerGeminiConfigured] = useState<boolean | null>(null);
  const serverGeminiWarnShownRef = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    // 점수 계산 일관성:
    // 전성분 패널 열림/닫힘과 무관하게 현재 카테고리 SKU의 전성분 기반 라이브러리 맵을 로드한다.
    const ids = allSkus
      .filter((s) => s.category === category)
      .filter((s) => Array.isArray(s.ingredients_json) && s.ingredients_json.length > 0)
      .map((s) => s.id);
    if (ids.length === 0) {
      setIngredientLibMaps({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, Map<string, IngredientLibraryRow>> = {};
      for (const skuId of ids) {
        const sku = allSkus.find((s) => s.id === skuId);
        if (!sku?.ingredients_json) continue;
        const parsed = parseIngredientsJson(sku.ingredients_json as unknown[]);
        const keys = parsed.map((i) => normalizeInciKey(i.name, i.name_lower));
        let map = await fetchIngredientLibraryMap(supabase, keys);
        if (cancelled) return;

        const ijHash = JSON.stringify(sku.ingredients_json);
        const anyNeedsEnrich = parsed.some((ing) => {
          const nk = normalizeInciKey(ing.name, ing.name_lower);
          const row = map.get(nk) ?? map.get(ing.name_lower.trim().toLowerCase());
          return rowNeedsLibrarySummary(ing, row ?? null, sku.product_type);
        });
        const shouldCallEnrichApi =
          skinApiHealth === 'ok' &&
          serverGeminiConfigured !== false &&
          anyNeedsEnrich &&
          libraryAutoEnrichedRef.current[skuId] !== ijHash;

        if (shouldCallEnrichApi) {
          // 레이스 컨디션 방지: API 호출 전에 즉시 마킹 (effect 재실행 시 중복 호출 차단)
          libraryAutoEnrichedRef.current[skuId] = ijHash;
          setLibraryEnrichingSkuIds((prev) => new Set(prev).add(skuId));
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 90_000); // 90초 타임아웃
            const res = await fetch(`${SKIN_API_URL}/enrich-ingredient-library`, {
              method: 'POST',
              headers: skinApiHeaders,
              body: JSON.stringify({
                ingredients: parsed.map((i) => ({
                  name: i.name,
                  name_lower: i.name_lower,
                  benefit_tags: i.benefit_tags,
                  is_sensitizing: i.is_sensitizing,
                  position: i.position,
                })),
                product_type: sku.product_type ?? null,
              }),
              signal: ctrl.signal,
            });
            clearTimeout(timer);
            if (res.ok) {
              map = await fetchIngredientLibraryMap(supabase, keys);
            }
          } catch {
            // 타임아웃/오프라인 — 이미 ref에 마킹됐으므로 재시도 안 함
          } finally {
            setLibraryEnrichingSkuIds((prev) => {
              const n = new Set(prev);
              n.delete(skuId);
              return n;
            });
          }
        } else if (!anyNeedsEnrich && parsed.length > 0) {
          libraryAutoEnrichedRef.current[skuId] = ijHash;
        }

        next[skuId] = map;
      }
      if (!cancelled) setIngredientLibMaps(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, allSkus, category, skinApiHealth, serverGeminiConfigured]);
  /** SKU별 핵심 문구로 쓸 성분 name_lower 최대 3개 */
  const [selectedInciForHero, setSelectedInciForHero] = useState<Record<string, string[]>>({});
  const [heroSelectionAuditBySku, setHeroSelectionAuditBySku] = useState<
    Record<string, HeroSelectionAudit | null>
  >({});
  const [savingHeroSkuId, setSavingHeroSkuId] = useState<string | null>(null);

  // 전성분 직접 입력 (텍스트 붙여넣기)
  const [parsingIngText, setParsingIngText] = useState(false);
  /** DB 저장 없이 파싱 결과만 보기 */
  const [previewParsing, setPreviewParsing] = useState(false);
  const [parsePreview, setParsePreview] = useState<{
    ingredient_count: number;
    hero_ingredients: HeroIngredient[];
    product_claim?: { ko: string; en: string; ru: string };
    sensitizing_count?: number;
  } | null>(null);

  /** ②행 한글 → 영문 번역 버튼 로딩 */
  const [translatingNameEn, setTranslatingNameEn] = useState(false);

  /** 저장 직후 자동으로 /fetch-ingredients 호출 (기본 ON) */
  const [autoFetchAfterSave, setAutoFetchAfterSave] = useState(true);

  /** 토스트 (window.alert 대체) */
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // 현재 카테고리 SKU 필터
  const skus = allSkus.filter((s) => s.category === category);

  const showToast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4800);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${SKIN_API_URL}/health`, { method: 'GET', headers: skinApiHeaders });
        if (cancelled) return;
        if (r.ok) {
          setSkinApiHealth('ok');
          const j = (await r.json().catch(() => ({}))) as { gemini_configured?: boolean };
          if (typeof j.gemini_configured === 'boolean') {
            setServerGeminiConfigured(j.gemini_configured);
            if (j.gemini_configured === false && !serverGeminiWarnShownRef.current) {
              serverGeminiWarnShownRef.current = true;
              showToast(
                'Flask에 GEMINI_API_KEY가 안 잡혔습니다. 키는 무제 폴더/.env 또는 웹사이트/.env → Flask 재시작.',
                'error',
              );
            }
          } else {
            setServerGeminiConfigured(null);
          }
        } else {
          setSkinApiHealth('offline');
          setServerGeminiConfigured(null);
        }
      } catch {
        if (!cancelled) {
          setSkinApiHealth('offline');
          setServerGeminiConfigured(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  /* ── 데이터 로드 ── */
  const loadSkus = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('sku_items')
      .select('*')
      .order('created_at', { ascending: false });
    const raw = (data ?? []) as Record<string, unknown>[];
    setAllSkus(raw.map(normalizeSkuFromDb));
    setLoading(false);
  }, []);

  useEffect(() => { loadSkus(); }, [loadSkus]);

  /* ── 이미지 업로드 ── */
  const handleImageUpload = async (file: File) => {
    if (!supabase) return;
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
      const path = `sku/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || `image/${safeExt}`,
      });
      if (error) { showToast(`업로드 실패: ${error.message}`, 'error'); return; }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setEditingSku((prev) => prev ? { ...prev, image_url: data.publicUrl } : prev);
    } finally {
      setUploading(false);
    }
  };

  /* ── 제품 검색 (INCI Decoder) + 한글 입력 시 Gemini 영문 브랜드/상품명 항상 ②행에 반영 ── */
  const handleSearchProduct = async () => {
    const q = searchQueryKo.trim();
    if (!q) {
      showToast('① 검색란에 브랜드와 상품명을 한 줄로 입력한 뒤 검색하세요.', 'error');
      return;
    }
    setIsSearching(true);
    setSearchResults([]);
    setSearchFailed(false);
    setPendingTranslation(null);
    try {
      const res = await fetch(`${SKIN_API_URL}/search-product`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({
          brand: '',
          product_name: q,
          combined_korean: q,
        }),
      });
      const data = (await res.json()) as SearchProductApiResponse;

      const tBrand = data.translated_brand?.trim() || undefined;
      const tName  = data.translated_name?.trim() || undefined;
      lastInciSearchMetaRef.current = { brandEn: tBrand, productEn: tName };

      // 한글이면 고객용 표시명도 검색줄과 맞춤 (영문만 검색한 경우는 표시명 덮어쓰지 않음)
      if (hasHangul(q)) {
        setEditingSku((p) => (p ? { ...p, display_name: q } : p));
      }

      if (data.success && data.results?.length) {
        setSearchResults(data.results.length > 1 ? data.results : []);
        setEditingSku((p) => {
          if (!p) return p;
          const next: Partial<SkuItem> = { ...p };
          if (tBrand) next.brand = tBrand;
          if (data.results!.length === 1) {
            const row0 = data.results![0];
            const inci = row0.name_en;
            next.name_en = inci;
            next.inci_product_url = row0.url?.trim() || null;
            const detected = detectProductType(inci);
            if (detected) next.product_type = mergeDetectedProductType(next.product_type, detected);
          } else {
            // 후보 여러 개: INCI 정확명은 목록에서 고르고, 그 전까지 Gemini 영문 제품명으로 ②행 채움
            if (tName) {
              next.name_en = tName;
              const detected = detectProductType(tName);
              if (detected) next.product_type = mergeDetectedProductType(next.product_type, detected);
            }
          }
          return next;
        });
        setSearchFailed(false);
        setPendingTranslation(null);
      } else {
        // INCI 미등록(422 등) — 번역값이 있으면 ②행에 바로 넣어 저장 가능하게 함
        setSearchResults([]);
        setSearchFailed(true);
        setPendingTranslation({ brand: tBrand, name: tName });
        setEditingSku((p) => {
          if (!p) return p;
          const next: Partial<SkuItem> = { ...p };
          if (tBrand) next.brand = tBrand;
          if (tName) {
            next.name_en = tName;
            const detected = detectProductType(tName);
            if (detected) next.product_type = mergeDetectedProductType(next.product_type, detected);
          }
          return next;
        });
        if (tBrand || tName) {
          showToast(
            'INCI Decoder에 제품이 없습니다. 영문 브랜드/상품명은 ② 행에 반영했습니다. 전성분 붙여넣기 또는 나중에 재시도하세요.',
            'info',
          );
        } else if (data.error) {
          showToast(
            `${data.error} 한글→영문 번역이 비어 있으면 서버 GEMINI_API_KEY를 확인하세요.`,
            'error',
          );
        }
      }
    } catch (e) {
      showToast(`API 연결 오류: ${skinApiFetchErrorDetail(e)} (무제 폴더에서 python main.py 또는 VITE_SKIN_API_URL)`, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  /** ①행 한글만 있고 검색은 안 했을 때 — 영문 ②행만 채우기 */
  const handleFillEnglishFromKo = async () => {
    const mergedKo = collectHangulProductContext(
      searchQueryKo,
      editingSku?.display_name,
      (editingSku as Partial<SkuItem>)?.brand,
      (editingSku as Partial<SkuItem>)?.name_en,
    );
    if (!mergedKo) {
      showToast('① 검색란 또는 ② 행(브랜드/상품명)에 한글이 있어야 영문 자동 채우기를 할 수 있습니다.', 'error');
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`${SKIN_API_URL}/search-product`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({
          brand: '',
          product_name: mergedKo,
          combined_korean: mergedKo,
        }),
      });
      const data = (await res.json()) as SearchProductApiResponse;
      const tBrand = data.translated_brand?.trim();
      const tName  = data.translated_name?.trim();
      lastInciSearchMetaRef.current = { brandEn: tBrand, productEn: tName };
      if (!tBrand && !tName) {
        showToast('번역 결과가 없습니다. GEMINI_API_KEY와 입력 한글을 확인하세요.', 'error');
        return;
      }
      setEditingSku((p) => {
        if (!p) return p;
        const next: Partial<SkuItem> = { ...p };
        if (hasHangul(searchQueryKo.trim())) next.display_name = searchQueryKo.trim();
        else if (hasHangul(p.display_name ?? '')) next.display_name = p.display_name;
        if (tBrand) next.brand = tBrand;
        if (tName) {
          next.name_en = tName;
          const d = detectProductType(tName);
          if (d) next.product_type = mergeDetectedProductType(next.product_type, d);
        }
        return next;
      });
    } catch (e) {
      showToast(`API 오류: ${skinApiFetchErrorDetail(e)}`, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  /* ── 검색 실패 후 번역명 재적용 (한글을 name_en에 넣지 않도록 pending만 사용) ── */
  const handleRegisterTranslatedName = () => {
    const nameToUse  = pendingTranslation?.name;
    const brandToUse = pendingTranslation?.brand;
    if (!nameToUse && !brandToUse) {
      showToast('재적용할 영문 번역이 없습니다. 먼저 🔍 검색을 다시 실행하세요.', 'error');
      return;
    }
    setEditingSku((p) => p ? {
      ...p,
      ...(nameToUse ? { name_en: nameToUse } : {}),
      ...(brandToUse ? { brand: brandToUse } : {}),
    } : p);
    setSearchFailed(false);
    setPendingTranslation(null);
  };

  /* ── name_en 필드 한국어 → 영어 번역 ── */
  const handleTranslateNameEn = async () => {
    const mergedKo = collectHangulProductContext(
      searchQueryKo,
      editingSku?.display_name,
      (editingSku as Partial<SkuItem>)?.brand,
      (editingSku as Partial<SkuItem>)?.name_en,
    );
    if (!mergedKo) {
      showToast(
        '번역할 한글이 없습니다. ① 검색란 또는 ② 행에 한글로 브랜드·상품명을 입력하세요. (영문만 있으면 이 버튼은 동작하지 않습니다.)',
        'error',
      );
      return;
    }
    setTranslatingNameEn(true);
    try {
      const res = await fetch(`${SKIN_API_URL}/search-product`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({
          brand: '',
          product_name: mergedKo,
          combined_korean: mergedKo,
        }),
      });
      const data = (await res.json()) as SearchProductApiResponse;
      const tName = data.translated_name?.trim();
      const tBrand = data.translated_brand?.trim();
      if (tName || tBrand) {
        setEditingSku((p) => {
          if (!p) return p;
          const next: Partial<SkuItem> = { ...p };
          if (tName) {
            next.name_en = tName;
            const d = detectProductType(tName);
            if (d) next.product_type = mergeDetectedProductType(next.product_type, d);
          }
          if (tBrand) next.brand = tBrand;
          return next;
        });
      } else {
        showToast('번역 결과를 가져오지 못했습니다. GEMINI_API_KEY와 입력 한글을 확인하세요.', 'error');
      }
    } catch (e) {
      showToast(`번역 API 오류: ${skinApiFetchErrorDetail(e)}`, 'error');
    } finally {
      setTranslatingNameEn(false);
    }
  };

  /* ── SKU 저장 (생성/수정) ── */
  const handleSave = async () => {
    if (!supabase || !editingSku?.name?.trim()) {
      showToast('SKU 이름을 입력하세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      let brandVal = (editingSku as Partial<SkuItem>).brand?.trim() || null;
      let nameEnVal = (editingSku as Partial<SkuItem>).name_en?.trim() || null;

      // ②행에 한글이 남아 있으면 저장 직전에 한 번 더 번역 시도 (검색 안 한 경우 대비)
      if (hasHangul(brandVal) || hasHangul(nameEnVal)) {
        try {
          const mergedKo = collectHangulProductContext(
            searchQueryKo,
            editingSku.display_name,
            brandVal,
            nameEnVal,
          );
          if (!mergedKo) {
            showToast('② 행에 한글이 있으나 번역에 쓸 문맥이 비었습니다. ① 검색란에 한 줄로 적어 주세요.', 'error');
            setSaving(false);
            return;
          }
          const res = await fetch(`${SKIN_API_URL}/search-product`, {
            method: 'POST',
            headers: skinApiHeaders,
            body: JSON.stringify({
              brand: '',
              product_name: mergedKo,
              combined_korean: mergedKo,
            }),
          });
          const data = (await res.json()) as SearchProductApiResponse;
          if (data.translated_brand?.trim()) brandVal = data.translated_brand.trim();
          if (data.translated_name?.trim()) nameEnVal = data.translated_name.trim();
          if (hasHangul(brandVal) || hasHangul(nameEnVal)) {
            showToast(
              '브랜드명(EN)·상품명(EN)에 한글이 남아 있습니다. ①에 한글로 채운 뒤 🔍 검색 또는「한글→영문」을 실행하세요.',
              'error',
            );
            setSaving(false);
            return;
          }
          setEditingSku((p) => (p ? { ...p, brand: brandVal ?? undefined, name_en: nameEnVal ?? undefined } : p));
        } catch {
          showToast('번역 API 오류로 저장을 중단했습니다.', 'error');
          setSaving(false);
          return;
        }
      }

      const inciUrlVal = (editingSku as Partial<SkuItem>).inci_product_url?.trim() || null;

      const p = editingSku as Partial<SkuItem>;
      const isInsert = !editingSku.id;

      let dbSnap: Record<string, unknown> | null = null;
      if (!isInsert) {
        const { data, error: snapErr } = await supabase
          .from('sku_items')
          .select(
            'ingredients_raw, key_ingredients, key_ingredients_desc, description, display_name, memo, image_url, ingredients_json, ingredients_status, safety_stock, unit, is_active, category, product_type, volume_label, country_of_origin, how_to_use, how_to_use_en, how_to_use_ru, claim_brand_hook, consumer_theme_summary',
          )
          .eq('id', editingSku.id)
          .single();
        if (snapErr) throw snapErr;
        dbSnap = data ?? null;
      }

      /** 전성분 파싱 결과(JSON) — 저장 시 상태 필드와 동기 */
      const mergedIj = isInsert
        ? Array.isArray(p.ingredients_json) && p.ingredients_json.length > 0
          ? p.ingredients_json
          : null
        : mergeJsonFieldForSkuUpdate<unknown[] | null>(
            p.ingredients_json as unknown[] | null | undefined,
            dbSnap?.ingredients_json,
          );
      const hasParsedIngredients = Array.isArray(mergedIj) && mergedIj.length > 0;
      const ingredientsStatus: IngredientsStatus = hasParsedIngredients
        ? 'done'
        : !isInsert
          ? ((dbSnap?.ingredients_status as IngredientsStatus) ?? 'pending')
          : 'pending';

      const payload = isInsert
        ? {
            name: editingSku.name.trim(),
            display_name: p.display_name?.trim() || null,
            description: p.description?.trim() || null,
            image_url: p.image_url || null,
            safety_stock: p.safety_stock ?? 0,
            unit: p.unit || 'ea',
            is_active: p.is_active ?? true,
            memo: p.memo?.trim() || null,
            category: p.category || category,
            brand: brandVal,
            name_en: nameEnVal,
            key_ingredients: p.key_ingredients?.trim() || null,
            key_ingredients_desc: p.key_ingredients_desc ?? null,
            product_type: p.product_type?.trim() || null,
            inci_product_url: inciUrlVal,
            ingredients_raw:
              typeof p.ingredients_raw === 'string' ? p.ingredients_raw.trim() || null : p.ingredients_raw ?? null,
            ingredient_search_query_ko: searchQueryKo.trim() || null,
            ingredients_json: mergedIj,
            ingredients_status: ingredientsStatus,
            volume_label: p.volume_label?.trim() || null,
            country_of_origin: p.country_of_origin?.trim() || null,
            how_to_use: p.how_to_use?.trim() || null,
            how_to_use_en: p.how_to_use_en?.trim() || null,
            how_to_use_ru: p.how_to_use_ru?.trim() || null,
            claim_brand_hook: p.claim_brand_hook?.trim() || null,
            consumer_theme_summary: p.consumer_theme_summary?.trim() || null,
          }
        : {
            name: editingSku.name.trim(),
            display_name: mergeTextFieldForSkuUpdate(p.display_name, dbSnap?.display_name),
            description: mergeTextFieldForSkuUpdate(p.description, dbSnap?.description),
            image_url:
              p.image_url !== undefined ? p.image_url || null : (dbSnap?.image_url as string | null) ?? null,
            safety_stock: p.safety_stock ?? (dbSnap?.safety_stock as number) ?? 0,
            unit: p.unit || (dbSnap?.unit as string) || 'ea',
            is_active: p.is_active ?? (dbSnap?.is_active as boolean) ?? true,
            memo: mergeTextFieldForSkuUpdate(p.memo, dbSnap?.memo),
            category: (p.category ?? (dbSnap?.category as SkuCategory)) || category,
            brand: brandVal,
            name_en: nameEnVal,
            key_ingredients: mergeTextFieldForSkuUpdate(p.key_ingredients, dbSnap?.key_ingredients),
            key_ingredients_desc: mergeJsonFieldForSkuUpdate<HeroIngredient[] | null>(
              p.key_ingredients_desc,
              dbSnap?.key_ingredients_desc,
            ),
            product_type: mergeTextFieldForSkuUpdate(p.product_type, dbSnap?.product_type),
            inci_product_url: inciUrlVal,
            ingredients_raw: mergeTextFieldForSkuUpdate(p.ingredients_raw, dbSnap?.ingredients_raw),
            ingredient_search_query_ko: searchQueryKo.trim() || null,
            ingredients_json: mergedIj,
            ingredients_status: ingredientsStatus,
            volume_label: mergeTextFieldForSkuUpdate(p.volume_label, dbSnap?.volume_label),
            country_of_origin: mergeTextFieldForSkuUpdate(p.country_of_origin, dbSnap?.country_of_origin),
            how_to_use: mergeTextFieldForSkuUpdate(p.how_to_use, dbSnap?.how_to_use),
            how_to_use_en: mergeTextFieldForSkuUpdate(p.how_to_use_en, dbSnap?.how_to_use_en),
            how_to_use_ru: mergeTextFieldForSkuUpdate(p.how_to_use_ru, dbSnap?.how_to_use_ru),
            claim_brand_hook: mergeTextFieldForSkuUpdate(p.claim_brand_hook, dbSnap?.claim_brand_hook),
            consumer_theme_summary: mergeTextFieldForSkuUpdate(
              p.consumer_theme_summary,
              dbSnap?.consumer_theme_summary,
            ),
          };

      const heroSelectionApi = buildHeroSelectionApiFields(payload.product_type);

      let savedId: string | null = editingSku.id ?? null;

      if (editingSku.id) {
        const { error } = await supabase.from('sku_items').update(payload).eq('id', editingSku.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from('sku_items')
          .insert({ ...payload, current_stock: 0 })
          .select('id')
          .single();
        if (error) throw error;
        savedId = inserted?.id ?? null;
      }

      if (supabase && hasParsedIngredients && mergedIj) {
        await upsertIngredientLibraryFromJson(supabase, mergedIj);
      }

      /* 전성분 JSON이 이미 있으면 INCI 재수집을 하지 않음 — 실패 토스트·상태 꼬임 방지 */
      if (autoFetchAfterSave && savedId && !hasParsedIngredients) {
        try {
          const res = await fetch(`${SKIN_API_URL}/fetch-ingredients`, {
            method: 'POST',
            headers: skinApiHeaders,
          body: JSON.stringify({
            sku_id: savedId,
            product_name: editingSku.display_name?.trim() || editingSku.name?.trim() || '',
            brand: brandVal ?? '',
            name_en: nameEnVal ?? '',
            inci_product_url: inciUrlVal ?? '',
            ...heroSelectionApi,
            ...buildClaimContextApiFields(editingSku as Partial<SkuItem>),
          }),
          });
          const fetchData = (await res.json()) as {
            success: boolean;
            error?: string;
            ingredient_count?: number;
            product_claim?: ProductClaimApi;
          };
          if (fetchData.success) {
            await persistProductClaimToSku(savedId, fetchData.product_claim);
            showToast(`저장 후 성분 수집 완료 (${fetchData.ingredient_count ?? 0}개)`, 'success');
          } else {
            showToast(`저장은 완료됐으나 성분 수집 실패: ${fetchData.error ?? '알 수 없는 오류'}`, 'error');
          }
        } catch (e) {
          showToast(`저장은 완료됐으나 성분 API 오류: ${skinApiFetchErrorDetail(e)}`, 'error');
        }
      } else {
        showToast('저장했습니다.', 'success');
      }

      setEditingSku(null);
      setAutoFetchAfterSave(true);
      await loadSkus();
    } catch (err) {
      showToast('저장 실패: ' + (err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── 입고/조정 처리 ── */
  const handleTxSubmit = async () => {
    if (!supabase || !txModal) return;
    const qty = parseInt(txQty, 10);
    if (isNaN(qty) || qty === 0) { showToast('수량을 입력하세요.', 'error'); return; }
    setTxSaving(true);
    try {
      const finalQty = txModal.type === 'inbound' ? Math.abs(qty) : qty;
      const { error } = await supabase.from('stock_transactions').insert({
        sku_id: txModal.sku.id,
        type: txModal.type,
        qty: finalQty,
        memo: txMemo.trim() || null,
      });
      if (error) throw error;
      setTxModal(null);
      setTxQty('');
      setTxMemo('');
      await loadSkus();
    } catch (err) {
      showToast('처리 실패: ' + (err as Error).message, 'error');
    } finally {
      setTxSaving(false);
    }
  };

  /* ── 이력 조회 ── */
  const loadHistory = async (sku: SkuItem) => {
    if (!supabase) return;
    setTxHistoryLoading(true);
    const { data } = await supabase
      .from('stock_transactions')
      .select('*')
      .eq('sku_id', sku.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setTxHistory({ sku, rows: (data as StockTx[]) ?? [] });
    setTxHistoryLoading(false);
  };

  /* ── SKU 삭제 ── */
  const handleDelete = async (sku: SkuItem) => {
    if (!supabase) return;
    if (!window.confirm(`"${sku.name}" SKU를 삭제합니까? 관련 입출고 이력도 함께 삭제됩니다.`)) return;
    await supabase.from('sku_items').delete().eq('id', sku.id);
    await loadSkus();
  };

  /* ── 성분 분석 요청 ── */
  const handleFetchIngredients = async (sku: SkuItem) => {
    if (fetchingIngredientId) return; // 이미 다른 요청 진행 중
    setFetchingIngredientId(sku.id);

    // 낙관적 UI: 즉시 'fetching' 으로 표시
    setAllSkus((prev) =>
      prev.map((s) => s.id === sku.id ? { ...s, ingredients_status: 'fetching' } : s)
    );

    try {
      const res = await fetch(`${SKIN_API_URL}/fetch-ingredients`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({
          sku_id:           sku.id,
          product_name:     sku.display_name ?? sku.name,
          brand:            sku.brand ?? '',
          name_en:          sku.name_en ?? '',
          inci_product_url: sku.inci_product_url ?? '',
          ...buildHeroSelectionApiFields(sku.product_type),
          ...buildClaimContextApiFields(sku),
        }),
      });
      const data = await res.json() as {
        success: boolean;
        ingredient_count?: number;
        hero_ingredients?: HeroIngredient[];
        found_name_en?: string;
        product_claim?: ProductClaimApi;
        error?: string;
      };

      if (data.success) {
        await persistProductClaimToSku(sku.id, data.product_claim);
        // 영문명 자동 채우기 (기존에 없을 때만)
        if (data.found_name_en) {
          setAllSkus((prev) =>
            prev.map((s) => s.id === sku.id && !s.name_en
              ? { ...s, name_en: data.found_name_en! }
              : s
            )
          );
        }
        const heroNames = (data.hero_ingredients ?? []).map((h) => h.name).join(', ');
        showToast(`성분 분석 완료 · ${data.ingredient_count ?? 0}개 · 핵심: ${heroNames || '없음'}`, 'success');
      } else {
        showToast(`성분 분석 실패: ${data.error ?? '알 수 없는 오류'}`, 'error');
      }
    } catch (e) {
      showToast(`성분 API 연결 오류: ${skinApiFetchErrorDetail(e)}`, 'error');
    } finally {
      setFetchingIngredientId(null);
      await loadSkus(); // DB에서 최신 상태 재로드
      if (supabase) await upsertIngredientLibraryFromSkuId(supabase, sku.id);
    }
  };

  const handleGenerateClaimOnly = async (sku: SkuItem) => {
    if (generatingClaimSkuId) return;
    setGeneratingClaimSkuId(sku.id);
    try {
      const res = await fetch(`${SKIN_API_URL}/generate-claim-only`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({ sku_id: sku.id }),
      });
      const data = await res.json() as { success: boolean; product_claim?: ProductClaimApi; error?: string };
      if (data.success && data.product_claim) {
        showToast(`마케팅문구 생성 완료: ${data.product_claim.ko}`, 'success');
        await loadSkus();
      } else {
        showToast(`마케팅문구 생성 실패: ${data.error ?? '알 수 없는 오류'}`, 'error');
      }
    } catch (e) {
      showToast(`API 연결 오류: ${skinApiFetchErrorDetail(e)}`, 'error');
    } finally {
      setGeneratingClaimSkuId(null);
    }
  };

  const handleRegenerateHeroIngredients = async (sku: SkuItem) => {
    if (regeneratingHeroSkuId) return;
    setRegeneratingHeroSkuId(sku.id);
    const pickedLower = (selectedInciForHero[sku.id] ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);
    try {
      const res = await fetch(`${SKIN_API_URL}/regenerate-hero-ingredients`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({
          sku_id: sku.id,
          ...buildHeroSelectionApiFields(sku.product_type),
          ...buildClaimContextApiFields(sku),
          ...(pickedLower.length === 3 ? { forced_name_lowers: pickedLower } : {}),
        }),
      });
      const data = await res.json() as {
        success: boolean;
        hero_ingredients?: HeroIngredient[];
        hero_selection_audit?: HeroSelectionAudit;
        error?: string;
      };
      if (data.success) {
        const names = (data.hero_ingredients ?? []).map((h) => h.name).join(', ');
        const src =
          pickedLower.length === 3 ? ' (체크한 3성분 기준)' : '';
        showToast(`핵심 재선정 완료${src} · ${names || '반영됨'}`, 'success');
        if (data.hero_selection_audit) {
          setHeroSelectionAuditBySku((prev) => ({
            ...prev,
            [sku.id]: data.hero_selection_audit ?? null,
          }));
        }
        await loadSkus();
      } else {
        showToast(`핵심 재선정 실패: ${data.error ?? '알 수 없는 오류'}`, 'error');
      }
    } catch (e) {
      showToast(`API 연결 오류: ${skinApiFetchErrorDetail(e)}`, 'error');
    } finally {
      setRegeneratingHeroSkuId(null);
    }
  };

  const handleToggleFullInci = (sku: SkuItem) => {
    setExpandedFullInciBySku((prev) => {
      const wasOpen = prev.has(sku.id);
      const next = new Set(prev);
      if (wasOpen) {
        next.delete(sku.id);
        delete libraryAutoEnrichedRef.current[sku.id];
      } else {
        next.add(sku.id);
        setSelectedInciForHero((sel) => {
          if (sel[sku.id]?.length) return sel;
          const parsed = parseIngredientsJson(sku.ingredients_json as unknown[]);
          const heroes = (sku.key_ingredients_desc ?? []).filter((h) => h.name !== '__claim__');
          const init: string[] = [];
          for (const h of heroes) {
            const hit = parsed.find((x) => x.name_lower === h.name.toLowerCase());
            if (hit) init.push(hit.name_lower);
          }
          return { ...sel, [sku.id]: init.slice(0, 3) };
        });
      }
      return next;
    });
  };

  const toggleInciHeroSelect = (skuId: string, nameLower: string) => {
    setSelectedInciForHero((prev) => {
      const cur = prev[skuId] ?? [];
      const idx = cur.indexOf(nameLower);
      if (idx >= 0) return { ...prev, [skuId]: cur.filter((x) => x !== nameLower) };
      if (cur.length >= 3) {
        showToast('핵심 마케팅 문구를 교체하려면 정확히 3개를 선택하세요.', 'error');
        return prev;
      }
      return { ...prev, [skuId]: [...cur, nameLower] };
    });
  };

  const handleApplyHeroFromFullList = async (sku: SkuItem) => {
    if (!supabase) return;
    const picked = selectedInciForHero[sku.id] ?? [];
    if (picked.length !== 3) {
      showToast('핵심 문구를 교체하려면 성분을 정확히 3개 선택하세요.', 'error');
      return;
    }
    const parsed = parseIngredientsJson(sku.ingredients_json as unknown[]);
    const libMap = ingredientLibMaps[sku.id];
    const newHeroes: HeroIngredient[] = [];
    for (const nl of picked) {
      const ing = parsed.find((x) => x.name_lower === nl);
      if (!ing) {
        showToast('선택한 성분을 전성분 목록에서 찾을 수 없습니다. 패널을 닫았다 다시 열어보세요.', 'error');
        return;
      }
      const m = resolveMarketingTriple(ing.name, ingredientInciLookupKey(ing), sku.product_type);
      const nk = normalizeInciKey(ing.name, ing.name_lower);
      const libRow =
        libMap?.get(nk) ?? libMap?.get(ing.name_lower.trim().toLowerCase()) ?? null;
      const libKo = libRow?.description_ko?.trim();
      const ko = m.isTemplate && libKo ? libKo : m.ko;
      newHeroes.push({ name: ing.name, ko, en: m.en, ru: m.ru });
    }
    const claim = sku.key_ingredients_desc?.find((h) => h.name === '__claim__');
    const nextDesc: HeroIngredient[] = claim ? [claim, ...newHeroes] : newHeroes;
    setSavingHeroSkuId(sku.id);
    try {
      const { error } = await supabase
        .from('sku_items')
        .update({
          key_ingredients_desc: nextDesc,
          key_ingredients: newHeroes.map((h) => h.name).join(', '),
        })
        .eq('id', sku.id);
      if (error) throw error;
      await loadSkus();
      showToast('핵심 성분 마케팅 문구 3개를 적용했습니다.', 'success');
    } catch (e) {
      showToast('저장 실패: ' + (e as Error).message, 'error');
    } finally {
      setSavingHeroSkuId(null);
    }
  };

  /* ── 전성분 텍스트 미리보기 (DB 미반영) ── */
  const handlePreviewParse = async () => {
    const raw = ((editingSku as Partial<SkuItem>)?.ingredients_raw ?? '').trim();
    if (!raw) {
      showToast('성분 텍스트를 입력하세요.', 'error');
      return;
    }
    setPreviewParsing(true);
    setParsePreview(null);
    try {
      const res = await fetch(`${SKIN_API_URL}/parse-ingredients-text`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({
          preview_only: true,
          raw_text:     raw,
          product_name: editingSku?.display_name ?? editingSku?.name ?? '',
          brand:        (editingSku as Partial<SkuItem>)?.brand ?? '',
          name_en:      (editingSku as Partial<SkuItem>)?.name_en ?? '',
          ...buildHeroSelectionApiFields((editingSku as Partial<SkuItem>)?.product_type),
          ...buildClaimContextApiFields(editingSku as Partial<SkuItem>),
        }),
      });
      const data = await res.json() as {
        success: boolean;
        ingredient_count?: number;
        hero_ingredients?: HeroIngredient[];
        product_claim?: { ko: string; en: string; ru: string };
        sensitizing_count?: number;
        error?: string;
      };
      if (data.success) {
        setParsePreview({
          ingredient_count: data.ingredient_count ?? 0,
          hero_ingredients: data.hero_ingredients ?? [],
          product_claim:    data.product_claim,
          sensitizing_count: data.sensitizing_count,
        });
      } else {
        showToast(`미리보기 실패: ${data.error ?? '알 수 없는 오류'}`, 'error');
      }
    } catch (e) {
      showToast(`API 연결 오류: ${skinApiFetchErrorDetail(e)}`, 'error');
    } finally {
      setPreviewParsing(false);
    }
  };

  /* ── 전성분 텍스트 직접 붙여넣기 파싱 (DB 저장) ── */
  const handleParseIngText = async () => {
    const raw = ((editingSku as Partial<SkuItem>)?.ingredients_raw ?? '').trim();
    if (!raw) { showToast('성분 텍스트를 입력하세요.', 'error'); return; }
    if (!editingSku?.id) { showToast('DB에 저장하려면 SKU를 먼저 저장하세요. 미리보기는「미리보기」버튼으로 가능합니다.', 'error'); return; }
    setParsingIngText(true);
    try {
      const res = await fetch(`${SKIN_API_URL}/parse-ingredients-text`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({
          sku_id:       editingSku.id,
          raw_text:     raw,
          product_name: editingSku.display_name ?? editingSku.name ?? '',
          brand:        (editingSku as Partial<SkuItem>).brand ?? '',
          name_en:      (editingSku as Partial<SkuItem>).name_en ?? '',
          ...buildHeroSelectionApiFields((editingSku as Partial<SkuItem>).product_type),
          ...buildClaimContextApiFields(editingSku as Partial<SkuItem>),
        }),
      });
      const data = await res.json() as {
        success: boolean;
        ingredient_count?: number;
        hero_ingredients?: HeroIngredient[];
        product_claim?: { ko: string; en: string; ru: string };
        error?: string;
      };
      if (data.success) {
        const parsedSkuId = editingSku.id;
        await persistProductClaimToSku(parsedSkuId, data.product_claim);
        const heroNames = (data.hero_ingredients ?? []).map((h) => h.name).join(', ');
        showToast(`파싱 완료 · ${data.ingredient_count ?? 0}개 · 핵심: ${heroNames || '없음'}`, 'success');
        setParsePreview(null);
        setEditingSku(null);
        setSearchResults([]);
        setSearchFailed(false);
        setPendingTranslation(null);
        await loadSkus();
        if (supabase) await upsertIngredientLibraryFromSkuId(supabase, parsedSkuId);
      } else {
        showToast(`파싱 실패: ${data.error ?? '알 수 없는 오류'}`, 'error');
      }
    } catch (e) {
      showToast(`API 연결 오류: ${skinApiFetchErrorDetail(e)}`, 'error');
    } finally {
      setParsingIngText(false);
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-slate-400">로딩 중…</p>;

  const catLabel = CATEGORIES.find((c) => c.key === category)?.label ?? '';

  return (
    <section className="space-y-6">
      {/* ── 카테고리 탭 ── */}
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
        {CATEGORIES.map((cat) => {
          const count = allSkus.filter((s) => s.category === cat.key).length;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                category === cat.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {cat.label}
              {count > 0 && <span className="ml-1.5 text-[10px] text-slate-400">({count})</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{catLabel} · 상품 & SKU 재고</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                skinApiHealth === 'ok'
                  ? 'bg-emerald-100 text-emerald-800'
                  : skinApiHealth === 'offline'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-500'
              }`}
              title={`${SKIN_API_URL}/health`}
            >
              {skinApiHealth === 'checking' && '성분 API 확인 중…'}
              {skinApiHealth === 'ok' && '성분 API 연결됨'}
              {skinApiHealth === 'offline' && '성분 API 오프라인'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">구성품(SKU) 단위로 재고를 관리합니다. 입고 시 수량을 등록하면 자동으로 반영됩니다.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingSku({
              name: '',
              display_name: null,
              description: null,
              image_url: null,
              safety_stock: 0,
              unit: 'ea',
              is_active: true,
              memo: null,
              category,
              ingredients_raw: null,
              ingredient_search_query_ko: null,
              volume_label: null,
              country_of_origin: 'Made in Korea',
              how_to_use: null,
              how_to_use_en: null,
              how_to_use_ru: null,
              claim_brand_hook: null,
              consumer_theme_summary: null,
            });
            setSearchQueryKo('');
            setSearchFailed(false);
            setPendingTranslation(null);
            setSearchResults([]);
            setParsePreview(null);
            setAutoFetchAfterSave(true);
          }}
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          + SKU 등록
        </button>
      </div>

      {/* ── 재고 현황 대시보드 ── */}
      {skus.length > 0 && (() => {
        const activeSkus = skus.filter(s => s.is_active);
        if (activeSkus.length === 0) return null;
        const maxStock = Math.max(...activeSkus.map(s => s.current_stock), 1);
        return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setStockSummaryOpen((v) => !v)}
            className="mb-3 flex w-full items-center justify-between"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">재고 현황</p>
            <span className={`text-xs text-slate-400 transition-transform duration-200 ${stockSummaryOpen ? 'rotate-0' : '-rotate-90'}`}>▼</span>
          </button>
          {stockSummaryOpen && <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> 충분 (안전재고 x2 이상)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> 주의 (안전재고 ~ x2)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> 부족 (안전재고 이하)</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {activeSkus.map((sku) => {
              const pct = Math.min(100, (sku.current_stock / maxStock) * 100);
              const danger = sku.safety_stock > 0 && sku.current_stock <= sku.safety_stock;
              const warn = !danger && sku.safety_stock > 0 && sku.current_stock <= sku.safety_stock * 2;
              return (
                <div key={sku.id} className="flex items-center gap-3">
                  {sku.image_url && (
                    <img src={sku.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-slate-700">{sku.name}</span>
                      <span className={`shrink-0 font-semibold ${danger ? 'text-red-500' : warn ? 'text-amber-500' : 'text-emerald-600'}`}>
                        {sku.current_stock} {sku.unit}
                        {sku.safety_stock > 0 && <span className="font-normal text-slate-400"> / 안전재고 {sku.safety_stock}</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${danger ? 'bg-red-400' : warn ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>}
        </div>
        );
      })()
      }

      {/* ── SKU 목록 ── */}
      {skus.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{catLabel}에 등록된 SKU가 없습니다. 위 버튼으로 추가하세요.</p>
      ) : (
        <div className="space-y-3">
          {skus.map((sku) => {
            const fullInciCount = Array.isArray(sku.ingredients_json) ? sku.ingredients_json.length : 0;
            const showIngredientRefetchInline =
              sku.ingredients_status === 'done' && fullInciCount > 0;
            return (
            <div key={sku.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              {/* 썸네일+본문 | 액션: sm+ 한 줄(예전과 유사). 모바일은 액션을 아래로 내려 가로 스크롤 방지 */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                <div className="flex w-16 shrink-0 flex-col items-center gap-1">
                  <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-50">
                    {sku.image_url ? (
                      <img src={sku.image_url} alt={sku.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300 text-xs">—</div>
                    )}
                  </div>
                  {sku.product_type && (
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {sku.product_type}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="truncate text-sm font-semibold text-slate-900">{sku.name}</p>
                    {!sku.is_active && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">비활성</span>}
                    {/* 성분 분석 상태 뱃지 */}
                    {(() => {
                      const st = sku.ingredients_status;
                      if (!st || st === 'pending') return (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">⏳ 성분 미등록</span>
                      );
                      if (st === 'fetching') return (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-500 animate-pulse">🔄 수집 중…</span>
                      );
                      if (st === 'done') {
                        const cnt = sku.ingredients_json ? (sku.ingredients_json as unknown[]).length : 0;
                        const parsed = cnt > 0 ? parseIngredientsJson(sku.ingredients_json as unknown[]) : [];
                        const skuLibMap = ingredientLibMaps[sku.id];
                        const parsedWithAvoid = parsed.map((ing) => {
                          if (!skuLibMap) return ing;
                          const nk = normalizeInciKey(ing.name, ing.name_lower);
                          const libRow = skuLibMap.get(nk) ?? skuLibMap.get(ing.name_lower.trim().toLowerCase());
                          if (!libRow) return ing;
                          return {
                            ...ing,
                            avoid_skin_types: libRow.avoid_skin_types?.length ? libRow.avoid_skin_types : ing.avoid_skin_types,
                            benefit_tags: libRow.benefit_tags?.length ? libRow.benefit_tags : ing.benefit_tags,
                            axis_scores:
                              libRow.axis_scores && Object.keys(libRow.axis_scores).length > 0
                                ? libRow.axis_scores
                                : ing.axis_scores,
                          };
                        });
                        const axisResults = parsedWithAvoid.length > 0 ? computeAxisScores(parsedWithAvoid) : [];
                        const AXIS_COLORS: Record<string, string> = {
                          D: 'bg-sky-100 text-sky-700 border-sky-300',
                          O: 'bg-amber-100 text-amber-700 border-amber-300',
                          S: 'bg-emerald-100 text-emerald-700 border-emerald-300',
                          R: 'bg-orange-100 text-orange-700 border-orange-300',
                          P: 'bg-violet-100 text-violet-700 border-violet-300',
                          N: 'bg-slate-100 text-slate-500 border-slate-300',
                          W: 'bg-rose-100 text-rose-700 border-rose-300',
                          T: 'bg-slate-100 text-slate-500 border-slate-300',
                        };
                        const AXIS_KO: Record<string, string> = {
                          D: '건성', O: '지성', S: '민감성', R: '저항성',
                          P: '색소성', N: '비색소', W: '주름성', T: '탄력성',
                        };
                        const AXIS_BENEFIT_LABEL: Record<string, string> = {
                          D: '보습·장벽', O: '피지조절·각질', S: '진정·장벽',
                          R: '자극성분', P: '브라이트닝·항산화', N: '(중립)',
                          W: '안티에이징·퍼밍', T: '(중립)',
                        };
                        const axisFocus = getAxisDisplayForProductType(sku.product_type);
                        const typeSummary = getProductTypeSummaryKo(sku.product_type);
                        return (
                          <span className="flex w-full min-w-0 flex-col gap-1.5">
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">
                              ✅ 전 성분 업로드 완료 {cnt > 0 ? `(${cnt}개)` : ''}
                            </span>
                            {cnt > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleFullInci(sku)}
                                  className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  {expandedFullInciBySku.has(sku.id) ? '전성분 닫기' : '전성분 보기'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleFetchIngredients(sku)}
                                  disabled={fetchingIngredientId === sku.id}
                                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  {fetchingIngredientId === sku.id ? '수집 중…' : '성분 재수집'}
                                </button>
                              </>
                            )}
                            </span>
                            {cnt > 0 && axisResults.length > 0 && (
                              <>
                                <p className="text-[10px] leading-snug text-slate-500">
                                  <span className="font-medium text-slate-600">[{sku.product_type?.trim() || '유형 미지정'}] </span>
                                  {typeSummary}
                                </p>
                                <span className="inline-flex flex-wrap items-center gap-1">
                                  {axisFocus.endpoints.map((letter) => {
                                    const ar = axisResultForEndpoint(axisResults, letter);
                                    const pct = pctForEndpoint(axisResults, letter);
                                    const cls =
                                      AXIS_COLORS[letter] ?? 'bg-slate-100 text-slate-500 border-slate-300';
                                    const [a1, a2] = ar?.pair ?? [letter, ''];
                                    const [p1, p2] = ar?.pcts ?? [0, 0];
                                    const a1Cnt =
                                      ar?.details.filter((d) => d.axisLabel === a1 && d.contribution === 'benefit').length ?? 0;
                                    const a2Cnt =
                                      ar?.details.filter((d) => d.axisLabel === a2 && d.contribution === 'benefit').length ?? 0;
                                    const penCnt = ar?.details.filter((d) => d.contribution === 'penalty').length ?? 0;
                                    const pairHint = ar
                                      ? `${AXIS_KO[a1]} ${p1}% · ${AXIS_KO[a2]} ${p2}% (한 쌍의 합 100%)`
                                      : '';
                                    return (
                                      <span key={letter} className="relative group/axend">
                                        <span
                                          className={`cursor-default rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}
                                          title={pairHint}
                                        >
                                          {letter} {AXIS_KO[letter]} {pct ?? '—'}%
                                        </span>
                                        {ar && (
                                          <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden min-w-[200px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg group-hover/axend:block">
                                            <span className="block text-[10px] text-slate-700">
                                              <span className="font-semibold text-slate-800">{AXIS_KO[a1]}({a1})</span> {p1}%
                                              {a1Cnt > 0 && (
                                                <span className="text-slate-500"> — {AXIS_BENEFIT_LABEL[a1]} 기여 {a1Cnt}건</span>
                                              )}
                                            </span>
                                            <span className="block text-[10px] text-slate-700">
                                              <span className="font-semibold text-slate-800">{AXIS_KO[a2]}({a2})</span> {p2}%
                                              {a2Cnt > 0 && (
                                                <span className="text-slate-500"> — {AXIS_BENEFIT_LABEL[a2]} 기여 {a2Cnt}건</span>
                                              )}
                                            </span>
                                            <span
                                              className={`mt-1 block border-t border-slate-100 pt-1 text-[10px] ${penCnt > 0 ? 'text-rose-600' : 'text-slate-400'}`}
                                            >
                                              이 쌍 관련 주의 성분: {penCnt > 0 ? `${penCnt}건` : '없음'}
                                            </span>
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </span>
                              </>
                            )}
                          </span>
                        );
                      }
                      if (st === 'failed') return (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-500">❌ 수집 실패</span>
                      );
                    })()}
                  </div>
                  {(() => {
                    /* 목록 부제목: ② 등록 행과 동일하게 영문 브랜드 + 영문 상품명 우선 (없으면 예전 데이터용 display_name) */
                    const subBrand = sku.brand?.trim() || '';
                    const subProduct = (sku.name_en?.trim() || sku.display_name?.trim() || '') || '';
                    if (!subBrand && !subProduct) return null;
                    return (
                      <p className="text-xs text-slate-600">
                        {subBrand && <span className="font-medium">{subBrand}</span>}
                        {subBrand && subProduct && ' · '}
                        {subProduct}
                      </p>
                    );
                  })()}
                  <p className="mt-1 text-xs text-slate-500">
                    재고: <span className={`font-semibold ${sku.safety_stock > 0 && sku.current_stock <= sku.safety_stock ? 'text-red-500' : 'text-slate-800'}`}>{sku.current_stock}</span>
                    {sku.safety_stock > 0 && <> / 안전재고: {sku.safety_stock}</>}
                    {' '}({sku.unit})
                  </p>
                  {sku.description && (() => {
                    // key_ingredients_desc가 있으면 description 내 ✨ 줄은 중복이므로 제거
                    const hasHeroes = sku.key_ingredients_desc && sku.key_ingredients_desc.length > 0;
                    const descText = hasHeroes
                      ? sku.description.split('\n').filter((l) => !l.trim().startsWith('✨')).join('\n').trim()
                      : sku.description;
                    return descText ? <SkuCardDescription text={descText} /> : null;
                  })()}
                  {sku.key_ingredients_desc && sku.key_ingredients_desc.length > 0 && (() => {
                    const claim = sku.key_ingredients_desc.find((h) => h.name === '__claim__');
                    const ingredients = sku.key_ingredients_desc.filter((h) => h.name !== '__claim__');
                    const hasHeroI18n = ingredients.some((h) => (h.en?.trim() || h.ru?.trim()));
                    return (
                      <div className="mt-2 rounded-lg bg-orange-50 p-2">
                        {(() => {
                          const claimKoRaw = claim?.ko?.trim()
                            ? stripLegacyMockHeroClaimPrefix(claim.ko)
                            : '';
                          const hasClaim = !!claimKoRaw;
                          if (!hasClaim && sku.ingredients_status !== 'done') return null;
                          return (
                            <div className="mb-2 rounded-md border border-orange-200 bg-white px-2.5 py-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 flex-1 text-[9px] font-semibold uppercase tracking-wider text-orange-600">
                                  핵심 마케팅문구
                                </p>
                                {sku.ingredients_status === 'done' && (
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateClaimOnly(sku)}
                                    disabled={
                                      generatingClaimSkuId === sku.id ||
                                      regeneratingHeroSkuId === sku.id ||
                                      fetchingIngredientId === sku.id
                                    }
                                    className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                                  >
                                    {generatingClaimSkuId === sku.id ? '생성 중…' : '✍️ 마케팅문구'}
                                  </button>
                                )}
                              </div>
                              {hasClaim ? (
                                <p className="mt-1 text-[11px] font-medium leading-snug text-orange-900">{claimKoRaw}</p>
                              ) : (
                                <p className="mt-1 text-[10px] leading-snug text-amber-800">
                                  아직 없습니다. Gemini 키가 있을 때「✍️ 마케팅문구」로 한 줄을 생성하거나, 히어로 재선정 시 함께 생성됩니다.
                                </p>
                              )}
                            </div>
                          );
                        })()}
                        {ingredients.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wider text-orange-500">
                                핵심 성분별 설명 & 마케팅문구 ({ingredients.length}개)
                              </p>
                              {sku.ingredients_status === 'done' && (
                                <button
                                  type="button"
                                  onClick={() => void handleRegenerateHeroIngredients(sku)}
                                  disabled={
                                    regeneratingHeroSkuId === sku.id ||
                                    generatingClaimSkuId === sku.id ||
                                    fetchingIngredientId === sku.id
                                  }
                                  title="전성분 패널에서 성분을 정확히 3개 체크한 뒤 누르면, 그 3개를 히어로로 고정하고 소구·설명만 갱신합니다. 체크가 3개가 아니면 AI가 전성분에서 다시 3개를 고릅니다. INCI 재수집 없음."
                                  className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                                >
                                  {regeneratingHeroSkuId === sku.id ? '재선정 중…' : '🎯 AI 핵심 재선정'}
                                </button>
                              )}
                            </div>
                            {heroSelectionAuditBySku[sku.id] ? (
                              <div className="rounded-lg border border-violet-200 bg-violet-50/90 p-2.5 text-[10px] leading-snug text-slate-800">
                                <p className="font-bold text-violet-900">핵심 선정 검수 (마지막 AI 재선정 기준)</p>
                                <p className="mt-0.5 text-[9px] text-violet-700/90">
                                  이 블록은 DB에 저장되지 않습니다. 새로고침·다시 열면 사라집니다.
                                </p>
                                <p className="mt-1 text-slate-700">
                                  {heroSelectionAuditBySku[sku.id]!.rationale_ko}
                                </p>
                                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                  <div>
                                    <p className="font-semibold text-violet-800">최종 3종</p>
                                    <ul className="mt-0.5 space-y-1">
                                      {heroSelectionAuditBySku[sku.id]!.final_picks.map((r) => (
                                        <li key={r.name_lower} className="text-slate-700">
                                          <span className="font-medium">{toKoName(r.display)}</span>
                                          <span className="text-slate-500">
                                            {' '}
                                            · {r.concentration_band} · #{r.position}
                                          </span>
                                          {r.tags?.length ? (
                                            <span className="mt-0.5 block text-[9px] text-slate-500">
                                              {r.tags.map((t) => BENEFIT_TAG_KO[t] ?? t).join(', ')}
                                            </span>
                                          ) : null}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-amber-800">고득점인데 탈락 (비교용)</p>
                                    <ul className="mt-0.5 space-y-1">
                                      {heroSelectionAuditBySku[sku.id]!.eliminated_high_scorers.map((r) => (
                                        <li key={r.name_lower} className="text-slate-700">
                                          {toKoName(r.display)}
                                          <span className="text-slate-500">
                                            {' '}
                                            · score {r.score ?? '—'} · #{r.position}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-700">빠른 교체 (3번째 슬롯)</p>
                                    <p className="text-[9px] text-slate-500">
                                      체크 3개를 현재 최종 1·2번 + 후보로 맞춘 뒤, 아래 전성분에서 반영하거나 재선정하세요.
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {heroSelectionAuditBySku[sku.id]!.final_picks.length >= 3 &&
                                        heroSelectionAuditBySku[sku.id]!.swap_suggestions.map((s) => (
                                          <button
                                            key={s.name_lower}
                                            type="button"
                                            onClick={() => {
                                              const f = heroSelectionAuditBySku[sku.id]!.final_picks;
                                              setSelectedInciForHero((prev) => ({
                                                ...prev,
                                                [sku.id]: [f[0].name_lower, f[1].name_lower, s.name_lower],
                                              }));
                                              showToast(
                                                '3번째 성분을 이 후보로 바꿔 체크했습니다. 전성분 패널에서 반영 또는 재선정하세요.',
                                                'info',
                                              );
                                            }}
                                            className="rounded border border-violet-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-violet-800 hover:bg-violet-100"
                                          >
                                            3→{toKoName(s.display)}
                                          </button>
                                        ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            <ul className="space-y-2">
                              {ingredients.map((h) => (
                                <li key={h.name} className="rounded-md border border-orange-100/80 bg-white/90 px-2 py-1.5">
                                  <p
                                    className="flex min-w-0 items-center gap-1.5 text-[11px] leading-snug"
                                    title={`${h.name}: ${h.ko}`}
                                  >
                                    <span className="shrink-0 font-semibold text-orange-900">✨ {h.name}</span>
                                    <span className="shrink-0 text-slate-300" aria-hidden>
                                      ·
                                    </span>
                                    <span className="min-w-0 truncate font-normal text-slate-800">{h.ko}</span>
                                  </p>
                                  {expandedHeroI18nBySku.has(sku.id) && (h.en || h.ru) && (
                                    <div className="mt-1.5 space-y-0.5 border-t border-orange-50 pt-1.5 text-[10px] leading-snug text-slate-600">
                                      {h.en ? <p><span className="font-medium text-slate-500">EN</span> {h.en}</p> : null}
                                      {h.ru ? <p><span className="font-medium text-slate-500">RU</span> {h.ru}</p> : null}
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                            {hasHeroI18n && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedHeroI18nBySku((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(sku.id)) next.delete(sku.id);
                                    else next.add(sku.id);
                                    return next;
                                  })
                                }
                                className="text-[10px] font-semibold text-orange-600 underline decoration-orange-300 underline-offset-2 hover:text-orange-800"
                              >
                                {expandedHeroI18nBySku.has(sku.id) ? '영문·러시아 문구 접기' : '영문·러시아 문구 보기'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {sku.ingredients_status === 'done' &&
                    (!sku.key_ingredients_desc || sku.key_ingredients_desc.length === 0) &&
                    Array.isArray(sku.ingredients_json) &&
                    (sku.ingredients_json as unknown[]).length > 0 && (
                      <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/80 p-2.5">
                        <p className="mb-2 text-[10px] leading-snug text-violet-900">
                          <span className="font-semibold">핵심 성분·마케팅 블록이 비어 있습니다.</span> DB{' '}
                          <code className="rounded bg-violet-100/90 px-0.5">key_ingredients_desc</code>에 히어로
                          3종·문구가 없어 위 오렌지 카드가 보이지 않습니다. 전성분은 있으니 아래로 복구하세요.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleRegenerateHeroIngredients(sku)}
                          disabled={
                            regeneratingHeroSkuId === sku.id ||
                            generatingClaimSkuId === sku.id ||
                            fetchingIngredientId === sku.id
                          }
                          className="rounded-full border border-violet-300 bg-white px-3 py-1 text-[10px] font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                        >
                          {regeneratingHeroSkuId === sku.id ? '재선정 중…' : '🎯 AI 핵심 재선정'}
                        </button>
                      </div>
                    )}
                  {/* 전성분 리스트: 한국어명 + 성분별 마케팅(한글) + ★ 후보 + 3개 선택 → 핵심 문구 덮어쓰기 */}
                  {sku.ingredients_status === 'done' &&
                    expandedFullInciBySku.has(sku.id) &&
                    (() => {
                      const parsed = parseIngredientsJson(sku.ingredients_json as unknown[]);
                      if (parsed.length === 0) {
                        return <p className="mt-2 text-xs text-amber-600">전성분 JSON이 비어 있습니다. 성분 재수집을 시도해 보세요.</p>;
                      }
                      const heroLowerSet = buildHeroNameLowerSet(sku.key_ingredients_desc);
                      const picked = selectedInciForHero[sku.id] ?? [];
                      const heroStarByLower = new Map<string, boolean>();
                      for (const x of parsed) {
                        heroStarByLower.set(
                          x.name_lower,
                          isAiHighlightedIngredient(x, heroLowerSet, sku.product_type),
                        );
                      }
                      const sorted = [...parsed].sort((a, b) => {
                        const sa = heroStarByLower.get(a.name_lower) ?? false;
                        const sb = heroStarByLower.get(b.name_lower) ?? false;
                        if (sa !== sb) return sa ? -1 : 1;
                        return (a.position ?? 0) - (b.position ?? 0);
                      });
                      return (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                          <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              전체 성분 (한국어) · # = 전성분 순번(함량 높을수록 앞) · ★ = 히어로 후보(상단 정렬) ·
                              정제수·범용 보습/용매·방부 등은 제외
                            </p>
                            <p className="text-[10px] text-slate-400">
                              선택 {picked.length}/3 — 위 오렌지 카드는 <span className="font-semibold text-slate-600">저장된 값</span>입니다. 반영 버튼을 눌러야 갱신됩니다.
                            </p>
                          </div>
                          {libraryEnrichingSkuIds.has(sku.id) ? (
                            <p className="mb-2 text-[10px] text-slate-500">라이브러리 요약(Gemini) 생성 중…</p>
                          ) : null}
                          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                            {sorted.map((ing) => {
                              const star = heroStarByLower.get(ing.name_lower) ?? false;
                              const libMap = ingredientLibMaps[sku.id];
                              const nk = normalizeInciKey(ing.name, ing.name_lower);
                              const libRow = libMap?.get(nk) ?? libMap?.get(ing.name_lower.trim().toLowerCase()) ?? null;
                              const effectLine = resolveIngredientEffectLine(ing, libRow, sku.product_type, {
                                skinApiOffline: skinApiHealth === 'offline',
                                libraryEnrichPending: libraryEnrichingSkuIds.has(sku.id),
                                geminiMissingOnServer: serverGeminiConfigured === false,
                              });
                              const koLabel = toKoName(ing.name);
                              const checked = picked.includes(ing.name_lower);
                              return (
                                <li
                                  key={`${sku.id}-${ing.position}-${ing.name_lower}`}
                                  className="flex gap-2 rounded-lg border border-slate-100 bg-white px-2 py-2 text-[11px] leading-snug"
                                >
                                  <label className="flex min-w-0 flex-1 cursor-pointer gap-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleInciHeroSelect(sku.id, ing.name_lower)}
                                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="font-semibold text-slate-800">
                                        <span
                                          className="mr-1 inline-block rounded bg-slate-200/90 px-1 py-0 text-[9px] font-mono font-normal text-slate-600"
                                          title="전성분 표시 순서(앞일수록 통상 함량 큼)"
                                        >
                                          #{ing.position ?? '—'}
                                        </span>
                                        {star ? <span className="mr-0.5 text-amber-500" title="핵심 후보">★</span> : null}
                                        {koLabel}
                                      </span>
                                      {ing.benefit_tags && ing.benefit_tags.length > 0 && (
                                        <span className="mt-0.5 flex flex-wrap gap-1">
                                          {ing.benefit_tags.map((t) => (
                                            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
                                              {BENEFIT_TAG_KO[t] ?? t}
                                            </span>
                                          ))}
                                        </span>
                                      )}
                                      <p className="mt-1 truncate text-[10px] text-slate-600" title={effectLine}>
                                        {effectLine}
                                      </p>
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                          {picked.length === 3 ? (
                            <div className="mt-3 rounded-lg border border-dashed border-violet-200 bg-violet-50/60 px-2.5 py-2">
                              <p className="text-[10px] font-semibold text-violet-800">반영 시 핵심 3문구 미리보기</p>
                              <ul className="mt-1.5 space-y-1">
                                {picked.map((nl) => {
                                  const ing = sorted.find((x) => x.name_lower === nl);
                                  if (!ing) return null;
                                  const nk = normalizeInciKey(ing.name, ing.name_lower);
                                  const libRow =
                                    ingredientLibMaps[sku.id]?.get(nk) ??
                                    ingredientLibMaps[sku.id]?.get(ing.name_lower.trim().toLowerCase()) ??
                                    null;
                                  const m = resolveMarketingTriple(
                                    ing.name,
                                    ingredientInciLookupKey(ing),
                                    sku.product_type,
                                  );
                                  const libKo = libRow?.description_ko?.trim();
                                  const line = m.isTemplate && libKo ? libKo : m.ko;
                                  return (
                                    <li
                                      key={nl}
                                      className="truncate text-[10px] leading-snug text-slate-700"
                                      title={`${ing.name}: ${line}`}
                                    >
                                      <span className="font-semibold text-slate-800">{ing.name}</span>
                                      <span className="text-slate-500"> · </span>
                                      {line}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                            <button
                              type="button"
                              disabled={picked.length !== 3 || savingHeroSkuId === sku.id}
                              onClick={() => void handleApplyHeroFromFullList(sku)}
                              className="rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-brand/90"
                            >
                              {savingHeroSkuId === sku.id ? '저장 중…' : '선택 3개를 핵심 문구로 적용'}
                            </button>
                            <span className="text-[10px] text-slate-400">브랜드 히어로 소구문구(__claim__)는 유지됩니다.</span>
                          </div>
                        </div>
                      );
                    })()}
                  {sku.memo && <p className="mt-0.5 text-[11px] text-slate-400">메모: {sku.memo}</p>}
                </div>
                </div>
                <div className="flex w-full shrink-0 flex-wrap content-start gap-1.5 sm:max-w-[min(100%,22rem)] sm:justify-end">
                  <button type="button" onClick={() => setTxModal({ sku, type: 'inbound' })}
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                    + 입고
                  </button>
                  <button type="button" onClick={() => setTxModal({ sku, type: 'adjust' })}
                    className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">
                    ± 조정
                  </button>
                  <button type="button" onClick={() => loadHistory(sku)}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    이력
                  </button>
                  {!showIngredientRefetchInline && (
                    <button
                      type="button"
                      onClick={() => handleFetchIngredients(sku)}
                      disabled={fetchingIngredientId === sku.id}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${
                        sku.ingredients_status === 'done'
                          ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                      }`}
                    >
                      {fetchingIngredientId === sku.id
                        ? '수집 중…'
                        : sku.ingredients_status === 'done'
                          ? '성분 재수집'
                          : '🧪 성분 분석'}
                    </button>
                  )}
                  <button type="button" onClick={() => {
                    setEditingSku(sku);
                    {
                      const savedQ = (sku.ingredient_search_query_ko ?? '').trim();
                      const disp = (sku.display_name ?? '').trim();
                      setSearchQueryKo(
                        savedQ || (hasHangul(disp) ? disp : ''),
                      );
                    }
                    setSearchFailed(false);
                    setPendingTranslation(null);
                    setSearchResults([]);
                    setAutoFetchAfterSave(true);
                  }}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    수정
                  </button>
                  <button type="button" onClick={() => handleDelete(sku)}
                    className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50">
                    삭제
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* ── SKU 등록/수정 모달 ── */}
      {editingSku && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-1.5 sm:p-2" onClick={(e) => e.stopPropagation()}>
          <div
            className="flex w-full max-w-6xl max-h-[calc(100dvh-12px)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl sm:max-h-[calc(100dvh-16px)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 상단 타이틀 바: 세로 여백 최소화 */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-1.5 sm:px-5 sm:py-2">
              <h3 className="text-sm font-semibold leading-tight text-slate-900">{editingSku.id ? 'SKU 수정' : 'SKU 등록'}</h3>
              <button type="button" onClick={() => { setEditingSku(null); setSearchResults([]); setSearchQueryKo(''); setSearchFailed(false); setPendingTranslation(null); setParsePreview(null); setAutoFetchAfterSave(true); }}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                ✕
              </button>
            </div>

            {/* 본문: 모달 전체 높이는 콘텐츠 기준(상한 max-h), 넘치면 이 영역만 스크롤 */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-2 xl:items-start xl:gap-6">

              {/* ── 섹션 1: 기본 정보 ── */}
              <section className="min-w-0">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">기본 정보</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">카테고리 *</label>
                    <select className={inputClass}
                      value={editingSku.category ?? category}
                      onChange={(e) => setEditingSku((p) => p ? { ...p, category: e.target.value as SkuCategory } : p)}>
                      {CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      제품 유형
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">검색 후 자동 감지</span>
                    </label>
                    <select className={inputClass}
                      value={(editingSku as Partial<SkuItem>).product_type ?? ''}
                      onChange={(e) => setEditingSku((p) => p ? { ...p, product_type: e.target.value || null } : p)}>
                      {PRODUCT_TYPE_OPTIONS.map((o) => (
                        <option key={o.key} value={o.key}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-700">SKU 이름 <span className="text-slate-400">(내부 관리용) *</span></label>
                    <input type="text" className={inputClass}
                      placeholder="예: RoundLab-Tonic-200ml"
                      value={editingSku.name ?? ''}
                      onChange={(e) => setEditingSku((p) => p ? { ...p, name: e.target.value } : p)} />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-700">제품 이미지</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input ref={fileRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand disabled:opacity-60">
                        {uploading ? '업로드 중…' : '🖼 이미지 선택'}
                      </button>
                      {editingSku.image_url && <img src={editingSku.image_url} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200" />}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">안전재고</label>
                    <input type="number" className={inputClass} min={0}
                      value={editingSku.safety_stock ?? 0}
                      onChange={(e) => setEditingSku((p) => p ? { ...p, safety_stock: parseInt(e.target.value) || 0 } : p)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">단위</label>
                    <select className={inputClass}
                      value={editingSku.unit ?? 'ea'}
                      onChange={(e) => setEditingSku((p) => p ? { ...p, unit: e.target.value } : p)}>
                      <option value="ea">ea (개)</option>
                      <option value="box">box (박스)</option>
                      <option value="ml">ml</option>
                      <option value="g">g</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      스토어 · 구성품 상세
                    </p>
                    <p className="mb-3 text-[10px] leading-snug text-slate-500">
                      세트 상세에서 구성품을 탭하면 열리는 페이지에 표시됩니다. 용량·사용법을 비우면 해당 칸은 «—» 또는 안내 문구로 보입니다.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">용량 표기</label>
                        <input
                          type="text"
                          className={inputClass}
                          placeholder="예: 50 ml, 30 g"
                          value={(editingSku as Partial<SkuItem>).volume_label ?? ''}
                          onChange={(e) =>
                            setEditingSku((p) => (p ? { ...p, volume_label: e.target.value } : p))
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">
                          생산지 / 원산지
                          <span className="ml-1 font-normal text-slate-400">(비우면 스토어 기본: Made in Korea)</span>
                        </label>
                        <input
                          type="text"
                          className={inputClass}
                          placeholder="Made in Korea"
                          value={(editingSku as Partial<SkuItem>).country_of_origin ?? ''}
                          onChange={(e) =>
                            setEditingSku((p) => (p ? { ...p, country_of_origin: e.target.value } : p))
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">사용법 (한국어)</label>
                        <textarea
                          className={`${inputClass} min-h-[4.5rem] resize-y`}
                          placeholder="아침·저녁 세안 후 적당량을 펴 바릅니다…"
                          value={(editingSku as Partial<SkuItem>).how_to_use ?? ''}
                          onChange={(e) =>
                            setEditingSku((p) => (p ? { ...p, how_to_use: e.target.value } : p))
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">사용법 (English)</label>
                        <textarea
                          className={`${inputClass} min-h-[4rem] resize-y`}
                          value={(editingSku as Partial<SkuItem>).how_to_use_en ?? ''}
                          onChange={(e) =>
                            setEditingSku((p) => (p ? { ...p, how_to_use_en: e.target.value } : p))
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">사용법 (Русский)</label>
                        <textarea
                          className={`${inputClass} min-h-[4rem] resize-y`}
                          value={(editingSku as Partial<SkuItem>).how_to_use_ru ?? ''}
                          onChange={(e) =>
                            setEditingSku((p) => (p ? { ...p, how_to_use_ru: e.target.value } : p))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-700">메모 <span className="text-slate-400">(내부용, 선택)</span></label>
                    <input type="text" className={inputClass} placeholder="예: 2026년 3월 입고분"
                      value={editingSku.memo ?? ''}
                      onChange={(e) => setEditingSku((p) => p ? { ...p, memo: e.target.value } : p)} />
                  </div>

                  <div className="flex items-center sm:col-span-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" className="h-4 w-4 rounded" checked={editingSku.is_active ?? true}
                        onChange={(e) => setEditingSku((p) => p ? { ...p, is_active: e.target.checked } : p)} />
                      <span>활성 상품 <span className="text-slate-400">(비활성 시 고객 노출 안 됨)</span></span>
                    </label>
                  </div>
                </div>
              </section>

              {/* ── 섹션 2: 🧪 AI 성분 분석 정보 (넓은 화면에서 우측 열) ── */}
              <section className="min-w-0 rounded-xl border border-orange-200 bg-orange-50/50 p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-base">🧪</span>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-600">AI 성분 분석 정보</p>
                </div>

                <div className="mb-4 rounded-lg border border-amber-200/90 bg-amber-50/80 p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                    핵심 한 줄(__claim__) 생성용 컨텍스트
                  </p>
                  <p className="mb-2 text-[10px] leading-snug text-amber-900/80">
                    브랜드가 강조하는 차별점·외부에서 자주 언급되는 체감을 짧게 적어 두면 Gemini 소구문구에 반영됩니다. 의견 요약은{' '}
                    <span className="font-medium">한국어 → 영어 → 러시아어</span> 순으로 모을 것을 권장합니다.
                  </p>
                  <label className="mb-1 block text-xs font-medium text-slate-700">브랜드 차별 포인트</label>
                  <textarea
                    className="mb-2 w-full min-h-[3rem] resize-y rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400"
                    placeholder="예: 저분자 히알루론 복합, OO 추출물 시그니처"
                    value={(editingSku as Partial<SkuItem>).claim_brand_hook ?? ''}
                    onChange={(e) =>
                      setEditingSku((p) => (p ? { ...p, claim_brand_hook: e.target.value } : p))
                    }
                  />
                  <label className="mb-1 block text-xs font-medium text-slate-700">소비자 의견 테마 요약</label>
                  <textarea
                    className="w-full min-h-[4rem] resize-y rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400"
                    placeholder="불릿으로: 흡수 빠름, 층바름에 좋음, 건성에 보습 체감 등 (직접 인용 아님)"
                    value={(editingSku as Partial<SkuItem>).consumer_theme_summary ?? ''}
                    onChange={(e) =>
                      setEditingSku((p) => (p ? { ...p, consumer_theme_summary: e.target.value } : p))
                    }
                  />
                </div>

                {/* ══ 검색 행 (한국어 입력) ══ */}
                <div className="mb-1">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400">① 검색 (한 줄 입력)</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs font-medium text-slate-600">브랜드 + 상품명</label>
                      <input
                        type="text"
                        className="w-full min-w-0 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-300"
                        placeholder="예: 메디필 니아신 세럼 (브랜드와 제품명을 한 칸에)"
                        value={searchQueryKo}
                        onChange={(e) => {
                          setSearchQueryKo(e.target.value);
                          setSearchResults([]);
                          setSearchFailed(false);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchProduct}
                      disabled={isSearching}
                      className="w-full shrink-0 rounded-xl border border-orange-400 bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60 sm:w-auto sm:whitespace-nowrap"
                    >
                      {isSearching ? '검색 중…' : '🔍 검색'}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-orange-700/90">
                    한 줄로 입력 후 <span className="font-semibold">🔍 검색</span>이 필수입니다. INCI 후보가 나오면 선택 시 ②행에 <span className="font-semibold">영문 브랜드·상품명</span>이 나뉘어 들어갑니다(Gemini·검색 API가 줄 때만 가능).
                  </p>
                  <p className="mt-1.5 text-[10px] text-orange-600/90">
                    INCI 없이 영문만 채우려면{' '}
                    <button
                      type="button"
                      onClick={() => void handleFillEnglishFromKo()}
                      disabled={isSearching}
                      className="font-semibold underline decoration-orange-400 underline-offset-2 hover:text-orange-800 disabled:opacity-50"
                    >
                      한글→영문만 채우기
                    </button>
                  </p>
                </div>

                {/* 검색 실패 → 이미 ②행에 영문 자동 입력됨; 필요 시 재적용 */}
                {searchFailed && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
                    <span className="min-w-0 flex-1 text-xs text-amber-800">
                      INCI Decoder에 없습니다. 브랜드·상품명(EN)은 아래 ② 행에 채워 두었습니다. 저장 후 전성분 붙여넣기로 이어가면 됩니다.
                      {pendingTranslation?.name && (
                        <>
                          {' '}
                          <span className="font-semibold text-amber-900">({pendingTranslation.name})</span>
                        </>
                      )}
                    </span>
                    <button type="button" onClick={handleRegisterTranslatedName}
                      className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 whitespace-nowrap">
                      번역 다시 넣기
                    </button>
                  </div>
                )}

                {/* 검색 결과 드롭다운 */}
                {searchResults.length > 0 && (
                  <div className="mb-2 rounded-xl border border-orange-200 bg-white shadow-lg overflow-hidden">
                    <p className="border-b border-orange-100 bg-orange-50 px-3 py-1.5 text-[11px] font-medium text-orange-600">
                      검색 결과 — 맞는 제품을 선택하세요
                    </p>
                    {searchResults.map((r, i) => (
                      <button key={i} type="button"
                        onClick={() => {
                          const detected = detectProductType(r.name_en);
                          const meta = lastInciSearchMetaRef.current;
                          const brandEn = meta?.brandEn?.trim();
                          setEditingSku((p) => {
                            if (!p) return p;
                            const mergedType = detected
                              ? mergeDetectedProductType(p.product_type, detected)
                              : p.product_type;
                            return {
                              ...p,
                              name_en: r.name_en,
                              ...(brandEn ? { brand: brandEn } : {}),
                              inci_product_url: r.url?.trim() || null,
                              ...(detected ? { product_type: mergedType } : {}),
                            };
                          });
                          setSearchResults([]);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-orange-50 border-b border-slate-100 last:border-0">
                        <span className="text-orange-400">→</span>
                        <span className="font-medium">{r.name_en}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* ══ 등록 행 (영문 자동입력, 수정 가능) ══ */}
                <div className="mb-3 rounded-xl border border-orange-200 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">
                      ② 등록 (영문 우선 — 한글로 적어도 됨)
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleTranslateNameEn()}
                      disabled={translatingNameEn}
                      className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-[10px] font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
                    >
                      {translatingNameEn ? '번역 중…' : '② 한글→영문 번역'}
                    </button>
                  </div>
                  <p className="mb-2 text-[10px] leading-snug text-orange-700/85">
                    ①가 비어 있어도, 여기 칸에 <span className="font-semibold">한글 브랜드·상품명</span>을 넣고 위 버튼을 누르면 Gemini로 영문이 채워집니다.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-medium text-orange-700">브랜드명 (EN)</label>
                      <input type="text"
                        className="w-full min-w-0 rounded-xl border border-orange-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400"
                        placeholder="예: Make P:rem"
                        value={(editingSku as Partial<SkuItem>).brand ?? ''}
                        onChange={(e) => setEditingSku((p) => p ? { ...p, brand: e.target.value } : p)} />
                    </div>
                    <div className="min-w-0">
                      <label className="mb-1 block text-xs font-medium text-orange-700">상품명 (EN)</label>
                      <input type="text"
                        className="w-full min-w-0 rounded-xl border border-orange-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400"
                        placeholder="예: Safe Me Relief Moisture Cleansing Milk"
                        value={(editingSku as Partial<SkuItem>).name_en ?? ''}
                        onChange={(e) => setEditingSku((p) => p ? { ...p, name_en: e.target.value } : p)} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="mb-1 block text-xs font-medium text-orange-700">
                      INCI Decoder 제품 URL <span className="font-normal text-orange-500">(검색·선택 시 자동 저장, 수집 시 우선)</span>
                    </label>
                    <input
                      type="url"
                      className="w-full min-w-0 rounded-xl border border-orange-200 bg-orange-50/50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-300"
                      placeholder="https://incidecoder.com/products/..."
                      value={(editingSku as Partial<SkuItem>).inci_product_url ?? ''}
                      onChange={(e) => setEditingSku((p) => p ? { ...p, inci_product_url: e.target.value || null } : p)}
                    />
                  </div>
                </div>

                {/* DB key_ingredients_desc 의 __claim__ — 브랜드 공식 슬로건이 아니라 API가 만든 요약 한 줄 */}
                {(() => {
                  const kid = normalizeKeyIngredientsDesc((editingSku as Partial<SkuItem>).key_ingredients_desc as unknown);
                  const claim = kid.find((h) => h.name === '__claim__');
                  const previewKo = parsePreview?.product_claim?.ko?.trim();
                  return (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-900">제품 소구 한 줄 (저장본)</p>
                      <p className="mt-0.5 text-[10px] leading-snug text-amber-800/90">
                        메이커 공식 카피를 가져오지 않습니다. 성분 API가 <code className="rounded bg-amber-100/80 px-0.5">product_claim</code>을 줄 때만 채워지며, 저장 후 자동 수집·파싱 성공 시 DB에 반영됩니다.
                      </p>
                      {claim?.ko?.trim() ? (
                        <p className="mt-2 whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-900">{claim.ko}</p>
                      ) : previewKo ? (
                        <div className="mt-2">
                          <p className="text-[10px] font-medium text-amber-800">미리보기(아직 DB 미반영)</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-800">{previewKo}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-amber-800/80">
                          아직 없습니다. 체크된「저장 후 INCI 성분 자동 수집」또는 전성분 파싱을 실행해 보세요. Flask 응답에 <code className="rounded bg-amber-100/80 px-0.5">product_claim</code>이 없으면 비어 있습니다.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* 기본 접힘: 모달 세로 길이·스크롤 부담 감소 — 필요 시 펼치기 */}
                <details className="mt-3 rounded-xl border border-orange-200 bg-white/60 open:border-orange-300">
                  <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-orange-800 marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="underline decoration-orange-300 underline-offset-2">전성분 텍스트 붙여넣기</span>
                    <span className="ml-2 font-normal text-[10px] text-orange-600/90">(검색 실패 시 · 펼쳐서 입력)</span>
                  </summary>
                  <div className="border-t border-orange-100 px-3 pb-3 pt-2">
                    <label className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-orange-700">
                      원문 붙여넣기
                      <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-normal text-orange-600">
                        화해 · 올리브영 · 브랜드 사이트
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      className="w-full min-w-0 max-h-40 resize-y rounded-xl border border-orange-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      placeholder={"나이아신아마이드, 글리세린…\n(쉼표·줄바꿈 구분)"}
                      value={(editingSku as Partial<SkuItem>).ingredients_raw ?? ''}
                      onChange={(e) =>
                        setEditingSku((p) => (p ? { ...p, ingredients_raw: e.target.value || null } : p))
                      }
                    />
                    <p className="mt-1 text-[9px] text-slate-500">
                      저장 시 DB에 그대로 보관됩니다. 전성분 JSON이 있으면 목록에서「수집 완료」로 표시되며, 이미 파싱된 경우 저장 시 INCI 자동 수집은 건너뜁니다.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">
                        {((editingSku as Partial<SkuItem>).ingredients_raw ?? '').trim()
                          ? `약 ${((editingSku as Partial<SkuItem>).ingredients_raw ?? '').split(',').filter((s) => s.trim()).length}개 감지`
                          : ''}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePreviewParse()}
                          disabled={previewParsing || !((editingSku as Partial<SkuItem>).ingredients_raw ?? '').trim()}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {previewParsing ? '미리보기…' : '미리보기'}
                        </button>
                        <button
                          type="button"
                          onClick={handleParseIngText}
                          disabled={parsingIngText || !((editingSku as Partial<SkuItem>).ingredients_raw ?? '').trim()}
                          className="rounded-full border border-orange-400 bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                        >
                          {parsingIngText ? '파싱 중…' : 'DB 저장 파싱'}
                        </button>
                      </div>
                    </div>
                    {parsePreview && (
                      <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
                        <p className="mb-1 font-semibold text-slate-800">미리보기</p>
                        <p>
                          성분 {parsePreview.ingredient_count}개
                          {typeof parsePreview.sensitizing_count === 'number' && (
                            <> · 주의 {parsePreview.sensitizing_count}개</>
                          )}
                        </p>
                        {parsePreview.product_claim && (
                          <p className="mt-1 text-slate-600">
                            <span className="font-medium">히어로 소구:</span> {parsePreview.product_claim.ko}
                          </p>
                        )}
                      </div>
                    )}
                    {!editingSku?.id && ((editingSku as Partial<SkuItem>).ingredients_raw ?? '').trim() && (
                      <p className="mt-1.5 text-[10px] text-amber-600">
                        DB 반영은 SKU 저장 후 가능합니다.
                      </p>
                    )}
                  </div>
                </details>
              </section>

              </div>
            </div>

            {/* 하단 버튼 — 스크롤 밖 고정 */}
            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-100 bg-white px-3 py-2 sm:px-5 sm:py-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  checked={autoFetchAfterSave}
                  onChange={(e) => setAutoFetchAfterSave(e.target.checked)}
                />
                <span>저장 후 INCI에서 성분 자동 수집 (Flask·네트워크 필요)</span>
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={handleSave} disabled={saving}
                  className="flex-1 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60">
                  {saving ? '저장 중…' : '저장'}
                </button>
                <button type="button" onClick={() => { setEditingSku(null); setSearchResults([]); setSearchQueryKo(''); setSearchFailed(false); setPendingTranslation(null); setParsePreview(null); setAutoFetchAfterSave(true); }}
                  className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 입고/조정 모달 ── */}
      {txModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-semibold text-slate-900">
              {txModal.type === 'inbound' ? '입고 등록' : '재고 조정'}
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              {txModal.sku.name} — 현재 재고: {txModal.sku.current_stock} {txModal.sku.unit}
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  {txModal.type === 'inbound' ? '입고 수량' : '조정 수량 (- 는 감소)'}
                </label>
                <input type="number" className={inputClass}
                  placeholder={txModal.type === 'inbound' ? '100' : '-5 또는 +10'}
                  value={txQty} onChange={(e) => setTxQty(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">메모</label>
                <input type="text" className={inputClass}
                  placeholder={txModal.type === 'inbound' ? '예: 3월 25일 CJ 입고' : '예: 파손 2개'}
                  value={txMemo} onChange={(e) => setTxMemo(e.target.value)} />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={handleTxSubmit} disabled={txSaving}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
                  txModal.type === 'inbound' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}>
                {txSaving ? '처리 중…' : txModal.type === 'inbound' ? '입고 확인' : '조정 확인'}
              </button>
              <button type="button" onClick={() => { setTxModal(null); setTxQty(''); setTxMemo(''); }}
                className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이력 모달 ── */}
      {txHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">{txHistory.sku.name} — 입출고 이력</h3>
              <button type="button" onClick={() => setTxHistory(null)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
            </div>
            {txHistoryLoading ? (
              <p className="py-4 text-center text-sm text-slate-400">로딩 중…</p>
            ) : txHistory.rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">이력이 없습니다.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 font-medium">일시</th>
                    <th className="pb-2 font-medium">유형</th>
                    <th className="pb-2 text-right font-medium">수량</th>
                    <th className="pb-2 font-medium">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {txHistory.rows.map((tx) => (
                    <tr key={tx.id} className="border-b border-slate-100">
                      <td className="py-2 text-slate-600">
                        {new Date(tx.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          tx.type === 'inbound' ? 'bg-emerald-50 text-emerald-700' :
                          tx.type === 'outbound' ? 'bg-blue-50 text-blue-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {tx.type === 'inbound' ? '입고' : tx.type === 'outbound' ? '출고' : '조정'}
                        </span>
                      </td>
                      <td className={`py-2 text-right font-semibold ${tx.qty > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {tx.qty > 0 ? '+' : ''}{tx.qty}
                      </td>
                      <td className="py-2 text-slate-500">{tx.memo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] flex max-w-[min(92vw,28rem)] -translate-x-1/2 items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${
            toast.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : toast.tone === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-slate-200 bg-white text-slate-800'
          }`}
          role="status"
        >
          <p className="min-w-0 flex-1 text-sm leading-snug whitespace-pre-wrap">{toast.message}</p>
          <button
            type="button"
            onClick={() => {
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              toastTimerRef.current = null;
              setToast(null);
            }}
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium opacity-70 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}
    </section>
  );
}
