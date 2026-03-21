const VISIT_SESSION_KEY = 'bb_visit_sid';

/** 비로그인 방문자 구분용 세션 ID (localStorage). 없으면 생성 후 저장 */
export function getOrCreateVisitSessionId(): string {
  try {
    let sid = localStorage.getItem(VISIT_SESSION_KEY);
    if (!sid || sid.length < 10) {
      sid = crypto.randomUUID?.() ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(VISIT_SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `anon-${Date.now()}`;
  }
}

