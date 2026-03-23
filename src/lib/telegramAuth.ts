/**
 * Telegram Login — Widget (로그인 페이지) + Mini App (자동 로그인)
 *
 * 흐름:
 *  1. Widget / Mini App에서 Telegram 데이터 수집
 *  2. Edge Function `telegram-auth`로 전송 → token_hash 수령
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
    // Telegram Login Widget 콜백
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

// ── Edge Function URL ──
function getEdgeFunctionUrl(supabaseUrl: string): string {
  return `${supabaseUrl}/functions/v1/telegram-auth`;
}

// ── Widget 로그인 (로그인 페이지) ──

/**
 * Telegram Login Widget를 팝업으로 열어 인증.
 * 성공 시 supabase 세션이 자동 생성됨.
 */
export function loginWithTelegramWidget(
  supabaseClient: SupabaseClient,
  supabaseUrl: string,
  botUsername: string,
): Promise<{ ok: boolean; isNew?: boolean; error?: string }> {
  return new Promise((resolve) => {
    // 콜백 등록
    window.__telegramLoginCallback = async (user: TelegramWidgetUser) => {
      try {
        // 위젯 데이터를 Record<string, string>으로 변환
        const data: Record<string, string> = {};
        for (const [k, v] of Object.entries(user)) {
          data[k] = String(v);
        }

        const resp = await fetch(getEdgeFunctionUrl(supabaseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'widget', data }),
        });

        const result = await resp.json();
        if (!result.ok) {
          resolve({ ok: false, error: result.error || 'auth_failed' });
          return;
        }

        // verifyOtp로 세션 생성
        const { error: otpErr } = await supabaseClient.auth.verifyOtp({
          token_hash: result.token_hash,
          type: 'magiclink',
        });

        if (otpErr) {
          resolve({ ok: false, error: otpErr.message });
          return;
        }

        resolve({ ok: true, isNew: result.is_new });
      } catch (err) {
        resolve({ ok: false, error: (err as Error).message });
      }
    };

    // Telegram Login Widget를 팝업으로 열기
    // https://core.telegram.org/widgets/login#setting-up-a-widget
    const origin = encodeURIComponent(window.location.origin);
    const popupUrl =
      `https://oauth.telegram.org/auth?bot_id=${botUsername}&origin=${origin}&embed=0&request_access=write&return_to=${encodeURIComponent(window.location.href)}`;

    // 팝업 대신 iframe/script 방식 사용 (더 안정적)
    // Telegram Login Widget 스크립트를 동적으로 삽입
    const containerId = 'telegram-login-container';
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.position = 'fixed';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      document.body.appendChild(container);
    }
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', '__telegramLoginCallback(user)');
    script.setAttribute('data-request-access', 'write');
    script.async = true;

    // 실제로는 Telegram이 auth 팝업을 열어줌
    // 스크립트가 로드되면 자동으로 팝업/리다이렉트 처리
    container.appendChild(script);

    // 타임아웃 (2분)
    setTimeout(() => {
      resolve({ ok: false, error: 'timeout' });
    }, 120_000);
  });
}

/**
 * Telegram 위젯 로그인을 바로 트리거 (팝업 방식).
 * 콜백 함수를 등록하고, Telegram OAuth 창을 엶.
 */
export function triggerTelegramLogin(
  supabaseClient: SupabaseClient,
  supabaseUrl: string,
  botUsername: string,
): Promise<{ ok: boolean; isNew?: boolean; error?: string }> {
  return new Promise((resolve) => {
    // 글로벌 콜백
    window.__telegramLoginCallback = async (user: TelegramWidgetUser) => {
      try {
        const data: Record<string, string> = {};
        for (const [k, v] of Object.entries(user)) {
          data[k] = String(v);
        }

        const resp = await fetch(getEdgeFunctionUrl(supabaseUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'widget', data }),
        });

        const result = await resp.json();
        if (!result.ok) {
          resolve({ ok: false, error: result.error || 'auth_failed' });
          return;
        }

        const { error: otpErr } = await supabaseClient.auth.verifyOtp({
          token_hash: result.token_hash,
          type: 'magiclink',
        });

        if (otpErr) {
          resolve({ ok: false, error: otpErr.message });
          return;
        }

        resolve({ ok: true, isNew: result.is_new });
      } catch (err) {
        resolve({ ok: false, error: (err as Error).message });
      }
    };

    // Telegram OAuth 팝업 열기
    const botId = botUsername.replace('@', '');
    const popup = window.open(
      `https://oauth.telegram.org/auth?bot_id=${botId}&origin=${encodeURIComponent(window.location.origin)}&embed=0&request_access=write`,
      'TelegramAuth',
      'width=550,height=470,resizable=yes,scrollbars=yes',
    );

    // 팝업이 닫히면 체크
    if (popup) {
      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval);
          // 콜백이 아직 호출되지 않았으면 취소로 처리
          // (resolve가 이미 호출되었으면 무시됨)
          resolve({ ok: false, error: 'popup_closed' });
        }
      }, 500);
    }

    // 타임아웃
    setTimeout(() => resolve({ ok: false, error: 'timeout' }), 120_000);
  });
}


// ── Mini App 자동 로그인 ──

/**
 * Telegram Mini App에서 열렸을 때 자동 로그인.
 * window.Telegram.WebApp.initData가 있으면 Edge Function으로 인증.
 * @returns true면 로그인 성공, false면 Mini App 아니거나 실패
 */
export async function loginWithMiniApp(
  supabaseClient: SupabaseClient,
  supabaseUrl: string,
): Promise<boolean> {
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) return false;

  try {
    // Mini App 준비 알림
    window.Telegram?.WebApp?.ready();

    const resp = await fetch(getEdgeFunctionUrl(supabaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'miniapp', data: initData }),
    });

    const result = await resp.json();
    if (!result.ok) {
      console.warn('[MiniApp Auth] Edge function error:', result.error);
      return false;
    }

    const { error: otpErr } = await supabaseClient.auth.verifyOtp({
      token_hash: result.token_hash,
      type: 'magiclink',
    });

    if (otpErr) {
      console.warn('[MiniApp Auth] verifyOtp error:', otpErr.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[MiniApp Auth] unexpected error:', err);
    return false;
  }
}

/**
 * Mini App 환경인지 빠르게 확인
 */
export function isTelegramMiniApp(): boolean {
  return !!(window.Telegram?.WebApp?.initData);
}
