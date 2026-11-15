// Deepkor 운영 서버(오라클) 알람 → 텔레그램 관리자 봇 중계 (2026-11-15).
// 오라클 서버가 멈춰도 알림이 오도록 오라클 밖(Vercel)에서 돈다.
// 오라클 Notifications 'HTTPS(사용자 정의 URL)' 구독이 이 주소로 POST 한다:
//   https://www.semo-box.com/api/oracle-alert?key=<ORACLE_ALERT_KEY>
// 환경변수(Vercel): ORACLE_ALERT_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
module.exports = async (req, res) => {
  const key = (req.query && req.query.key) || '';
  if (!process.env.ORACLE_ALERT_KEY || key !== process.env.ORACLE_ALERT_KEY) {
    res.status(403).send('forbidden');
    return;
  }
  // 1) 구독 확인 요청: 오라클이 확인 주소를 헤더(또는 본문)로 보낸다 → 그 주소를 열면 구독 승인
  const confirmUrl = req.headers['x-oci-ns-confirmationurl'];
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { /* 그대로 */ } }
  const confirm = confirmUrl || (body && typeof body === 'object' && body.ConfirmationURL);
  console.log('oracle-alert', JSON.stringify({ headers: Object.keys(req.headers).filter((h) => h.startsWith('x-oci')), bodyType: typeof body, confirmHost: confirm ? String(confirm).split('/')[2] : null }));
  if (confirm && /^https:\/\/[a-z0-9.-]+\.oraclecloud\.com\//i.test(confirm)) {
    const r = await fetch(confirm);
    res.status(r.ok ? 200 : 502).send(r.ok ? 'confirmed' : 'confirm failed');
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
  res.status(t.ok ? 200 : 502).send(t.ok ? 'sent' : 'telegram failed');
};
