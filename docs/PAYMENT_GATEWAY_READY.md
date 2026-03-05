# PG 연동 대비 구조 (확장성)

## 0. 주문 스냅샷 (가격 변경 영향 없음)

- 주문 시 **당시** 상품명·단가·수량을 `orders.items` / `orders.snapshot_items`·`snapshot_total_cents`에 그대로 저장합니다.
- 따라서 **관리자가 나중에 상품 가격을 바꿔도, 이미 넣어진 주문의 금액은 바뀌지 않습니다.**

---

## 0-2. 결제 vs DB 불일치 방지

- **순서:** ① 주문 insert (status `pending`) → ② 결제 승인(PG) → ③ 주문 update (`completed` + PG 거래 ID).
- **결제 실패:** ② 실패 시 주문은 그대로 `pending` 또는 `failed`로 두고, `payment_logs`에 기록. DB만 있고 결제는 안 나간 상태 → 재결제 플로우로 처리.
- **결제 성공했는데 ③ 실패:** ② 성공 후 ③ update가 실패하면 `payment_logs`에 `payment_success_order_update_failed`로 남기고, 사용자에게 "주문 내역 확인·문의" 안내. 장바구니는 비우고 완료 페이지로 보내서 주문 ID는 알 수 있게 하며, 관리자가 주문 상태를 수동으로 `completed`로 바꿀 수 있음.

---

## 1. 결제 로직 분리

- **주문 데이터 생성**  
  Checkout에서 주문 row를 `status: 'pending'`으로 한 번 insert한다.  
  배송 정보·스냅샷 등은 이 단계에서만 넣는다.

- **실제 결제 승인**  
  `src/lib/paymentGateway.ts`의 `executePayment()`가 담당한다.  
  - 현재: PG 미연동 → 항상 `{ success: true }` 반환  
  - PG 연동 시: 이 함수만 Stripe/로컬 PG API 호출로 교체하면 된다.  
  - 반환: 성공 시 `externalTransactionId`, `rawResponse` 포함 가능.

- **플로우**  
  1. 주문 insert (pending)  
  2. `executePayment({ orderId, totalCents })` 호출  
  3. 실패 시 주문을 `failed`로 update + `payment_logs` 기록  
  4. 성공 시 주문을 `completed`로 update + `external_transaction_id`, `raw_response` 저장 → 포인트 차감, 장바구니 비우기, 완료 페이지 이동  

PG 연동 시에는 **2번 구현만** 바꾸면 된다.

---

## 2. orders 테이블 (외부 ID·원문 저장)

| 컬럼 | 용도 |
|------|------|
| `external_transaction_id` | 결제사(PG) 거래 고유 번호 (Stripe payment_intent_id 등). PG 연동 시 여기 저장. |
| `raw_response` | PG사가 보내준 전체 응답 JSON (JSONB). 분쟁·영수증 확인용. |
| `payment_gateway_id` | 레거시. 가능하면 `external_transaction_id` 사용. |

추가·마이그레이션 스크립트: `docs/SUPABASE_CS_DEFENSE_LOGS.sql` 참고.

---

## 3. 주문 상태 (status) — PG 표준 + 배송

| 값 | 의미 |
|----|------|
| `pending` | 결제 대기 (주문만 생성된 상태) |
| `completed` | 결제 완료 (기존 `paid` 대체) |
| `failed` | 결제 실패 |
| `canceled` | 취소 (기존 `cancelled` → 미국식 표기) |
| `shipped` | 발송됨 |
| `delivered` | 배송 완료 |
| `confirmed` | 구매 확정 (리뷰/포인트 정책에서 사용) |

DB에 아직 `paid`, `cancelled`가 있어도 앱에서는 `normalizeOrderStatus()`로 `completed`, `canceled`로 읽어서 표시한다.  
신규 주문은 insert 시 `pending` → 결제 성공 시 `completed`로만 넣는다.

---

## 4. PG 연동 시 할 일 (체크리스트)

1. **`src/lib/paymentGateway.ts`**  
   - `executePayment()` 안에서 PG API 호출 (Stripe / 로컬 PG).  
   - 성공 시: `externalTransactionId`, `rawResponse` 반환.  
   - 실패 시: `{ success: false, errorCode, errorMessage }` 반환.

2. **Checkout**  
   - 이미 `executePayment` 결과로 주문을 `completed`/`failed`로 갱신하고,  
     `external_transaction_id`, `raw_response`를 저장하므로 수정 없음.

3. **매출/통계**  
   - 필요하면 대시보드 등에서 `status in ('completed','shipped','delivered','confirmed')` 인 주문만 매출로 집계.

4. **기존 데이터**  
   - `paid` → `completed`, `cancelled` → `canceled` 로 마이그레이션하려면  
     Supabase SQL로 한 번 `UPDATE orders SET status = 'completed' WHERE status = 'paid'` 등 실행.
