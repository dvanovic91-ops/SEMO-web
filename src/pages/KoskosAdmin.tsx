import React, { useEffect, useState } from 'react';
import { deepkorSupabase } from '../lib/deepkorSupabase';
import { PendingApprovals } from './koskos-admin/PendingApprovals';
import { MembersPanel } from './koskos-admin/MembersPanel';
import { NoticesPanel } from './koskos-admin/NoticesPanel';
import { ScansPanel } from './koskos-admin/ScansPanel';
import { HomeCmsPanel } from './koskos-admin/HomeCmsPanel';
import { KOSKOS_ADMIN_PATH } from './koskos-admin/types';

/**
 * Deepkor(koskos) 관리자 웹앱. 경로 슬러그 + is_current_user_admin() 게이트.
 * 관리자가 아니면 404처럼 보이게 해서 존재 자체를 숨긴다.
 */
type GateState = 'checking' | 'signedOut' | 'notAdmin' | 'admin';
type AdminTab = 'home' | 'pending' | 'members' | 'notices' | 'scans' | 'ingredients';

export const KoskosAdmin: React.FC = () => {
  const [state, setState] = useState<GateState>('checking');
  const [signingIn, setSigningIn] = useState(false);
  const [tab, setTab] = useState<AdminTab>('home');
  const [banner, setBanner] = useState<string | null>(null);

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
    const redirectTo = `${window.location.origin}${KOSKOS_ADMIN_PATH}`;
    await deepkorSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    setSigningIn(false);
  }

  async function handleSignOut() {
    await deepkorSupabase.auth.signOut();
    setState('signedOut');
  }

  if (state === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </main>
    );
  }

  if (state === 'notAdmin') {
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

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">koskos admin</p>
          <nav className="flex flex-wrap justify-center gap-1">
            {(
              [
                ['home', '홈 화면'],
                ['pending', '제보 승인'],
                ['members', '회원'],
                ['notices', '공지'],
                ['scans', '스캔'],
                ['ingredients', '성분 사전'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <button type="button" onClick={handleSignOut} className="text-xs text-slate-500 hover:text-slate-800">
            로그아웃
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6">
        {banner && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {banner}
            <button type="button" className="ml-3 underline" onClick={() => setBanner(null)}>
              닫기
            </button>
          </div>
        )}
        {tab === 'home' && <HomeCmsPanel onError={setBanner} />}
        {tab === 'pending' && <PendingApprovals onError={setBanner} />}
        {tab === 'members' && <MembersPanel onError={setBanner} />}
        {tab === 'notices' && <NoticesPanel onError={setBanner} />}
        {tab === 'scans' && <ScansPanel onError={setBanner} />}
        {tab === 'ingredients' && <ComingSoonTab title="성분 사전" />}
      </div>
    </main>
  );
};

function ComingSoonTab({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      <p className="mt-2 text-sm text-slate-500">다음 순서로 붙입니다.</p>
    </div>
  );
}
