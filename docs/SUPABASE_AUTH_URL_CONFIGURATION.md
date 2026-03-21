# Supabase — Authentication → URL Configuration (한글 안내)

## 어디 있나요?

**Supabase 대시보드** → 본인 **프로젝트** → 왼쪽 **Authentication** → **URL Configuration**

(화면 제목: *Configure site URL and redirect URLs for authentication*)

---

## 무엇을 더 해야 하나요?

### 이미 프로덕션에 와일드카드가 있다면

예: Redirect URLs에 `https://semo-web-one.vercel.app/**` 가 있으면  
`/checkout`, `/checkout?ck=...` 등 **그 도메인 아래 모든 경로**가 허용됩니다.  
이 경우 **추가로 줄을 넣지 않아도** 매직 링크(주문 전 이메일 확인)는 동작합니다.

### 꼭 추가하면 좋은 경우

- **로컬 PC에서** `npm run dev` (예: `http://localhost:5173`) 로 테스트할 때  
  메일 링크가 `http://localhost:5173/checkout?...` 로 돌아오게 되므로, 아래 중 하나를 **Redirect URLs**에 넣으세요.

  - `http://localhost:5173/**`  
  - 또는 `http://localhost:5173/checkout`

지금은 `http://localhost:5173/auth/callback` 만 있으면 **OAuth 콜백만** 허용되고,  
**체크아웃 주소는 허용 목록에 없을 수 있습니다.**

### Site URL

- 실제 서비스 주소가 Vercel이면: `https://semo-web-one.vercel.app` 처럼 **메인 사이트 한 개**를 넣으면 됩니다.
- 로컬만 오래 쓸 때는 팀에 따라 `http://localhost:5173` 으로 바꾸기도 하지만, **필수는 아닙니다.**  
  중요한 것은 **Redirect URLs**에 돌아올 주소가 들어가 있는지입니다.

---

## 요약

| 상황 | 할 일 |
|------|--------|
| 배포 도메인만 사용 | `https://당신도메인/**` 있으면 **추가 작업 없음** |
| 로컬에서 체크아웃 메일 테스트 | `http://localhost:5173/**` 또는 `/checkout` 추가 |
| 새 도메인으로 이사 | Site URL 갱신 + Redirect URLs에 새 도메인 추가 |

자세한 SQL(이메일 확인 컬럼)은 `SUPABASE_CHECKOUT_EMAIL_VERIFICATION.sql` 을 참고하세요.  
**주문 INSERT는 Auth `email_confirmed_at` 기준**이면 `SUPABASE_ORDERS_RLS_AUTH_EMAIL_CONFIRMED.sql` 을 실행하세요.  
(구) 프로필 `email_verified_at` + RPC `confirm_checkout_email` 를 쓰는 경우에만 `SUPABASE_ORDER_EMAIL_VERIFICATION_RPC_AND_RLS.sql` 을 참고합니다.

---

## 이메일 발송(SMTP) — 별도 사이트가 꼭 필요한가요?

**필수는 아닙니다.** Supabase가 인증 메일·매직 링크를 **대신 보내 줍니다.**

| 방식 | 설명 |
|------|------|
| **기본(Supabase 내장)** | 무료/저용량 한도 내에서 Supabase 인프라로 발송. 별도 가입 없이 테스트·소규모 운영 가능. |
| **Custom SMTP** | 대시보드 **Project Settings → Authentication → SMTP Settings** 에서 SendGrid, Resend, Amazon SES, Mailgun 등 SMTP를 연결. 발신 도메인·스팸 정책을 직접 관리할 때 사용. |

즉, “이메일만 보내는 다른 웹사이트”를 끼워 넣을 필요는 없고, **SMTP 제공 서비스**를 Supabase에 연결하거나 **기본 발송**을 쓰면 됩니다.
