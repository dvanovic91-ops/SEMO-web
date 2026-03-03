# 구글 / 얀덱스 OAuth 연동 — 필요한 것

## 지금 필요한 것만 (체크리스트)

| 구분 | 할 일 |
|------|--------|
| **프론트** | 프로젝트 루트에 `.env` 만들고 아래 4개 변수 채우기 |
| **Google** | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 클라이언트 ID 생성 → Redirect URI에 **백엔드** callback URL 등록 |
| **Yandex** | [Yandex OAuth](https://oauth.yandex.ru/) → 앱 등록 → Callback URI에 **백엔드** callback URL 등록 |
| **백엔드** | ① callback URL에서 `code` 받아 토큰 교환·프로필 조회 ② 신규 사용자 + 배송 미입력 시 `https://웹사이트/register/shipping` 으로 리다이렉트 ③ 배송 정보 저장 API (예: `POST /me/shipping`) |

---

## 프론트엔드 (이미 구성됨)

- 로그인 페이지에서 구글·얀덱스 버튼 클릭 시 각 OAuth 인증 URL로 이동
- 환경 변수(`.env`)에 아래 4개 값만 넣으면 리다이렉트 동작

| 변수 | 설명 |
|------|------|
| `VITE_GOOGLE_CLIENT_ID` | Google Cloud Console에서 발급한 OAuth 2.0 클라이언트 ID |
| `VITE_GOOGLE_REDIRECT_URI` | 구글 인증 후 코드를 받을 **백엔드** callback URL |
| `VITE_YANDEX_CLIENT_ID` | Yandex OAuth 앱 ID |
| `VITE_YANDEX_REDIRECT_URI` | 얀덱스 인증 후 코드를 받을 **백엔드** callback URL |

## 백엔드에서 필요한 것

1. **Callback URL**
   - 구글: `https://api.도메인/auth/google/callback` (또는 사용 중인 API 도메인)
   - 얀덱스: `https://api.도메인/auth/yandex/callback`
   - 위 URL을 각 개발자 콘솔(OAuth 앱 설정)에 **Redirect URI**로 등록

2. **Callback 처리**
   - `GET .../auth/google/callback?code=xxx` (또는 yandex) 수신
   - `code`로 액세스 토큰 교환 → 이메일/이름 등 프로필 조회
   - DB에 사용자 없으면 **신규 가입** 처리 후, **배송 정보 미입력**이면  
     프론트 주소 `https://웹사이트/register/shipping` 으로 리다이렉트  
   - 이미 가입된 사용자거나 배송 정보가 있으면 메인(또는 마이페이지)으로 리다이렉트
   - 세션/쿠키 또는 JWT 발급해 로그인 유지

3. **배송 정보 저장 API**
   - `/register/shipping` 페이지에서 폼 제출 시 호출할 API (예: `POST /me/shipping`)
   - 인증된 사용자의 주소·우편번호·ИНН·여권번호 저장

## 요약

- **프론트:** `.env` 4개 값 설정 → 구글/얀덱스 버튼이 해당 OAuth로 이동
- **백엔드:** callback URL 제공, code → 토큰 → 프로필 조회, 신규 사용자면 `/register/shipping`으로 리다이렉트, 배송 정보 저장 API 제공
