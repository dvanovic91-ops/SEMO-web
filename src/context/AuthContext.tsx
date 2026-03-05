import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
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
  isAdmin: boolean;
  /** 로그인 성공 직후 세션 반영용. session 넘기면 즉시 적용 후 네비만 함 */
  applySession: (session: Session | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** 로그인 상태 — Supabase 세션 우선, 없으면 localStorage(테스트용) */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userEmail, setUserEmailState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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
      setIsAdmin(false);
    }
  }, []);

  const applySession = useCallback(async (session: Session | null) => {
    if (session?.user) {
      setUserEmailState(session.user.email ?? null);
      setUserId(session.user.id);
      const meta = session.user.user_metadata ?? {};
      const displayName =
        (typeof meta.nickname === 'string' && meta.nickname.trim()) ||
        (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
        (typeof meta.name === 'string' && meta.name.trim()) ||
        (session.user.email ? session.user.email.split('@')[0] : '') ||
        'Гость';
      try {
        const { data: existing } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', session.user.id)
          .single();
        const hasName = !!existing?.name?.trim();
        if (!hasName) {
          await supabase.from('profiles').upsert(
            { id: session.user.id, name: displayName.trim() || null },
            { onConflict: 'id' }
          );
        }
      } catch {
        // ignore
      }
      try {
        const { data } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', session.user.id)
          .single();
        setIsAdmin(!!data?.is_admin);
      } catch {
        setIsAdmin(false);
      }
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
      setIsAdmin(false);
    }
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (supabase) {
      let cancelled = false;
      const timeout = window.setTimeout(() => {
        if (!cancelled) {
          cancelled = true;
          setInitialized(true);
        }
      }, 4000);

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          void applySession(session);
          return;
        }
        supabase.auth.refreshSession().then(({ data: { session: refreshed } }) => {
          void applySession(refreshed ?? null);
        }).catch(() => {
          void applySession(null);
        });
      }).catch(() => {
        setUserEmailState(null);
        setUserId(null);
        setIsAdmin(false);
        setInitialized(true);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        void applySession(session);
      });

      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
        subscription.unsubscribe();
      };
    }
    if (!supabase) {
      setInitialized(true);
    }
    return undefined;
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      userEmail,
      userId,
      setUserEmail,
      isLoggedIn: !!userEmail,
      initialized,
      isAdmin,
      applySession,
    }),
    [userEmail, userId, initialized, isAdmin, setUserEmail, applySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
