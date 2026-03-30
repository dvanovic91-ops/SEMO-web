/**
 * 프로필 단계 «главная проблема» (con_1…5) + 자유 고민 텍스트 → 바우만 행(0–3)·셀피 지표 연결
 */

export type SelfieMetricKey = 'redness_index' | 'pigment_unevenness' | 'texture_roughness' | 'oiliness_index';

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
  con_1: ['redness_index', 'texture_roughness', 'oiliness_index'],
  con_2: ['texture_roughness'],
  con_3: ['pigment_unevenness'],
  con_4: ['texture_roughness'],
  con_5: ['oiliness_index'],
};

function addFromFreeText(text: string, baumann: Set<number>, selfie: Set<SelfieMetricKey>): void {
  const t = text.toLowerCase();
  if (!t.trim()) return;

  if (
    /пигмент|pigment|melasma|freckle|uneven\s*ton|пятн|веснуш|неровн|spot|dark\s*spot|post[\s-]?acne|постакне|гиперпигмент/i.test(
      t,
    )
  ) {
    baumann.add(2);
    selfie.add('pigment_unevenness');
  }
  if (/сух|dry|шелуш|flak|tight|стянут|건조|dehydrat|шелушен/i.test(t)) {
    baumann.add(0);
    selfie.add('texture_roughness');
  }
  if (/жир|oil|блеск|sebum|shiny|gloss|oily|t[\s-]?zone|т[\s-]?зон|комедон|blackhead/i.test(t)) {
    baumann.add(0);
    selfie.add('oiliness_index');
  }
  if (/морщин|wrinkle|aging|firm|elastic|anti[\s-]?age|lines|упруг|старен/i.test(t)) {
    baumann.add(3);
    selfie.add('texture_roughness');
  }
  if (
    /акне|acne|breakout|высып|красн|redness|inflamm|rosacea|чувствитель|sensitive|reactive|couperose|купероз/i.test(t)
  ) {
    baumann.add(1);
    selfie.add('redness_index');
    selfie.add('texture_roughness');
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
      texture_roughness: 'texture / fine-line proxy',
      oiliness_index: 'T-zone gloss',
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
