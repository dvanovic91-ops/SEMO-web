# 프로필·배송 데이터 — DB 단일 진실 원천 (Single Source of Truth)

## 저장 위치

| 데이터 | 테이블 | 비고 |
|--------|--------|------|
| 표시 이름, 전화, 등급 문자열, 포인트, Telegram, 이메일 인증 등 | `public.profiles` | `user_id` = `auth.users.id` |
| ФИО(라틴), 주소, 우편번호, INN, 여권, 배송용 전화 | `public.shipping_addresses` | `user_id`당 1행(`unique(user_id)`), `upsert`로 동기화 |

**브라우저에는 위 개인정보를 “주 저장소”로 두지 않습니다.**  
기기·브라우저가 바뀌어도 **로그인 후 Supabase에서만** 불러옵니다.
`Profile` 화면의 이름·포인트도 **localStorage/sessionStorage에 캐시하지 않으며**, `profiles` 조회 결과만 사용합니다. (Telegram 연동 여부 표시용 0/1 플래그만 `sessionStorage`에 허용 가능.)

## 레거시 `profileEdit*` 키

과거에 일부만 `profileEdit` / `profileEdit:${userId}` 등에만 있던 경우,  
`migrateLegacyProfileEditToSupabase`가 **한 번** 서버(`shipping_addresses`)로 이관한 뒤 해당 로컬 키를 정리합니다.  
(코드: `src/lib/profileDeliveryDb.ts`, `src/lib/profileEditStorage.ts`)

## 오프라인 예외

서버 저장이 **실패했을 때만** `semo_pending_shipping_v1:${userId}`에 임시 백업하고,  
연결이 복구되면 `flushPendingShippingBackup`으로 다시 `profiles` / `shipping_addresses`에 반영합니다.  
(`src/lib/profileDeliveryOffline.ts`)

## SQL

`shipping_addresses`에 **ФИО 컬럼**(`fio_last`, `fio_first`, `fio_middle`)이 없으면 upsert가 실패할 수 있습니다.

- 새 프로젝트: `docs/SUPABASE_FULL_SCHEMA.sql` 또는 `docs/SUPABASE_SCHEMA.sql` 전체 실행
- 기존 DB에만 추가: `docs/SUPABASE_SHIPPING_FIO_COLUMNS.sql` 단독 실행
