/**
 * 프로필 확장 정보 — 이름, 등급, 포인트 (localStorage 동기화).
 * 실제 백엔드 연동 시 API로 대체.
 */
const KEY = 'userProfile';

export type Grade = 'Обычный участник' | 'Премиум участник';

export interface UserProfile {
  name: string;
  grade: Grade;
  points: number;
}

const DEFAULT_GRADE: Grade = 'Обычный участник';

function defaultNameFromEmail(email: string): string {
  const part = email.split('@')[0];
  if (!part) return 'Гость';
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

export function getProfile(email: string): UserProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      if (parsed && typeof parsed.name === 'string' && typeof parsed.points === 'number') {
        return {
          name: parsed.name,
          grade: parsed.grade === 'Премиум участник' ? 'Премиум участник' : DEFAULT_GRADE,
          points: Math.max(0, parsed.points),
        };
      }
    }
  } catch {
    // ignore
  }
  return {
    name: defaultNameFromEmail(email),
    grade: DEFAULT_GRADE,
    points: 0,
  };
}

export function setProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
