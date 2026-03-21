/**
 * 개인정보·배송(도착카) localStorage — `profileEdit:${userId}` 권장.
 *
 * 유실 원인(대응):
 * - 레거시 단일 키 `profileEdit` 삭제 시 이관 없이 지우면 데이터 소실 → 로그인 시 userId 키로 먼저 합침.
 * - `userId` 로드 전 `profileEdit:email` 만 쓰다가 이후 `profileEdit:userId` 로 바뀌면 이전 키와 분리됨 → 이메일 키에서 병합.
 */

export const LEGACY_PROFILE_EDIT_KEY = 'profileEdit';
const LEGACY_KEY = LEGACY_PROFILE_EDIT_KEY;
const PREFIX = 'profileEdit:';

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as unknown;
    if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch {
    /* */
  }
  return null;
}

/** Checkout / ProfileEdit 동일 키 — userId 우선, 없으면 이메일(비로그인·초기) */
export function profileEditStorageKey(userId: string | null, userEmail: string | null): string {
  if (userId) return `${PREFIX}${userId}`;
  if (userEmail?.trim()) return `${PREFIX}${userEmail.trim().toLowerCase()}`;
  return `${PREFIX}guest`;
}

/**
 * 레거시 `profileEdit` 및 `profileEdit:email` 내용을 `profileEdit:userId` 로 합침(빈 슬롯만 채움).
 * 로그인 직후·프로필 수정 진입 시 호출.
 */
export function migrateProfileEditStorage(userId: string | null, userEmail: string | null): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const emailNorm = (userEmail ?? '').toLowerCase();
    const targetKey = `${PREFIX}${userId}`;
    const target = parseJson(localStorage.getItem(targetKey)) ?? {};

    const sources: Record<string, unknown>[] = [];
    const legacy = parseJson(localStorage.getItem(LEGACY_KEY));
    if (legacy) sources.push(legacy);
    if (emailNorm) {
      const emailKey = `${PREFIX}${emailNorm}`;
      if (emailKey !== targetKey) {
        const byEmail = parseJson(localStorage.getItem(emailKey));
        if (byEmail) sources.push(byEmail);
      }
    }

    for (const src of sources) {
      for (const [k, v] of Object.entries(src)) {
        if (k.startsWith('__')) continue;
        const cur = target[k];
        const empty = cur == null || (typeof cur === 'string' && !String(cur).trim());
        if (empty && v != null && String(v).trim() !== '') {
          target[k] = v;
        }
      }
    }

    target.__owner_user_id = userId;
    target.__owner_email = emailNorm;

    const hasPayload = Object.keys(target).some((k) => !k.startsWith('__'));
    if (hasPayload) {
      localStorage.setItem(targetKey, JSON.stringify(target));
    }
  } catch {
    /* private mode */
  }
}

/**
 * 레거시 키들에서 병합한 데이터만 반환 (서버 이관용). __ 로 시작하는 키는 제외.
 */
export function getMergedLegacyProfileEditData(userId: string | null, userEmail: string | null): Record<string, string> {
  if (typeof window === 'undefined' || !userId) return {};
  try {
    const emailNorm = (userEmail ?? '').toLowerCase();
    const targetKey = `${PREFIX}${userId}`;
    const target = parseJson(localStorage.getItem(targetKey)) ?? {};

    const sources: Record<string, unknown>[] = [target];
    const legacy = parseJson(localStorage.getItem(LEGACY_KEY));
    if (legacy) sources.push(legacy);
    if (emailNorm) {
      const emailKey = `${PREFIX}${emailNorm}`;
      if (emailKey !== targetKey) {
        const byEmail = parseJson(localStorage.getItem(emailKey));
        if (byEmail) sources.push(byEmail);
      }
    }

    const out: Record<string, string> = {};
    for (const src of sources) {
      for (const [k, v] of Object.entries(src)) {
        if (k.startsWith('__')) continue;
        const cur = out[k];
        const empty = cur == null || (typeof cur === 'string' && !String(cur).trim());
        if (empty && v != null && String(v).trim() !== '') {
          out[k] = String(v);
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** 서버 이관 완료 후 레거시 profileEdit 키 제거 */
export function clearLegacyProfileEditStorageKeys(userId: string | null, userEmail: string | null): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(LEGACY_KEY);
    const emailNorm = (userEmail ?? '').toLowerCase();
    if (emailNorm) localStorage.removeItem(`${PREFIX}${emailNorm}`);
    localStorage.removeItem(`${PREFIX}${userId}`);
  } catch {
    /* */
  }
}
