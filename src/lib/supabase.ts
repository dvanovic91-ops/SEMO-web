import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 클라이언트 — 프론트에서 DB·Auth 접근용.
 * .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 설정 필요.
 * "로그인 유지하기" 체크 시 localStorage, 미체크 시 sessionStorage 사용 (탭 종료 시 로그아웃).
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

const REMEMBER_ME_KEY = 'semo_remember_me';

function getAuthStorage(): Storage {
  if (typeof window === 'undefined') return localStorage;
  return sessionStorage.getItem(REMEMBER_ME_KEY) === 'false' ? sessionStorage : localStorage;
}

const customStorage = {
  getItem: (key: string) => getAuthStorage().getItem(key),
  setItem: (key: string, value: string) => getAuthStorage().setItem(key, value),
  removeItem: (key: string) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { storage: customStorage, persistSession: true } })
    : (null as ReturnType<typeof createClient> | null);

/** 로그인 시 "로그인 유지하기" 선택 저장 (OAuth 리다이렉트 전에 호출) */
export function setRememberMe(remember: boolean) {
  try {
    sessionStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false');
  } catch {
    // ignore
  }
}
