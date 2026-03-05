# 안 되면 먼저 확인할 것

## 1. Supabase 키 형식

`.env`의 `VITE_SUPABASE_ANON_KEY`는 **Supabase 대시보드 → Settings → API → Project API keys → anon public** 에서 복사한 값이어야 합니다.

- 올바른 형식: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....` 처럼 **eyJ** 로 시작하는 긴 문자열
- `sb_publishable_...` 처럼 짧은 값은 다른 서비스용 키이거나 예시일 수 있음 → **400/401** 나올 수 있음

키가 잘못됐으면 Supabase 대시보드에서 anon public 키를 다시 복사해 `.env`에 넣고, 앱 다시 빌드/실행하세요.

---

## 2. DB 스키마

Supabase SQL Editor에서 아래 순서로 실행했는지 확인하세요.

1. `docs/SUPABASE_FULL_SCHEMA.sql` 전체 실행
2. `docs/SUPABASE_SCHEMA_DASHBOARD_PRODUCT_REVIEWS.sql` 전체 실행

실행 안 했으면 `products`, `main_layout_slots`, `profiles` 등 테이블/컬럼이 없어서 **400** 이 날 수 있습니다.

---

## 3. 콘솔로 어디서 터지는지 보기

브라우저 개발자도구(F12) → Console 탭에서:

- `[Shop] main_layout_slots: ...` / `[Shop] products: ...` → Shop(뷰티박스) 쪽 에러
- `Ошибка: ...` → 상품 상세 로드 실패 메시지

Network 탭에서 빨간 줄(실패한 요청) 클릭 → Response 에서 Supabase가 준 에러 메시지 확인.

---

## 4. 로컬에서 다시 빌드

환경 변수 바꾼 뒤에는 **반드시 다시 빌드**해야 합니다.

```bash
npm run build
# 또는
npm run dev
```
