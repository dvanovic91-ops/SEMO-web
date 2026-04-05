# Supabase 인증 메일 → Resend (SMTP) 연결

가입 확인·재발송(`auth.resend`)·매직 링크는 **전부 Supabase Auth**가 보냅니다.  
Resend는 **웹 코드에 키를 넣는 것**이 아니라, **Supabase 프로젝트 설정에 SMTP만 넣으면** 같은 메일이 Resend 경로로 나갑니다.

이미 있는 코드:

- `Register.tsx` — `signUp` + `emailRedirectTo`
- `src/lib/authSignupResend.ts` — `supabase.auth.resend({ type: 'signup', ... })` (프로필·체크아웃에서 재발송)

→ **추가로 “메일 보내는” TypeScript를 짤 필요 없음.** 아래 대시보드만 맞추면 됩니다.

---

## 1. Resend에서 값 확인

[Resend → SMTP](https://resend.com/settings/smtp) 또는 문서 기준:

| 항목 | 값 |
|------|-----|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — 안 되면 `587` + STARTTLS 시도 |
| Username | `resend` |
| Password | Resend **API Key** (`re_...`) |

발신 주소는 **인증해 둔 도메인** 기준으로 씁니다.  
예: 도메인 `semo-box.com`을 Verifying 했다면 `noreply@semo-box.com` 같은 주소.

---

## 2. Supabase에 SMTP 넣기

1. [Supabase Dashboard](https://supabase.com/dashboard) → 본인 **프로젝트**
2. **Project Settings**(톱니) → **Authentication**  
   또는 왼쪽 **Authentication** → 하위에서 **SMTP** / 이메일 관련 메뉴 (UI 버전에 따라 이름이 조금 다를 수 있음)
3. **Enable custom SMTP** 켜기
4. 위 Resend 값 입력:
   - **Host** `smtp.resend.com`
   - **Port** `465`
   - **Username** `resend`
   - **Password** API Key
5. **Sender email** / **Sender name**  
   - Resend에 등록·검증된 도메인의 주소만 사용 (미검증이면 발송 실패)
6. **Save**

저장 후부터는 Supabase가 보내는 인증 메일이 Resend를 통해 나갑니다.

---

## 3. 꼭 같이 확인할 것

1. **Authentication → Email Templates**  
   - Resend를 써도 **본문 HTML은 Supabase에 저장된 템플릿**이 그대로 사용됩니다.  
   - 가입 확인 메일은 **Confirm signup** 탭 내용이 나갑니다. (레포: `supabase/email_templates/confirm_signup_link_bilingual.html` — 수정 후 **대시보드에 다시 붙여넣고 Save** 해야 반영됩니다.)  
   - `{{ .ConfirmationURL }}` 은 **일회용 매직 링크(URL)** 입니다. 숫자 OTP와는 다른 방식이라, 메일에 “버튼 + 링크” 형태가 정상입니다.

2. **Authentication → Providers → Email**  
   - **Confirm email** 이 켜져 있어야 “가입 확인 링크” 메일이 나갑니다.

3. **Authentication → URL Configuration**  
   - **Redirect URLs**에 실제 사이트가 허용돼 있어야 합니다.  
   - 코드에서 쓰는 `emailRedirectTo`(예: `.../profile`)가 이 목록과 맞아야 합니다.  
   - 자세한 건 `SUPABASE_AUTH_URL_CONFIGURATION.md`

---

## 4. 테스트 순서

1. SMTP 저장 후 Supabase에서 **Send test email** 같은 버튼이 있으면 먼저 테스트
2. 사이트에서 **새 이메일로 회원가입** → 수신함·스팸함 확인
3. 안 오면 **Supabase → Logs → Auth** 에서 오류 메시지 확인

---

## 참고

- Resend 공식: [Send emails using Supabase with SMTP](https://resend.com/docs/send-with-supabase-smtp)
- 프론트 `.env`의 `VITE_*` 변수는 **인증 SMTP와 무관**합니다. Resend API 키는 Supabase 콘솔에만 넣으면 됩니다.
