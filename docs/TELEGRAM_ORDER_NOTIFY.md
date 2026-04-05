# 주문 → 텔레그램 알림 설정

주문이 생성되면 연동된 유저의 텔레그램으로 "Заказ оформлен!" 알림을 보내는 흐름입니다.

## 1. 구성 요소

- **Supabase Edge Function** `notify-order`: `user_id`(또는 Webhook의 `record`)로 `profiles.telegram_id`를 조회한 뒤, 유저 봇 토큰으로 해당 채팅에 메시지 전송.
- **호출 방식**
  - **Database Webhook**: `orders` INSERT 시 Supabase가 Edge로 POST. **HTTP 헤더** `x-notify-order-secret: <NOTIFY_ORDER_SECRET>` 를 Webhook 설정에서 넣어야 함 (또는 Supabase가 함수 호출 시 시크릿 주입 방식이면 그에 맞게 설정).
  - **앱(로그인 유저)**: `functions.invoke('notify-order', { body: { order_id } })` — 세션 JWT로 인증되며, **해당 주문의 `user_id`가 JWT 사용자와 일치할 때만** 발송 (타인에게 스팸 불가).

## 2. Edge Function 배포

```bash
# Supabase CLI 로그인 후
supabase functions deploy notify-order
```

**시크릿 설정 (Supabase 대시보드 → Edge Functions → notify-order → Secrets):**

- `NOTIFY_ORDER_SECRET`: Webhook·서버 전용 호출용 (타이밍 안전 비교). **절대 프론트 `.env`에 넣지 말 것.**
- `TELEGRAM_USER_BOT_TOKEN`: 유저 봇 토큰 (BotFather 발급).
- JWT 경로 검증용: `SUPABASE_ANON_KEY` (대시보드에 자동 주입되는 경우가 많음).  
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 배포 시 자동 주입됩니다.

## 3. Database Webhook 연결 (선택)

주문이 **DB에만** INSERT되고 앱에서 별도 호출을 안 할 때 사용합니다.

1. Supabase 대시보드 → **Database** → **Webhooks** → **Create a new hook**
2. **Table**: `orders`
3. **Events**: `Insert`
4. **Type**: `Supabase Edge Functions`
5. **Function**: `notify-order`
6. 저장

이렇게 하면 `orders`에 INSERT될 때마다 Edge Function이 호출되고, `record.user_id`로 프로필을 조회해 텔레그램 알림을 보냅니다.

## 4. 앱에서 주문 생성 시 호출

실제 주문 생성 로직에서 `orders`에 INSERT한 뒤, 같은 요청/화면에서 알림만 보내고 싶을 때:

```ts
import { notifyOrderCreated } from '../lib/orderNotify';

// 주문 INSERT 후
const { data: order } = await supabase.from('orders').insert({ user_id: userId, ... }).select('id').single();
if (order?.id) await notifyOrderCreated(order.id);
```

`notify-order`는 `order_id`만 받아도 되고, 내부에서 주문 행을 조회해 `user_id`를 쓸 수 있도록 나중에 확장 가능합니다. 현재는 `user_id`가 있으면 그걸로 프로필 조회 후 발송합니다.

## 5. 어드민 알림

어드민용 봇으로 "새 주문 들어옴" 알림을 보내려면:

- 동일 Edge Function에 `TELEGRAM_ADMIN_BOT_TOKEN`와 어드민 채팅 ID를 시크릿에 추가하고,
- `notify-order` 내부에서 유저 알림 보낸 뒤, 같은 payload로 어드민 봇으로도 `sendMessage` 호출하는 분기만 추가하면 됩니다.
