/**
 * 비밀번호 재설정 링크로 받은 세션의 access_token JWT에 recovery 가 들어 있는지.
 * /login 에서 isLoggedIn 일 때 홈으로 보내지 않고 /auth/reset-password 로 보내기 위해 사용.
 */
export function isRecoveryAccessToken(accessToken: string): boolean {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return false;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { amr?: unknown };
    return JSON.stringify(payload.amr ?? '').includes('recovery');
  } catch {
    return false;
  }
}
