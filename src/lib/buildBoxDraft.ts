import type { BuildCategory, BuildProduct } from './buildBoxCatalog';

export const BUILD_BOX_DRAFT_KEY = 'semo_build_box_draft';

export type BuildBoxDraftPayload = {
  /** ID만으로 복원 (구버전 호환) */
  productIds: (string | null)[];
  /** 전체 스냅샷 — 카탈로그 ID 변경·폴백 전환 시에도 복원 */
  products?: (BuildProduct | null)[];
  isPremium: boolean;
  updatedAt: number;
};

export function readBuildBoxDraft(): BuildBoxDraftPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BUILD_BOX_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BuildBoxDraftPayload;
    if (!parsed || !Array.isArray(parsed.productIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBuildBoxDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BUILD_BOX_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function saveBuildBoxDraft(selected: (BuildProduct | null)[], isPremium = false): void {
  if (typeof window === 'undefined') return;
  const hasAny = selected.some((p) => p !== null);
  if (!hasAny) return;
  try {
    const payload: BuildBoxDraftPayload = {
      productIds: selected.map((p) => p?.id ?? null),
      products: selected.map((p) => (p ? { ...p } : null)),
      isPremium,
      updatedAt: Date.now(),
    };
    localStorage.setItem(BUILD_BOX_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function restoreBuildBoxSelection(
  categories: BuildCategory[],
  draft: BuildBoxDraftPayload | null,
): (BuildProduct | null)[] {
  const len = categories.length;
  if (!draft) return new Array(len).fill(null);

  const fromSnapshot = draft.products?.length
    ? new Array(len).fill(null).map((_, i) => {
        const snap = draft.products?.[i] ?? null;
        if (!snap) return null;
        const cat = categories[i];
        return cat?.products.find((p) => p.id === snap.id) ?? snap;
      })
    : null;

  if (fromSnapshot?.some((p) => p !== null)) return fromSnapshot;

  if (!draft.productIds?.length) return new Array(len).fill(null);

  return new Array(len).fill(null).map((_, i) => {
    const id = draft.productIds[i];
    if (!id) return null;
    const cat = categories[i];
    if (!cat) return null;
    return cat.products.find((p) => p.id === id) ?? null;
  });
}
