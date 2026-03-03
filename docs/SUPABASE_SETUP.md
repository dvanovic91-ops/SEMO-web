# Supabase 연동 — 지금까지 한 것 & 앞으로 할 것

## 1. 당신이 이미 한 것

- [x] Supabase 가입
- [x] 프로젝트 생성
- [x] **Project URL** 확인: `https://jdddyczgycxeclwchjin.supabase.co`
- [x] **Publishable key** (anon key) 확인

---

## 2. 당신이 지금 할 일 (한 번만)

### 2-1. `.env` 파일에 Supabase 값 넣기

프로젝트 **루트**에 `.env` 파일이 없으면 만들고, 아래 두 줄을 **추가**하세요.  
(이미 있으면 기존 내용 아래에 붙여 넣으면 됩니다.)

```env
# Supabase
VITE_SUPABASE_URL=https://jdddyczgycxeclwchjin.supabase.co
VITE_SUPABASE_ANON_KEY=여기에_대시보드에서_복사한_publishable_key_붙여넣기
```

- **Publishable key**는 Supabase 대시보드 → **Project Settings** (왼쪽 하단 톱니바퀴) → **API** → **Project API keys** 에서  
  **`anon` `public`** 으로 적힌 키를 복사해서 넣으면 됩니다.  
  (이미 받은 `sb_publishable_...` 값을 그대로 넣어도 됩니다.)

⚠️ **주의:** `.env`는 Git에 올리지 마세요. 이미 `.gitignore`에 있을 가능성이 높습니다.

### 2-2. 개발 서버 한 번 재시작

`.env`를 수정했으면 터미널에서:

```bash
npm run dev
```

를 다시 실행해 주세요. 그래야 새 환경 변수가 적용됩니다.

---

## 3. 내가 이미 해 둔 것

- **Supabase 클라이언트 패키지** 추가: `@supabase/supabase-js`
- **연결 코드** 추가: `src/lib/supabase.ts`  
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 읽어서 Supabase 클라이언트를 만듭니다.
- **`.env.example`** 에 Supabase 항목 추가  
  - 다른 사람이 클론했을 때 어떤 값을 채워야 하는지 보여주는 용도입니다.
- **이 문서** 작성: `docs/SUPABASE_SETUP.md`

이제 프론트 코드 어디서든 `import { supabase } from '@/lib/supabase'` (또는 상대 경로) 로 가져다 쓰면 됩니다.

---

## 4. 테이블 생성 (한 번만)

Supabase 대시보드 → **SQL Editor** → New query →  
`docs/SUPABASE_SCHEMA.sql` 파일 내용 전체 복사해서 붙여넣기 → **Run** 실행.

이렇게 하면 `profiles`, `shipping_addresses`, `orders` 테이블과 RLS, Auth 가입 시 프로필 자동 생성 트리거가 적용됩니다.

---

## 5. 앞으로 할 것 (순서대로)

| 단계 | 할 일 | 누가 |
|------|--------|------|
| 1 | `.env`에 URL·anon key 넣고 `npm run dev` 재시작 | **당신** |
| 2 | **테이블 생성:** 위 "4. 테이블 생성" 대로 `SUPABASE_SCHEMA.sql` 실행 | **당신** (대시보드에서 한 번) |
| 3 | **Supabase Auth** 로그인 폼 연동 (이메일/비밀번호 또는 OAuth) | 필요 시 코드 추가 |
| 4 | **배송 정보·프로필** 화면에서 Supabase 테이블 읽기/쓰기 연동 | 필요 시 코드 추가 |
| 5 | (선택) Support 폼 → **Resend** 등 이메일 발송 | 나중에 |

지금은 **1·2번**까지 하면 DB·Auth 준비는 끝난 상태입니다.

---

## 6. 참고

- **anon key**는 프론트에 노출돼도 됩니다. 보안은 **Row Level Security (RLS)** 로 테이블마다 “누가 어떤 행을 볼 수 있는지” 제한하는 방식으로 맞춥니다.
- **service_role key**는 절대 프론트나 공개 저장소에 넣지 마세요. 백엔드/Edge Function에서만 쓰는 용도입니다.
