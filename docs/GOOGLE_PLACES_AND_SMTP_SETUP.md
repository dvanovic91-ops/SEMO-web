# Google Places 주소 검색 · 인증 메일(SMTP) 설정 가이드

## 1. 주소 자동완성 구조 (코드 기준)

| 배송국 `country` | 환경 변수 | 동작 |
|------------------|-----------|------|
| **`RU`** | `VITE_DADATA_API_KEY` 있음 | **DaData**만 사용 (러시아 FIAS 기반) |
| **`RU`** | 빌드에 `VITE_DADATA_API_KEY`가 안 들어온 경우 | **수동 입력** (RU는 Google로 대체하지 않음) |
| **RU가 아님** (`KZ`, `UZ`, `AE` 등) | `VITE_GOOGLE_MAPS_API_KEY` 있음 | **Google Places Autocomplete**만 사용 (`componentRestrictions` = 해당 국가) |
| **RU가 아님** | 빌드에 `VITE_GOOGLE_MAPS_API_KEY`가 안 들어온 경우 | **수동 입력** |

- 회원가입·프로필·체크아웃 모두 `resolveAddressSuggestMode` + `getAddressSuggestUiCopy`로 동일 규칙입니다.

### Google Cloud에서 할 일 (순서)

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성 또는 선택.
2. **결제 계정** 연결 (Maps 플랫폼은 무료 크레딧 후 사용량 과금).
3. **API 및 서비스 → 라이브러리**에서 다음을 **사용 설정**:
   - **Maps JavaScript API**
   - (자동완성에 쓰이는) **Places API** — 콘솔에서 “Places API” 관련 항목이 여러 개면, Maps JavaScript의 Autocomplete 문서에 안내된 항목을 켭니다.
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키**:
   - **애플리케이션 제한**: `HTTP 리퍼러(웹사이트)`  
     - 로컬: `http://localhost:5173/*`  
     - 프로덕션: `https://your-domain.com/*`
   - **API 제한**: 위에서 켠 API만 허용하도록 제한 권장.
5. 생성한 키를 프론트 `.env`에 넣기:  
   `VITE_GOOGLE_MAPS_API_KEY=...`
6. `npm run build` 후 배포 도메인이 리퍼러 제한과 일치하는지 확인.

### 과금 개요 (Google)

- 정책·단가는 [Google Maps Platform 요금표](https://developers.google.com/maps/billing-and-pricing/pricing)를 기준으로 하며, **월 무료 크레딧**(달러 상당)이 있어 소규모 트래픽은 크레딧 안에서 끝나는 경우가 많습니다.
- Autocomplete는 **세션 단위 과금** 모델이 있어, 사용자가 한 번 고르고 끝나는 흐름이 유리합니다. 정확한 단가는 위 공식 페이지의 “Places”, “Autocomplete” 항목을 확인하세요.

### DaData

- [dadata.ru](https://dadata.ru/)에서 API 키 발급 후 `VITE_DADATA_API_KEY` 설정.  
- 러시아 주소에 특화되어 있으며, 본 프로젝트에서는 **RU일 때만** 호출합니다.

---

## 2. 인증(가입 확인) 메일 — 어디서 무엇을 하나요?

인증 메일은 **Supabase Auth**가 보냅니다. “별도 이메일 전용 사이트”가 아니라 **SMTP를 Supabase에 연결**하거나 **Supabase 기본 발송**을 씁니다.

### Supabase 대시보드

1. **Authentication → Providers → Email**  
   - **Confirm email** 이 켜져 있어야 확인 링크 메일이 발송되는 경우가 많습니다.
2. **Authentication → URL Configuration**  
   - `signUp`에 넣은 `emailRedirectTo`(예: `https://도메인/profile`)가 **Redirect URLs** 허용 목록에 있어야 합니다.
3. **Project Settings → Authentication → SMTP** (권장)  
   - **Custom SMTP**에 아래 같은 서비스의 SMTP 호스트·포트·유저·비밀번호를 넣습니다.  
   - 발신 도메인에 **SPF / DKIM**을 맞추면 스팸 분류가 줄어듭니다.

### 자주 쓰는 트랜잭션 메일 서비스 (대략적인 요금 감)

| 서비스 | 무료/저가 구간 (참고) | 비고 |
|--------|------------------------|------|
| **Resend** | 무료: 월 약 3,000통(일 100통 등 정책은 공식 사이트 확인) / 유료 플랜 월 $20~ | SMTP 또는 API, 개발자 친화적 |
| **SendGrid** | 무료 체험·소량 플랜 있음(변동) | SMTP 연결 문서 많음 |
| **Amazon SES** | 매우 저렴한 건당 과금(리전별) | AWS 세팅 필요 |
| **Mailgun** | 무료/유료 티어(변동) | 도메인 인증 필요 |

정확한 금액·한도는 각 서비스 **공식 Pricing 페이지**를 봐야 합니다. (위 숫자는 요약용이며 변경될 수 있습니다.)

### Supabase 기본 발송만 쓸 때

- 별도 SMTP 없이도 테스트·소량은 가능하지만, **스팸함으로 가기 쉽고** 한도가 있습니다.  
- 운영 단계에서는 **Custom SMTP + 자체 도메인**을 권장합니다.

더 자세한 점검 목록은 `SUPABASE_AUTH_URL_CONFIGURATION.md`의 **「가입 확인 메일이 전혀 오지 않을 때」** 절을 참고하세요.
