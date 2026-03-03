# Supabase 연동 — 큰 구조만

```
[React 웹]
    │
    ├─ 로그인/회원가입  →  Supabase Auth  →  (자동) auth.users
    │
    ├─ 프로필/배송/주문  →  supabase.from('...')  →  우리가 만든 테이블
    │                         (RLS로 본인만 접근)
    │
    └─ Support 메일     →  나중에 Resend 등 별도 (Supabase 아님)
```

**흐름:**  
1. Supabase에 테이블 만들기 (profiles, shipping, orders 등)  
2. Auth 켜서 로그인 → 세션 생기면 `auth.users`와 연동된 `profiles` 등 읽기/쓰기  
3. 프론트는 `supabase.auth` + `supabase.from()` 만 쓰면 됨. 디테일은 코드에서 처리.

**테이블:** `docs/SUPABASE_SCHEMA.sql` 내용을 Supabase 대시보드 → **SQL Editor**에서 한 번 실행하면 `profiles`, `shipping_addresses`, `orders` 생성 + RLS 적용됨.
