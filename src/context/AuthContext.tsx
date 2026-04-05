import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { getOrCreateVisitSessionId } from '../lib/clientSession';
import { migrateLegacyProfileEditToSupabase } from '../lib/profileDeliveryDb';

/** 관리자·매니저 여부는 `profiles.is_admin` / `is_manager` 만 신뢰 (클라이언트 이메일 목록 없음). */

interface AuthContextValue {
  userEmail: string | null;
  userId: string | null;
  /** Supabase `user.email_confirmed_at` (가입 확인). OAuth 구글/얀덱스는 공급자 신뢰로 동일 취급 */
  emailConfirmedAt: string | null;
  /** 이메일·비밀번호: 가입 메일 확인 완료 여부 */
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

function emailConfirmedAtFromUser(user: User | null | undefined): string | null {
  if (!user) return null;
  const v = user.email_confirmed_at;
  if (v == null || v === '') return null;
  return typeof v === 'string' ? v : String(v);
}

/** 표시·주문 게이트용 확인 시각: Auth 확인 완료 또는 OAuth(구글/얀덱스) */
function resolvedEmailConfirmedAt(user: User | null, uid: string | null): string | null {
  if (!user || !uid) return null;
  const fromAuth = emailConfirmedAtFromUser(user);
  if (fromAuth) return fromAuth;
  if (isOauthGoogleOrYandexUser(user)) return new Date().toISOString();
  return null;
}

/** 구글/얀덱스 OAuth(또는 얀덱스 user_metadata) — 이메일 매직링크 없이 신뢰 */
function isOauthGoogleOrYandexUser(user: User): boolean {
  const p = String(user.app_metadata?.provider ?? '').toLowerCase();
  if (p === 'google' || p === 'yandex') return true;
  const prov = user.app_metadata?.providers;
  if (Array.isArray(prov)) {
    return prov.some((x) => x === 'google' || x === 'yandex');
  }
  const yid = (user.user_metadata as Record<string, unknown> | undefined)?.yandex_id;
  if (yid != null && String(yid).trim() !== '') return true;
  return false;
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
      if (isOauthGoogleOrYandexUser(data.user)) {
        await supabase.rpc('sync_own_oauth_email_verified').catch(() => {});
      }
      setEmailConfirmedAt(resolvedEmailConfirmedAt(data.user, data.user.id));
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
      if (supabase && serverUser && isOauthGoogleOrYandexUser(serverUser)) {
        const { error: oauthRpcErr } = await supabase.rpc('sync_own_oauth_email_verified');
        if (oauthRpcErr) {
          console.warn('[Auth] sync_own_oauth_email_verified', oauthRpcErr.message);
        }
      }
      setEmailConfirmedAt(resolvedEmailConfirmedAt(serverUser ?? session.user, session.user.id));
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
        const { data, error: profErr } = await supabase
          .from('profiles')
          .select('is_admin, is_manager')
          .eq('id', session.user.id)
          .single();
        if (profErr || !data) {
          setCanGrantPermission(false);
          setCanGrantAdminRole(false);
          setIsAdmin(false);
        } else {
          const dbAdmin = !!data.is_admin;
          const dbManager = !!data.is_manager;
          setCanGrantPermission(dbAdmin);
          setCanGrantAdminRole(dbAdmin);
          setIsAdmin(dbAdmin || dbManager);
        }
      } catch {
        setCanGrantPermission(false);
        setCanGrantAdminRole(false);
        setIsAdmin(false);
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
