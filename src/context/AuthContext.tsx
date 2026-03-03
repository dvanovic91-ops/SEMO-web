import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'userEmail';

/** 테스트용 관리자 이메일 — 이 계정으로 로그인 시 Profile 진입용 dummy userId 사용 */
export const TEST_ADMIN_EMAIL = 'admin@semo-beautybox.com';
export const ADMIN_DUMMY_USER_ID = '00000000-0000-0000-0000-000000000001';

interface AuthContextValue {
  userEmail: string | null;
  userId: string | null;
  setUserEmail: (email: string | null) => void;
  isLoggedIn: boolean;
  initialized: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** 로그인 상태 — Supabase 세션 우선, 없으면 localStorage(테스트용) */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userEmail, setUserEmailState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const setUserEmail = useCallback((email: string | null) => {
    if (email) {
      try {
        localStorage.setItem(STORAGE_KEY, email);
      } catch {
        // ignore
      }
      setUserEmailState(email);
      setUserId(email === TEST_ADMIN_EMAIL ? ADMIN_DUMMY_USER_ID : null);
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      if (supabase) supabase.auth.signOut().catch(() => {});
      setUserEmailState(null);
      setUserId(null);
    }
  }, []);

  useEffect(() => {
    if (supabase) {
      const applySession = (session: { user: { email?: string | null; id: string } } | null) => {
        if (session?.user) {
          setUserEmailState(session.user.email ?? null);
          setUserId(session.user.id);
          try {
            const raw = localStorage.getItem('semo_anon_result');
            if (raw) {
              const data = JSON.parse(raw) as { skin_type: string };
              if (data?.skin_type) {
                supabase
                  .from('skin_test_results')
                  .insert({ user_id: session.user.id, skin_type: data.skin_type })
                  .then(() => localStorage.removeItem('semo_anon_result'))
                  .catch(() => {});
              }
            }
          } catch {
            // ignore
          }
        } else {
          setUserEmailState(null);
          setUserId(null);
        }
        setInitialized(true);
      };

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          applySession(session);
          return;
        }
        supabase.auth.refreshSession().then(({ data: { session: refreshed } }) => {
          applySession(refreshed ?? null);
        }).catch(() => {
          applySession(null);
        });
      }).catch(() => {
        setUserEmailState(null);
        setUserId(null);
        setInitialized(true);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUserEmailState(session.user.email ?? null);
          setUserId(session.user.id);
          // 비회원 때 했던 테스트 결과가 있으면 DB에 저장 (가입 후 1회 남은 걸로 반영)
          try {
            const raw = localStorage.getItem('semo_anon_result');
            if (raw) {
              const data = JSON.parse(raw) as { skin_type: string };
              if (data?.skin_type) {
                supabase
                  .from('skin_test_results')
                  .insert({ user_id: session.user.id, skin_type: data.skin_type })
                  .then(() => {
                    localStorage.removeItem('semo_anon_result');
                  })
                  .catch(() => {});
              }
            }
          } catch {
            // ignore
          }
        } else {
          setUserEmailState(null);
          setUserId(null);
        }
      });
      return () => subscription.unsubscribe();
    }
    if (!supabase) {
      setInitialized(true);
    }
    return undefined;
  }, []);

  const value: AuthContextValue = {
    userEmail,
    userId,
    setUserEmail,
    isLoggedIn: !!userEmail,
    initialized,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
