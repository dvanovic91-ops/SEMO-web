// KOSKOS 바깥 감시 알림(2026-11-24). 뷰티박스 Supabase(SEMO)의 pg_cron이 5분마다 KOSKOS 서버를 확인하고,
// 상태가 바뀌면 이 주소를 부른다: /api/koskos-watch?event=down|up|bot_down|bot_up
// 키 없이 열려 있으므로 '그 사건이 진짜인지'를 SEMO의 koskos_watch_state 표(누구나 읽기, 쓰기는 cron만)와
// KOSKOS 건강 확인 주소로 다시 확인한 뒤에만, 정해진 문구를 텔레그램으로 보낸다(호출자가 넣은 글자는 안 씀).
// 환경변수(Vercel): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const HEALTH = 'https://app-api.semo-box.com/functions/v1/health';
function send(res, code, text) { res.statusCode = code; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(text); }
async function health() {
  try {
    const r = await fetch(HEALTH, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    return { ok: r.status === 200 && j.ok === true, bot: typeof j.bot_age_s === 'number' ? j.bot_age_s : null };
  } catch (_) { return { ok: false, bot: null }; }
}
module.exports = async (req, res) => {
  const ev = new URL(req.url, 'https://x').searchParams.get('event') || '';
  if (!['down', 'up', 'bot_down', 'bot_up'].includes(ev)) { send(res, 400, 'bad event'); return; }
  const base = process.env.VITE_SUPABASE_URL, anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !anon) { send(res, 500, 'no semo env'); return; }
  const sr = await fetch(`${base}/rest/v1/koskos_watch_state?id=eq.1&select=*`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
  const st = (await sr.json().catch(() => []))[0];
  if (!st) { send(res, 502, 'no state'); return; }
  const fresh = (t) => t && Date.now() - new Date(t).getTime() < 10 * 60 * 1000;
  let text = null;
  if (ev === 'down' && st.status === 'down' && fresh(st.last_change)) {
    const h = await health();
    if (!h.ok) text = '🔴 KOSKOS 서버 응답 없음 — 바깥 점검 2회 연속 실패(앱 사용 불가 가능). 오라클 알람·컨테이너 확인';
  } else if (ev === 'up' && st.status === 'up' && fresh(st.last_change)) {
    const h = await health();
    if (h.ok) text = '🟢 KOSKOS 서버 복구 — 바깥 점검 정상';
  } else if (ev === 'bot_down' && st.bot_status === 'down' && fresh(st.bot_last_change)) {
    const h = await health();
    if (h.ok && h.bot !== null && h.bot > 900) text = `🤖 관리자 봇 멈춤 — 마지막 신호 ${Math.round(h.bot / 60)}분 전(서버는 정상). sudo systemctl status deepkor-admin-bot`;
  } else if (ev === 'bot_up' && st.bot_status === 'up' && fresh(st.bot_last_change)) {
    text = '🤖 관리자 봇 다시 동작';
  }
  if (!text) { send(res, 200, 'not confirmed'); return; }
  const t = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  send(res, t.ok ? 200 : 502, t.ok ? 'sent' : 'telegram failed');
};
