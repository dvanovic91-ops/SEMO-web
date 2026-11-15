// Deepkor 운영 서버(오라클) 알람 → 텔레그램 관리자 봇 중계 (2026-11-15).
// 오라클 서버가 멈춰도 알림이 오도록 오라클 밖(Vercel)에서 돈다.
// 오라클 Notifications 'HTTPS(사용자 정의 URL)' 구독이 이 주소로 POST 한다:
//   https://www.semo-box.com/api/oracle-alert?key=<ORACLE_ALERT_KEY>
// 환경변수(Vercel): ORACLE_ALERT_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// Vercel 기본 도우미(req.body 자동 해석)는 오라클 콘솔 게시물(JSON 머리표+일반 글자 본문)을 함수 실행 전에 400으로 막는다
// → 프로젝트 환경변수 NODEJS_HELPERS=0 으로 끄고, 순수 Node 방식(req.url·res.statusCode·res.end)으로 쓴다.
function send(res, code, text) { res.statusCode = code; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(text); }
module.exports = async (req, res) => {
  const key = new URL(req.url, 'https://x').searchParams.get('key') || '';
  if (!process.env.ORACLE_ALERT_KEY || key !== process.env.ORACLE_ALERT_KEY) {
    send(res, 403, 'forbidden');
    return;
  }
  // 1) 구독 확인 요청: 오라클이 확인 주소를 헤더(또는 본문)로 보낸다 → 그 주소를 열면 구독 승인
  const confirmUrl = req.headers['x-oci-ns-confirmationurl'];
  // 본문은 직접 읽는다: 오라클 콘솔 '메시지 게시'는 Content-Type이 JSON인데 본문이 일반 글자라,
  // Vercel 기본 해석(req.body)을 건드리면 함수 실행 전에 400으로 끝난다(2026-11-15 실제 발생).
  const raw = await new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => resolve(d));
    req.on('error', () => resolve(d));
  });
  let body = raw;
  try { body = JSON.parse(raw); } catch (_) { /* 일반 글자 그대로 */ }
  const confirm = confirmUrl || (body && typeof body === 'object' && body.ConfirmationURL);
  console.log('oracle-alert', JSON.stringify({ headers: Object.keys(req.headers).filter((h) => h.startsWith('x-oci')), bodyType: typeof body, confirmHost: confirm ? String(confirm).split('/')[2] : null }));
  if (confirm && /^https:\/\/[a-z0-9.-]+\.oraclecloud\.com\//i.test(confirm)) {
    const r = await fetch(confirm);
    send(res, r.ok ? 200 : 502, r.ok ? 'confirmed' : 'confirm failed');
    return;
  }
  // 2) 알람 메시지 → 텔레그램
  let text;
  if (body && typeof body === 'object') {
    const state = ({ OK_TO_FIRING: '🔴 발생', FIRING_TO_OK: '🟢 해결', REPEAT: '🔁 계속' })[body.type] || body.type || '';
    text = [state, body.title, body.body].filter(Boolean).join('\n');
  } else {
    text = String(body || '(내용 없음)');
  }
  const t = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000) }),
  });
  send(res, t.ok ? 200 : 502, t.ok ? 'sent' : 'telegram failed');
};
