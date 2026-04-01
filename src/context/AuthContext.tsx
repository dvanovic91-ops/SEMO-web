import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { getOrCreateVisitSessionId } from '../lib/clientSession';
import { migrateLegacyProfileEditToSupabase } from '../lib/profileDeliveryDb';

/** 테스트용 관리자 이메일 — 이 계정으로 로그인 시 Profile 진입용 dummy userId 사용 */
export const TEST_ADMIN_EMAIL = 'admin@semo-box.ru';
export const ADMIN_DUMMY_USER_ID = '00000000-0000-0000-0000-000000000001';

/** 개발자 계정 — 항상 최상위 권한(관리자모드 전체). DB/RLS와 무관하게 프론트에서 항상 관리자로 인식 */
const DEVELOPER_EMAILS = ['dvanovic91@gmail.com'];
/** 관리자 모드 접근 허용 이메일 — DB is_admin 없어도 이 목록에 있으면 관리자(권한부여 가능)로 인식 */
const ADMIN_EMAIL_ALLOWLIST = ['admin@semo-box.ru', ...DEVELOPER_EMAILS];
/** 매니저(보기 전용) 허용 이메일 */
const MANAGER_EMAIL_ALLOWLIST: string[] = [];

interface AuthContextValue {
  userEmail: string | null;
  userId: string | null;
  /** profiles.email_verified_at — UI/주문 ‘이메일 인증’의 유일 기준 (auth만 보면 Confirm OFF일 때 전원 인증됨으로 나옴) */
  emailConfirmedAt: string | null;
  /** profiles.email_verified_at 존재 여부 — 더미 관리자 UUID는 항상 true */
  isEmailConfirmed: boolean;
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
  /** Auth 서버에서 email_confirmed_at 재조회 — JWT 캐시와 불일치 방지 */
  refreshEmailConfirmationFromServer: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Confirm email OFF일 때 created_at과 email_confirmed_at이 같은 요청 안에서 거의 동시에 찍힘 → 이 간격보다 짧으면
 * “가짜 인증”으로 보고 프로필에 복사하지 않음. 4초는 빠른 메일 클라이언트가 링크를 연 경우까지 막을 수 있어 1.5초로 조정.
 */
const AUTH_EMAIL_SYNC_MIN_MS = 1500;

/**
 * auth.email_confirmed_at 은 있으나 profile.email_verified_at 이 비어 있을 때만,
 * 가입 시점과 충분히 떨어진 확인 시각이면 프로필에 반영(Confirm ON 후 링크 클릭 등).
 */
async function maybeSyncProfileEmailFromAuth(user: User): Promise<boolean> {
  if (!supabase || user.id === ADMIN_DUMMY_USER_ID) return false;
  if (!user.email_confirmed_at) return false;
  const { data: prof, error } = await supabase
    .from('profiles')
    .select('email_verified_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error || prof?.email_verified_at) return false;

  const created = new Date(user.created_at).getTime();
  const confirmed = new Date(user.email_confirmed_at).getTime();
  if (confirmed - created < AUTH_EMAIL_SYNC_MIN_MS) return false;

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ email_verified_at: user.email_confirmed_at })
    .eq('id', user.id)
    .is('email_verified_at', null);
  return !upErr;
}

async function fetchProfileEmailVerifiedAt(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('email_verified_at').eq('id', userId).maybeSingle();
  if (error) return null;
  return (data as { email_verified_at?: string | null } | null)?.email_verified_at ?? null;
}

