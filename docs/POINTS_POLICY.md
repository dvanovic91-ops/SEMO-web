# 포인트 정책

## 이벤트별 포인트

| 이벤트 | 포인트 | 비고 |
|--------|--------|------|
| 테스트 완료 후 가입 | 300p | `skin_test_results` INSERT 시 1회 지급 |
| 텔레그램 연동 | 200p | 연동 해제 후 재연동 시 중복 지급 불가 (`telegram_reward_given`) |
| 친구 추천 가입 | 200p | 추천받은 사람이 가입 완료 시 **추천인**에게 지급, 계정별 1회 (`referral_rewards`) |
| 리뷰 작성 | 300p | **구매 확정**된 주문에 대해 작성 시 1회, 주문당 1회 (`review_rewards`) |

- 구매 확정: `orders.status = 'confirmed'` 인 주문.
- 추천: 가입 시 `?ref=CODE` 등으로 추천인 코드 전달 → 가입 완료 후 `set_referral(code)` RPC 호출 시 추천인에게 200p.

---

## 사용 규칙

- **1포인트 = 1루블** 액면가 할인.
- 모든 포인트는 **결제 시 현금처럼 차감** 가능.
- **주문 시 최대 1,000포인트만 사용 가능** (초과 분은 해당 주문에서 사용 불가).

구현 시 주문/결제 로직에서:
- 사용 포인트 `use_points` 를 `min(요청값, 보유 포인트, 1000)` 으로 상한 적용.
- 결제 금액 = `order_total_cents - use_points * 100` (포인트 1p = 1루블 = 100코펙 가정 시).

---

## DB·RPC 요약

- **테스트 300p:** `grant_points_on_test_complete` 트리거 (`skin_test_results` INSERT).
- **연동 200p:** `link_telegram` RPC 내부 (`telegram_reward_given` 이 false일 때만).
- **추천 200p:** `set_referral(p_code)` RPC (가입 후 프론트에서 호출).
- **리뷰 300p:** `grant_points_on_review` 트리거 (`reviews` INSERT, 해당 주문이 `confirmed`일 때만).

추천인 코드 발급: 가입된 유저에게 `referral_codes` 에 행이 없으면 생성 (예: `user_id` 기반 슬러그 또는 UUID). 프론트에서 "친구 초대 링크"에 `?ref=<code>` 붙여서 사용.
