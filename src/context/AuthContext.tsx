import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'userEmail';

/** 테스트용 관리자 이메일 — 이 계정으로 로그인 시 Profile 진입용 dummy userId 사용 */
export const TEST_ADMIN_EMAIL = 'admin@semo-beautybox.com';
export const ADMIN_DUMMY_USER_ID = '00000000-0000-0000-0000-000000000001';

/** 개발자 계정 — 항상 최상위 권한(관리자모드 전체). DB/RLS와 무관하게 프론트에서 항상 관리자로 인식 */
const DEVELOPER_EMAILS = ['dvanovic91@gmail.com', 'dvavnovic91@gmail.com'];
/** 관리자 모드 접근 허용 이메일 — DB is_admin 없어도 이 목록에 있으면 관리자(권한부여 가능)로 인식 */
const ADMIN_EMAIL_ALLOWLIST = ['admin@semo-box.ru', 'admin@semo-beautybox.com', ...DEVELOPER_EMAILS];
/** 매니저(보기 전용) 허용 이메일 */
const MANAGER_EMAIL_ALLOWLIST: string[] = [];

interface AuthContextValue {
  userEmail: string | null;
  userId: string | null;
  setUserEmail: (email: string | null) => void;
  isLoggedIn: boolean;
  initialized: boolean;
  /** 관리자모드 접근 가능(매니저 보기 전용 + 관리자 전체). 프로필 링크·/admin 진입용 */
  isAdmin: boolean;
  /** 관리자모드에서 쓰기/삭제/권한 부여 가능 (매니저는 false) */
  canGrantPermission: boolean;
  /** 개발자만 true — "관리자" 역할 부여 가능. admin은 매니저만 부여 가능 */
  canGrantAdminRole: boolean;
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
  const [canGrantPermission, setCanGrantPermission] = useState(false);
  const [canGrantAdminRole, setCanGrantAdminRole] = useState(false);

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
      setCanGrantPermission(false);
      setCanGrantAdminRole(false);
    }
  }, []);

  const applySession = useCallback(async (session: Session | null) => {
    if (session?.user) {
      // 레거시 공용 키 정리: 과거 profileEdit 단일 키로 인한 계정 간 혼선 방지
      try {
        localStorage.removeItem('profileEdit');
      } catch {
        // ignore
      }
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
      const emailNorm = (session.user.email ?? '').trim().toLowerCase();
      const isDeveloper = emailNorm && DEVELOPER_EMAILS.includes(emailNorm);
      if (isDeveloper) {
        setCanGrantPermission(true);
        setCanGrantAdminRole(true);
        setIsAdmin(true);
      } else {
        try {
          const fromAdminAllowlist = emailNorm && ADMIN_EMAIL_ALLOWLIST.includes(emailNorm);
          const fromManagerAllowlist = emailNorm && MANAGER_EMAIL_ALLOWLIST.includes(emailNorm);
          const { data } = await supabase
            .from('profiles')
            .select('is_admin, is_manager')
            .eq('id', session.user.id)
            .single();
          const dbAdmin = !!data?.is_admin;
          const dbManager = !!data?.is_manager;
          const fullAdmin = dbAdmin || fromAdminAllowlist;
          const manager = dbManager || fromManagerAllowlist;
          setCanGrantPermission(fullAdmin);
          setCanGrantAdminRole(false);
          setIsAdmin(fullAdmin || manager);
        } catch {
          const fullAdmin = !!(emailNorm && ADMIN_EMAIL_ALLOWLIST.includes(emailNorm));
          const manager = !!(emailNorm && MANAGER_EMAIL_ALLOWLIST.includes(emailNorm));
          setCanGrantPermission(fullAdmin);
          setCanGrantAdminRole(false);
          setIsAdmin(fullAdmin || manager);
        }
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
      setCanGrantPermission(false);
      setCanGrantAdminRole(false);
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
        setCanGrantPermission(false);
        setCanGrantAdminRole(false);
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
      canGrantPermission,
      canGrantAdminRole,
      applySession,
    }),
    [userEmail, userId, initialized, isAdmin, canGrantPermission, canGrantAdminRole, setUserEmail, applySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