/** 로그인 상태 — Supabase 세션 우선, 없으면 localStorage(테스트용) */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userEmail, setUserEmailState] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canGrantPermission, setCanGrantPermission] = useState(false);
  const [canGrantAdminRole, setCanGrantAdminRole] = useState(false);
  const [emailConfirmedAt, setEmailConfirmedAt] = useState<string | null>(null);

  const setUserEmail = useCallback((email: string | null) => {
    if (email) {
      setUserEmailState(email);
      setUserId(email === TEST_ADMIN_EMAIL ? ADMIN_DUMMY_USER_ID : null);
    } else {
      try {
        sessionStorage.removeItem('semo_tg_mini_login_try');
      } catch {
        /* private mode */
      }
      if (supabase) supabase.auth.signOut().catch(() => {});
      setUserEmailState(null);
      setUserId(null);
      setIsAdmin(false);
      setCanGrantPermission(false);
      setCanGrantAdminRole(false);
      setEmailConfirmedAt(null);
    }
  }, []);

  const refreshEmailConfirmationFromServer = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return;
      await maybeSyncProfileEmailFromAuth(data.user);
      const v = await fetchProfileEmailVerifiedAt(data.user.id);
      if (data.user.id === ADMIN_DUMMY_USER_ID) {
        setEmailConfirmedAt(v ?? new Date().toISOString());
      } else {
        setEmailConfirmedAt(v);
      }
    } catch {
      // ignore
    }
  }, []);

  const applySession = useCallback(async (session: Session | null) => {
    if (session?.user) {
      // 레거시 profileEdit 로컬 데이터 → Supabase shipping_addresses 1회 이관 후 단일 키 정리
      try {
        if (supabase) {
          await migrateLegacyProfileEditToSupabase(supabase, session.user.id, session.user.email ?? null);
        }
        localStorage.removeItem('profileEdit');
      } catch {
        // ignore
      }
      setUserEmailState(session.user.email ?? null);
      setUserId(session.user.id);
      // JWT의 email_confirmed_at은 오래된 값일 수 있음 → 서버 getUser() 우선
      let serverUser: User | undefined = session.user;
      if (supabase) {
        try {
          const { data, error } = await supabase.auth.getUser();
          if (!error && data.user) {
            serverUser = data.user;
          }
        } catch {
          // 세션 user 유지
        }
      }
      if (serverUser) {
        await maybeSyncProfileEmailFromAuth(serverUser);
      }
      let profileVerified = await fetchProfileEmailVerifiedAt(session.user.id);
      if (session.user.id === ADMIN_DUMMY_USER_ID) {
        setEmailConfirmedAt(profileVerified ?? new Date().toISOString());
      } else {
        setEmailConfirmedAt(profileVerified);
      }
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
        const sid = getOrCreateVisitSessionId();
        const anonResultKey = `semo_anon_result:${sid}`;
        const anonDoneKey = `semo_anon_test_done:${sid}`;
        const raw = localStorage.getItem(anonResultKey);
        if (raw) {
          const data = JSON.parse(raw) as { skin_type: string };
          if (data?.skin_type) {
            supabase
              .from('skin_test_results')
              .insert({ user_id: session.user.id, skin_type: data.skin_type })
              .then(() => {
                localStorage.removeItem(anonResultKey);
                localStorage.removeItem(anonDoneKey);
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
      setIsAdmin(false);
      setCanGrantPermission(false);
      setCanGrantAdminRole(false);
      setEmailConfirmedAt(null);
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

      const initSession = async () => {
        try {
          const { data: { session } } = await supabase!.auth.getSession();
          if (cancelled) return;
          if (session?.user) {
            void applySession(session);
            return;
          }
          /**
           * Telegram Mini App: Google/Yandex OAuth는 WebView에서 차단됨(disallowed_useragent).
           * initData → Edge `telegram-auth` → magiclink verify로 세션 생성 (연동 계정이면 해당 유저).
           */
          try {
            const { isTelegramMiniApp, loginWithMiniApp } = await import('../lib/telegramAuth');
            if (!cancelled && isTelegramMiniApp() && SUPABASE_URL) {
              const onceKey = 'semo_tg_mini_login_try';
              if (!sessionStorage.getItem(onceKey)) {
                sessionStorage.setItem(onceKey, '1');
                const mini = await loginWithMiniApp(supabase!, SUPABASE_URL);
                if (mini.ok && !cancelled) {
                  const { data: { session: afterTg } } = await supabase!.auth.getSession();
                  if (afterTg?.user) {
                    void applySession(afterTg);
                    return;
                  }
                }
                if (!mini.ok) {
                  sessionStorage.removeItem(onceKey);
                }
              }
            }
          } catch (e) {
            console.warn('[Auth] Telegram Mini App login skipped:', e);
          }
          const { data: { session: refreshed } } = await supabase!.auth.refreshSession();
          void applySession(refreshed ?? null);
        } catch {
          if (!cancelled) {
            void applySession(null);
          }
        }
      };
      initSession().catch(() => {
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

  const isEmailConfirmed = useMemo(() => {
    if (!userId) return false;
    if (userId === ADMIN_DUMMY_USER_ID) return true;
    return emailConfirmedAt != null;
  }, [userId, emailConfirmedAt]);

  const value = useMemo<AuthContextValue>(
    () => ({
      userEmail,
      userId,
      emailConfirmedAt,
      isEmailConfirmed,
      setUserEmail,
      isLoggedIn: !!userEmail,
      initialized,
      isAdmin,
      canGrantPermission,
      canGrantAdminRole,
      applySession,
      refreshEmailConfirmationFromServer,
    }),
    [
      userEmail,
      userId,
      emailConfirmedAt,
      isEmailConfirmed,
      initialized,
      isAdmin,
      canGrantPermission,
      canGrantAdminRole,
      setUserEmail,
      applySession,
      refreshEmailConfirmationFromServer,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
