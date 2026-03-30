/**
 * Telegram Login — Widget (로그인 페이지) + Mini App (자동 로그인)
 *
 * 흐름:
 *  1. Widget / Mini App에서 Telegram 데이터 수집
 *  2. supabase.functions.invoke('telegram-auth') → token_hash 수령
 *  3. supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) → 세션 생성
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Telegram WebApp 글로벌 타입 ──
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: Record<string, unknown>;
        ready: () => void;
        expand: () => void;
        close: () => void;
      };
    };
    // Telegram Login Widget 콜백 (script 방식)
    __telegramLoginCallback?: (user: TelegramWidgetUser) => void;
  }
}

interface TelegramWidgetUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

// ── Edge Function 호출 (supabase.functions.invoke — auth 자동 처리) ──

async function authenticateWithEdgeFunction(
  supabaseClient: SupabaseClient,
  mode: 'widget' | 'miniapp',
  data: Record<string, string> | string,
): Promise<{ ok: boolean; isNew?: boolean; error?: string }> {
  console.log('[TelegramAuth] calling telegram-auth, mode:', mode);

  const { data: result, error: invokeErr } = await supabaseClient.functions.invoke('telegram-auth', {
    body: { mode, data },
  });

  console.log('[TelegramAuth] result:', JSON.stringify(result), 'err:', invokeErr?.message);

  if (invokeErr) {
    return { ok: false, error: `invoke:${invokeErr.message}` };
  }

  if (!result?.ok) {
    return { ok: false, error: `${result?.error || 'no_ok'}` };
  }

  console.log('[TelegramAuth] verifyOtp...');
  const { error: otpErr } = await supabaseClient.auth.verifyOtp({
    token_hash: result.token_hash,
    type: 'magiclink',
  });

  if (otpErr) {
    return { ok: false, error: `otp:${otpErr.message}` };
  }
  console.log('[TelegramAuth] success!');

  return { ok: true, isNew: result.is_new };
}

// ── Widget 로그인 (로그인 페이지에서 텔레그램 버튼 클릭) ──

export function triggerTelegramLogin(
  supabaseClient: SupabaseClient,
  _supabaseUrl: string,
  botUsername: string,
): Promise<{ ok: boolean; isNew?: boolean; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: { ok: boolean; isNew?: boolean; error?: string }) => {
      if (!resolved) {
        resolved = true;
        // 오버레이/컨테이너 정리
        document.getElementById('telegram-login-overlay')?.remove();
        document.getElementById('telegram-login-container')?.remove();
        resolve(result);
      }
    };

    // 콜백: Telegram 인증 데이터 수신 → Edge Function 호출
    const handleAuth = async (user: TelegramWidgetUser | false) => {
      if (!user) {
        finish({ ok: false, error: 'popup_closed' });
        return;
      }
      try {
        const data: Record<string, string> = {};
        for (const [k, v] of Object.entries(user)) {
          data[k] = String(v);
        }
        const result = await authenticateWithEdgeFunction(supabaseClient, 'widget', data);
        finish(result);
      } catch (err) {
        finish({ ok: false, error: (err as Error).message });
      }
    };

    window.__telegramLoginCallback = (user: TelegramWidgetUser) => handleAuth(user);

    // 기존 컨테이너 정리
    document.getElementById('telegram-login-overlay')?.remove();
    document.getElementById('telegram-login-container')?.remove();

    // 배경 오버레이
    const overlay = document.createElement('div');
    overlay.id = 'telegram-login-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998';
    overlay.onclick = () => finish({ ok: false, error: 'popup_closed' });
    document.body.appendChild(overlay);

    // 위젯 컨테이너
    const container = document.createElement('div');
    container.id = 'telegram-login-container';
    container.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:white;border-radius:16px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,0.3);min-width:280px;text-align:center';
    document.body.appendChild(container);

    // 타이틀
    const title = document.createElement('p');
    title.textContent = 'Войти через Telegram';
    title.style.cssText = 'margin-bottom:16px;font-size:16px;font-weight:600;color:#333';
    container.appendChild(title);

    // Telegram Widget 스크립트
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-onauth', '__telegramLoginCallback(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;
    container.appendChild(script);

    setTimeout(() => finish({ ok: false, error: 'timeout' }), 120_000);
  });
}


// ── Mini App 자동 로그인 ──

export async function loginWithMiniApp(
  supabaseClient: SupabaseClient,
  _supabaseUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) return { ok: false, error: 'no_initData' };

  try {
    const w = window.Telegram?.WebApp;
    w?.ready();
    try {
      w?.expand();
    } catch {
      /* */
    }

    const result = await authenticateWithEdgeFunction(supabaseClient, 'miniapp', initData);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function isTelegramMiniApp(): boolean {
  return !!(window.Telegram?.WebApp?.initData);
}
