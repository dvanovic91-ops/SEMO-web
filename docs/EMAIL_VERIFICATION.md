# 이메일 인증 로직

## 비용

- **무료 구간:** SendGrid·Mailgun·Resend 등 대부분 **월 1만~3만 통 무료** 후 유료.
- **유료:** 트래픽 늘면 건당 소액(예: $0.0001~0.001) 또는 월 정액.
- 인증 메일만 쓸 경우 가입 수가 많지 않으면 **무료 한도로 충분**한 경우가 많음.

## 로직 흐름

1. **회원가입 시**
   - 이메일·비밀번호 등 저장 후 `email_verified: false` 로 사용자 생성.
   - **인증 토큰** 생성 (UUID 또는 암호학적 랜덤, 15분~24시간 만료).
   - DB에 `verification_token`, `token_expires_at` 저장.
   - **이메일 발송:** 링크 `https://사이트/verify-email?token=xxx` 또는 백엔드 `GET /auth/verify-email?token=xxx` 포함.

2. **사용자가 링크 클릭**
   - 프론트: ` /verify-email?token=xxx` 페이지에서 토큰 표시 후 백엔드 호출.
   - 백엔드: `GET /auth/verify-email?token=xxx` → 토큰 검사(유효·만료) → 해당 사용자 `email_verified: true` 로 갱신, 토큰 무효화 → 성공 시 로그인 페이지나 “인증 완료” 페이지로 리다이렉트.

3. **로그인 시**
   - `email_verified === false` 이면 “이메일 인증이 필요합니다. 메일함을 확인해 주세요.” 메시지 + 재발송 버튼(선택).

4. **재발송**
   - `POST /auth/resend-verification` (로그인된 사용자 또는 이메일만 입력) → 새 토큰 생성 후 동일하게 메일 발송. 빈도 제한(예: 1분에 1회) 권장.

## 백엔드에서 필요한 것

- 이메일 발송 서비스 연동 (SendGrid / Mailgun / Resend / SES 등).
- 인증 토큰 저장·조회·만료 처리.
- `GET /auth/verify-email?token=...` (또는 `POST` with body) 엔드포인트.
- (선택) 재발송·빈도 제한.

프론트는 “인증 메일을 보냈습니다” 문구와 ` /verify-email?token=...` 페이지(토큰 표시 후 API 호출)만 있으면 됨.
