/**
 * 프로필 단계 «главная проблема» (con_1…5) + 자유 고민 텍스트 → 바우만 행(0–3)·셀피 지표 연결
 */

export type SelfieMetricKey =
  | 'redness_index'
  | 'pigment_unevenness'
  | 'texture_roughness'
  | 'oiliness_index'
  | 'blemishes_index'
  | 'dullness_index'
  | 'fine_lines_index';

export type ConcernMetricFocus = {
  baumannRowIndices: Set<number>;
  selfieKeys: Set<SelfieMetricKey>;
};

const PROFILE_TO_BAUMANN: Record<string, number[]> = {
  con_1: [1],
  con_2: [0],
  con_3: [2],
  con_4: [3],
  con_5: [0],
};

const PROFILE_TO_SELFIE: Record<string, SelfieMetricKey[]> = {
  con_1: ['redness_index', 'blemishes_index', 'texture_roughness', 'oiliness_index'],
  con_2: ['texture_roughness', 'dullness_index'],
  con_3: ['pigment_unevenness', 'dullness_index'],
  con_4: ['texture_roughness', 'fine_lines_index'],
  con_5: ['oiliness_index', 'blemishes_index'],
};

function addFromFreeText(text: string, baumann: Set<number>, selfie: Set<SelfieMetricKey>): void {
  const t = text.toLowerCase();
  if (!t.trim()) return;

  // 색소/기미/잡티
  if (
    /пигмент|pigment|melasma|freckle|uneven\s*ton|пятн|веснуш|неровн|spot|dark\s*spot|post[\s-]?acne|постакне|гиперпигмент|\uae30\ubbf8|\uc7a1\ud2f0|\uc0c9\uc18c|\ud53c\uadf8\uba58\ud2b8|\uba5c\ub77c\ub2cc/i.test(t)
  ) {
    baumann.add(2);
    selfie.add('pigment_unevenness');
  }
  // 건조/수분
  if (/сух|dry|шелуш|flak|tight|стянут|\uac74\uc870|dehydrat|шелушен|\uc218\ubd84|\ub2f9\uae40|\uac74\uc131/i.test(t)) {
    baumann.add(0);
    selfie.add('texture_roughness');
  }
  // 지성/유분/번들/모공
  if (/жир|oil|блеск|sebum|shiny|gloss|oily|t[\s-]?zone|т[\s-]?зон|комедон|blackhead|\uc9c0\uc131|\uc720\ubd84|\ubc88\ub4e4|\ubaa8\uacf5|T\uc874/i.test(t)) {
    baumann.add(0);
    selfie.add('oiliness_index');
  }
  // 주름/탄력/노화
  if (/морщин|wrinkle|aging|firm|elastic|anti[\s-]?age|lines|упруг|старен|\uc8fc\ub984|\uc8fc\ub984\uc0b4|\ud0c4\ub825|\ub178\ud654|\uc78a\uc8fc\ub984|\ucc98\uc9d0/i.test(t)) {
    baumann.add(3);
    selfie.add('texture_roughness');
    selfie.add('fine_lines_index');
  }
  // 홍조/여드름/민감
  if (
    /акне|acne|breakout|высып|красн|redness|inflamm|rosacea|чувствитель|sensitive|reactive|couperose|купероз|\ud64d\uc870|\uc5ec\ub4dc\ub984|\ub73b\ub8e8\uc9c0|\ubbfc\uac10|\ubd89\uc74c|\ubd89\uc5b4\uc9d0/i.test(t)
  ) {
    baumann.add(1);
    selfie.add('redness_index');
    selfie.add('blemishes_index');
    selfie.add('texture_roughness');
  }
  // 칙칙/광채/생기
  if (/тусклость|dull|glow|сияние|radianc|блеклость|\uce59\uce59|\uad11\ucc44|\uc0dd\uae30|\uc5b4\ub450\uc6c0|\uc5b4\ub3d9/i.test(t)) {
    selfie.add('dullness_index');
    selfie.add('pigment_unevenness');
  }
  // 트러블/뾰루지/여드름
  if (/прыщ|pimple|высыпание|blemish|\ud2b8\ub7ec\ube14|\ub73b\ub8e8\uc9c0|\uc5ec\ub4dc\ub984|\uace0\ub984/i.test(t)) {
    baumann.add(1);
    selfie.add('blemishes_index');
  }
  // 탄탄/리프팅/처짐
  if (/упруг|эластич|lift|подтяжк|sagging|jowl|\ud0c4\ud0c4|\ub9ac\ud504\ud305|\ucc98\uc9d0/i.test(t)) {
    baumann.add(3);
    selfie.add('fine_lines_index');
  }
}

export function resolveConcernMetricFocus(
  profileConcern: string | undefined,
  concernText: string,
): ConcernMetricFocus {
  const baumannRowIndices = new Set<number>();
  const selfieKeys = new Set<SelfieMetricKey>();

  const code = (profileConcern ?? '').trim();
  if (code && PROFILE_TO_BAUMANN[code]) {
    for (const i of PROFILE_TO_BAUMANN[code]) baumannRowIndices.add(i);
    for (const k of PROFILE_TO_SELFIE[code] ?? []) selfieKeys.add(k);
  }

  addFromFreeText(concernText, baumannRowIndices, selfieKeys);

  return { baumannRowIndices, selfieKeys };
}

/** Gemini /analyze-text* 프롬프트용 — 영어 지시 한 블록 */
export function buildConcernMetricFocusForApi(profileConcern: string | undefined, concernText: string): string {
  const { baumannRowIndices, selfieKeys } = resolveConcernMetricFocus(profileConcern, concernText);
  if (baumannRowIndices.size === 0 && selfieKeys.size === 0) return '';

  const rowLabels = [
    'Dry vs Oily (hydration balance)',
    'Sensitive vs Resistant',
    'Pigmented vs Clear tone',
    'Tight/firm vs Wrinkle-prone',
  ];
  const parts: string[] = [];
  if (baumannRowIndices.size > 0) {
    const rows = [...baumannRowIndices]
      .sort((a, b) => a - b)
      .map((i) => rowLabels[i] ?? `row ${i + 1}`)
      .join('; ');
    parts.push(`Questionnaire Baumann bars (same order as UI): ${rows}`);
  }
  if (selfieKeys.size > 0) {
    const sk: Record<SelfieMetricKey, string> = {
      redness_index: 'redness',
      pigment_unevenness: 'pigment unevenness',
      texture_roughness: 'texture roughness',
      oiliness_index: 'T-zone gloss',
      blemishes_index: 'blemishes / breakouts',
      dullness_index: 'dullness / lack of glow',
      fine_lines_index: 'fine lines / firmness signal',
    };
    const photo = [...selfieKeys].map((k) => sk[k]).join('; ');
    parts.push(`Photo metrics (when selfie was analyzed): ${photo}`);
  }

  return (
    `CONCERN–METRIC LINK (required): The user chose a primary concern in the profile and wrote a free-text worry. ` +
    `You MUST explicitly tie their stated concern to these rows/metrics in at least one section: ${parts.join('. ')}. ` +
    `Name the relevant axes and, where photo metrics exist, relate the numbers to their worry.`
  );
}
