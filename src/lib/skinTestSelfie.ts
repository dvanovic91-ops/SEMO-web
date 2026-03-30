/**
 * skin_test_results.selfie_analysis 가 «셀피 분석 있음»으로 볼 수 있는지.
 * API/저장 형태 차이(json 문자열, 중첩, camelCase)를 넓게 허용한다.
 */
export function hasSelfieAnalysisSnapshot(selfie_analysis: unknown): boolean {
  if (selfie_analysis == null) return false;
  if (typeof selfie_analysis === 'string') {
    const t = selfie_analysis.trim();
    if (!t || t === '{}' || t === 'null') return false;
    try {
      return hasSelfieAnalysisSnapshot(JSON.parse(t) as unknown);
    } catch {
      return false;
    }
  }
  if (typeof selfie_analysis !== 'object' || Array.isArray(selfie_analysis)) return false;
  const o = selfie_analysis as Record<string, unknown>;

  const sm = o.skin_metrics ?? o.skinMetrics;
  if (sm && typeof sm === 'object' && !Array.isArray(sm) && Object.keys(sm as object).length > 0) {
    return true;
  }

  if (typeof o.analyzed_at === 'string' && o.analyzed_at.trim().length > 0) return true;
  if (typeof o.analyzed_at === 'number' && Number.isFinite(o.analyzed_at)) return true;
  const at = (o as { analyzedAt?: unknown }).analyzedAt;
  if (typeof at === 'string' && at.trim().length > 0) return true;

  const ga = o.gemini_analysis;
  if (ga && typeof ga === 'object') return true;
  if (typeof ga === 'string' && ga.trim().length > 2) {
    try {
      const p = JSON.parse(ga) as unknown;
      if (p && typeof p === 'object') return true;
    } catch {
      return true;
    }
  }

  if (o.result && typeof o.result === 'object') return hasSelfieAnalysisSnapshot(o.result);
  if (o.data && typeof o.data === 'object') return hasSelfieAnalysisSnapshot(o.data);

  return false;
}

/** jsonb/문자열/중첩 result·data 를 객체로 통일 */
export function parseSelfieAnalysisObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t || t === '{}' || t === 'null') return null;
    try {
      return parseSelfieAnalysisObject(JSON.parse(t) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

function unwrapSelfieNested(o: Record<string, unknown>): Record<string, unknown> {
  if (o.skin_metrics !== undefined || o.skinMetrics !== undefined || o.gemini_analysis !== undefined) return o;
  const r = o.result;
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const inner = parseSelfieAnalysisObject(r);
    if (inner) return unwrapSelfieNested(inner);
  }
  const d = o.data;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const inner = parseSelfieAnalysisObject(d);
    if (inner) return unwrapSelfieNested(inner);
  }
  return o;
}

/**
 * DB `selfie_analysis` → 결과 화면용 상태 (문자열·중첩 저장 호환).
 * hasSelfieAnalysisSnapshot 이 true 일 때만 의미 있음.
 */
export function selfieAnalysisToClientState(raw: unknown): {
  skin_metrics: Record<string, unknown>;
  gemini_analysis?: unknown;
} | null {
  if (!hasSelfieAnalysisSnapshot(raw)) return null;
  let o = parseSelfieAnalysisObject(raw);
  if (!o) return null;
  o = unwrapSelfieNested(o);
  const sm = o.skin_metrics ?? o.skinMetrics;
  const skin_metrics =
    sm && typeof sm === 'object' && !Array.isArray(sm) ? (sm as Record<string, unknown>) : {};
  return {
    skin_metrics,
    gemini_analysis: o.gemini_analysis,
  };
}
