import React, { useEffect, useState } from 'react';
import { deepkorSupabase } from '../lib/deepkorSupabase';

/**
 * Deepkor(koskos) 관리자 웹앱 진입점. 경로 자체가 난독화된 슬러그라 추측하기 어렵지만
 * (`project_admin_web_app_plan` 세션 메모리 참고), 그것만 믿지 않고 실제 인증도 건다:
 *
 * 1. 로그인 안 됐으면 "Sign in with Google" 버튼만 보여줌
 * 2. 로그인은 됐는데 `is_current_user_admin()`(admin_users 테이블 대조, service_role
 *    없이도 안전하게 boolean만 확인 가능한 SECURITY DEFINER 함수)이 false면 —
 *    "여긴 관리자 전용입니다" 같은 문구도 없이 그냥 일반 페이지가 아닌 것처럼 보이게 함
 *    (존재 자체를 숨기는 게 원칙, 관리자 아닌 사람에게 힌트를 주지 않는다)
 * 3. 관리자 확인되면 실제 콘텐츠(지금은 자리표시자 — 제보승인/성분사전관리 등 실제
 *    화면은 각각 디자인 목업 확정 후 순서대로 구현 예정)
 *
 * 이 페이지는 세모박스 자체 Supabase가 아니라 Deepkor 전용 Supabase(`../lib/deepkorSupabase`)를
 * 쓴다 — 완전히 별개 프로젝트.
 */
type GateState = 'checking' | 'signedOut' | 'notAdmin' | 'admin';

export const KoskosAdmin: React.FC = () => {
  const [state, setState] = useState<GateState>('checking');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data } = await deepkorSupabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        setState('signedOut');
        return;
      }
      const { data: isAdmin, error } = await deepkorSupabase.rpc('is_current_user_admin');
      if (cancelled) return;
      setState(!error && isAdmin === true ? 'admin' : 'notAdmin');
    }

    check();

    const { data: sub } = deepkorSupabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn() {
    setSigningIn(true);
    await deepkorSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://semo-box.com/koskos/mgr-8fq3wz' },
    });
    // 성공 시 구글로 리다이렉트되므로 여기 이후 코드는 보통 실행 안 됨.
    setSigningIn(false);
  }

  if (state === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </main>
    );
  }

  if (state === 'notAdmin') {
    // 관리자 페이지라는 티를 내지 않는다 — 그냥 존재하지 않는 페이지처럼.
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <p className="text-lg font-medium text-slate-800">404</p>
        <p className="mt-2 text-sm text-slate-500">Page not found.</p>
      </main>
    );
  }

  if (state === 'signedOut') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center">
        <p className="mb-6 text-sm text-white/70">koskos</p>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950 disabled:opacity-60"
        >
          {signingIn ? 'Redirecting…' : 'Sign in with Google'}
        </button>
      </main>
    );
  }

  // state === 'admin'
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-900">koskos admin</h1>
        <p className="mt-2 text-sm text-slate-500">
          자리표시자 페이지 — 제보 승인 / 성분 사전 관리 화면이 목업 확정 순서대로 여기 들어올 예정.
        </p>
      </div>
    </main>
  );
};
