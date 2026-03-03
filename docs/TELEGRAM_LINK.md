# Telegram 봇 ↔ 웹 프로필 연동

봇에서 테스트를 마친 유저가 웹에 로그인했을 때 같은 포인트를 쓰려면, 봇이 **연동 완료** 요청을 보내면 됩니다.

---

## 1. 흐름

1. 유저가 웹 프로필에서 **「Связать с Telegram」** 클릭 → `link_tokens` 테이블에 토큰(15분 유효) 생성.
2. 유저가 표시된 링크로 Telegram 접속 → 봇이 `start` 파라미터로 `link_<uuid>` 수신.
3. **봇**이 Supabase RPC **`link_telegram`** 호출: `(p_token = uuid, p_telegram_id = 유저 telegram id)`.
4. DB에서 해당 토큰의 웹 유저를 찾고, `profiles.telegram_id` 설정 + `telegram_users.points`와 웹 포인트 중 큰 값으로 병합.

---

## 2. 봇에서 호출할 API

**Supabase RPC:** `link_telegram(p_token uuid, p_telegram_id text)`

- **p_token:** 링크에 들어 있는 UUID. 예: `start=link_a1b2c3d4-...` → `a1b2c3d4-...` 만 넘기면 됨.
- **p_telegram_id:** 해당 유저의 Telegram user id (문자열로 전달 권장).

호출 예 (봇 서버/서비스에서 Supabase 클라이언트 사용 시):

```js
const { data, error } = await supabase.rpc('link_telegram', {
  p_token: 'a1b2c3d4-e5f6-...',  // link_ 제거한 UUID
  p_telegram_id: '123456789',    // message.from.id
});
// data: { ok: true } 또는 { ok: false, error: 'invalid_or_expired_token' }
```

- 봇은 **service_role key**로 Supabase에 접속해 이 RPC를 호출하는 것을 권장합니다 (anon으로는 `telegram_users` 등 제한이 있을 수 있음).

---

## 3. 봇이 해 둘 일

- 유저가 `start link_<uuid>` 로 봇에 들어오면:
  - `uuid`와 현재 유저의 `telegram_id`(예: `message.from.id`)를 받아서
  - 위처럼 `link_telegram(p_token, p_telegram_id)` 한 번 호출.
- 봇에서 테스트 완료 시 **`telegram_users`** 테이블에 저장:
  - `telegram_id` (PK), `points`, `skin_type`, `completed_at` 등.
  - 웹에서 연동 시 이 테이블의 `points`와 웹 프로필 포인트 중 큰 값이 적용됩니다.

---

## 4. DB 요약

| 테이블 / 컬럼 | 용도 |
|----------------|------|
| `profiles.telegram_id` | 웹 계정에 연결된 Telegram user id (연동 후 채워짐) |
| `telegram_users` | 봇 전용: 봇에서 테스트 완료한 유저의 포인트 등 |
| `link_tokens` | 웹에서 발급한 일회용 토큰 (봇이 연동 시 사용) |
| RPC `link_telegram(p_token, p_telegram_id)` | 토큰 + telegram_id 로 연동 처리 및 포인트 병합 |
