/**
 * 프로필 확장 정보 — 이름, 등급, 포인트 (localStorage 동기화).
 * 실제 백엔드 연동 시 API로 대체.
 * 이메일별로 별도 저장해야 여러 계정이 섞이지 않는다.
 */
const KEY = 'userProfileByEmail';

export type Grade = 'Обычный участник' | 'Премиум участник';

export interface UserProfile {
  name: string;
  grade: Grade;
  points: number;
}

type StoredProfiles = Record<string, UserProfile>;

const DEFAULT_GRADE: Grade = 'Обычный участник';

function defaultNameFromEmail(email: string): string {
  const part = email.split('@')[0];
  if (!part) return 'Гость';
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

function normalizeProfile(p: UserProfile): UserProfile {
  return {
    name: p.name,
    grade: p.grade === 'Премиум участник' ? 'Премиум участник' : DEFAULT_GRADE,
    points: Math.max(0, p.points),
  };
}

function loadAll(): StoredProfiles {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredProfiles | UserProfile;
    // 예전 구조(단일 객체)인 경우, 어떤 계정이든 공통으로 쓰되 곧 새 구조로 덮어쓴다.
    if ('name' in parsed && 'points' in parsed) {
      return {};
    }
    if (parsed && typeof parsed === 'object') {
      return parsed as StoredProfiles;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveAll(all: StoredProfiles) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function getProfile(email: string): UserProfile {
  const all = loadAll();
  const existing = all[email];
  if (existing) return normalizeProfile(existing);
  return {
    name: defaultNameFromEmail(email),
    grade: DEFAULT_GRADE,
    points: 0,
  };
}

export function setProfile(email: string, profile: UserProfile): void {
  const all = loadAll();
  all[email] = normalizeProfile(profile);
  saveAll(all);
}

export function clearProfile(email?: string): void {
  if (!email) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    return;
  }
  const all = loadAll();
  if (all[email]) {
    delete all[email];
    saveAll(all);
  }
}
