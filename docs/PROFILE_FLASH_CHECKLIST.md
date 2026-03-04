# 개인정보(Profile) 화면 — 다른 사람 정보 잠깐 노출 현상 체크리스트

## 원인 후보 및 적용한 수정

| # | 항목 | 설명 | 조치 |
|---|------|------|------|
| 1 | **응답 race** | 다른 사용자로 전환하거나 뒤로가기 직후 이전 요청이 늦게 도착해 `setDbProfile`에 이전 사용자 데이터가 들어감 | `refreshProfile`에서 `requestedUserId`와 `currentUserIdRef.current` 비교 후 일치할 때만 `setDbProfile` 호출 |
| 2 | **마운트 시 이전 데이터** | Profile 재진입 시 이전 마운트의 state가 남아 있다고 오인할 수 있음 (React는 마운트 시 state 초기값으로 리셋됨) | 진입 시 `useEffect`에서 `setDbProfile(null)` 후 `refreshProfile()` 호출해, fetch 완료 전에는 `dbProfile`이 null이고 `profile = dbProfile ?? localProfile`만 표시 |
| 3 | **localProfile 혼동** | `getProfile(userEmail)`이 이메일별로 저장되므로, 동일 기기에서 여러 계정 사용 시 userEmail이 바뀌기 전 로컬 데이터가 잠깐 보일 수 있음 | AuthContext에서 로그인 시 `userEmail`/`userId`가 동시에 갱신되므로, Profile은 항상 현재 `userEmail`로 localProfile을 조회. 로그아웃 후 다른 계정 로그인 시 새 userEmail로만 표시됨 |
| 4 | **캐시/지연** | Supabase 또는 브라우저 캐시로 이전 사용자 프로필이 반환될 가능성 | RLS로 `auth.uid() = id`만 조회 가능. 같은 세션에서는 다른 사용자 행이 반환되지 않음 |

## 검토 시 확인할 것

- [ ] Profile 페이지 진입 시 `userId`가 null이 아닌지 (Auth 초기화 후만 진입하도록)
- [ ] `refreshProfile` 의존성에 `userId`만 두고, 응답 처리 시 `currentUserIdRef.current === requestedUserId` 체크하는지
- [ ] Profile 마운트 시 `setDbProfile(null)` 후 fetch 해서, 이전 사용자 데이터가 한 프레임이라도 안 나오는지
- [ ] Admin·다른 페이지에서 Profile로 돌아올 때 `visibilitychange` 또는 마운트 시 `refreshProfile`이 한 번 더 호출되는지

## 참고 파일

- `src/pages/Profile.tsx`: `refreshProfile`, `currentUserIdRef`, `useEffect(..., [refreshProfile])`
