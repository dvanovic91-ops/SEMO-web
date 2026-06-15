import { supabase } from './supabase';

export const RECOMMENDATION_TRACKING_VERSION = 'skin-type-slot-v1';

const SNAPSHOT_STORAGE_KEY = 'semo_latest_recommendation_snapshot';

export type RecommendationSnapshotRecord = {
  id: string;
  userId: string;
  skinTestResultId?: string | null;
  skinType?: string | null;
  recommendedProductId?: string | null;
  skinFitScore?: number | null;
  createdAt: string;
};

type CreateRecommendationSnapshotInput = {
  userId: string | null | undefined;
  skinTestResultId?: string | null;
  skinType?: string | null;
  baumannScores?: unknown;
  selfieMetrics?: unknown;
  recommendedProductId?: string | null;
  recommendedItems?: unknown[];
  skinFitScore?: number | null;
  boxFitScore?: number | null;
  confidenceScore?: number | null;
  reasonCodes?: string[];
  context?: Record<string, unknown>;
};

type TrackRecommendationEventInput = {
  userId?: string | null;
  eventType: string;
  recommendationSnapshotId?: string | null;
  skinTestResultId?: string | null;
  productId?: string | null;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function saveLatestRecommendationSnapshot(record: RecommendationSnapshotRecord): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore storage quota / private mode failures
  }
}

export function getLatestRecommendationSnapshot(): RecommendationSnapshotRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecommendationSnapshotRecord>;
    if (!parsed?.id || !isUuid(parsed.id)) return null;
    return {
      id: parsed.id,
      userId: String(parsed.userId ?? ''),
      skinTestResultId: parsed.skinTestResultId ?? null,
      skinType: parsed.skinType ?? null,
      recommendedProductId: parsed.recommendedProductId ?? null,
      skinFitScore: safeNumber(parsed.skinFitScore ?? null),
      createdAt: String(parsed.createdAt ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export async function createRecommendationSnapshot(input: CreateRecommendationSnapshotInput): Promise<RecommendationSnapshotRecord | null> {
  if (!supabase || !input.userId || !isUuid(input.recommendedProductId ?? null)) return null;
  const payload = {
    user_id: input.userId,
    skin_test_result_id: isUuid(input.skinTestResultId ?? null) ? input.skinTestResultId : null,
    skin_type: input.skinType?.trim().toUpperCase() || null,
    baumann_scores: input.baumannScores ?? null,
    selfie_metrics: input.selfieMetrics ?? null,
    recommended_product_id: input.recommendedProductId,
    recommended_items: input.recommendedItems ?? [],
    skin_fit_score: safeNumber(input.skinFitScore),
    box_fit_score: safeNumber(input.boxFitScore),
    confidence_score: safeNumber(input.confidenceScore),
    reason_codes: input.reasonCodes ?? [],
    matcher_version: RECOMMENDATION_TRACKING_VERSION,
    context: input.context ?? {},
  };
  const { data, error } = await supabase
    .from('recommendation_snapshots')
    .insert(payload)
    .select('id, user_id, skin_test_result_id, skin_type, recommended_product_id, skin_fit_score, created_at')
    .single();
  if (error || !data?.id) {
    console.warn('[recommendationTracking] create snapshot failed:', error?.message);
    return null;
  }
  const record: RecommendationSnapshotRecord = {
    id: String(data.id),
    userId: String(data.user_id),
    skinTestResultId: data.skin_test_result_id ?? null,
    skinType: data.skin_type ?? null,
    recommendedProductId: data.recommended_product_id ?? null,
    skinFitScore: safeNumber(data.skin_fit_score),
    createdAt: data.created_at ?? new Date().toISOString(),
  };
  saveLatestRecommendationSnapshot(record);
  return record;
}

export async function trackRecommendationEvent(input: TrackRecommendationEventInput): Promise<void> {
  if (!supabase) return;
  const snapshot = input.recommendationSnapshotId ? null : getLatestRecommendationSnapshot();
  const recommendationSnapshotId = input.recommendationSnapshotId ?? snapshot?.id ?? null;
  const userId = input.userId ?? snapshot?.userId ?? null;
  const skinTestResultId = input.skinTestResultId ?? snapshot?.skinTestResultId ?? null;
  const productId = input.productId ?? snapshot?.recommendedProductId ?? null;
  const payload = {
    user_id: userId || null,
    recommendation_snapshot_id: isUuid(recommendationSnapshotId) ? recommendationSnapshotId : null,
    skin_test_result_id: isUuid(skinTestResultId) ? skinTestResultId : null,
    product_id: isUuid(productId) ? productId : null,
    order_id: isUuid(input.orderId ?? null) ? input.orderId : null,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
  };
  const { error } = await supabase.from('recommendation_events').insert(payload);
  if (error) console.warn('[recommendationTracking] event failed:', input.eventType, error.message);
}
