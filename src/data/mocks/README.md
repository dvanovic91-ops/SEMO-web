# 목업(Mock) 데이터 — 일괄 제거 가이드

이 폴더는 **실제 API 연동 전** UI/UX 확인용 목업을 한곳에서 관리합니다.  
나중에 “목업 전부 지워줘” 요청 시 아래 순서로 제거하면 됩니다.

## 사용처 목록

| 구분 | 파일 | 사용 내용 |
|------|------|-----------|
| 대시보드 | `src/pages/admin/Admin.tsx` | 매출 꺾은선 그래프(일/주/월/기간), 상품별 매출 표 |
| 프로필 | `src/pages/profile/ProfileReviews.tsx` | 내 리뷰 목록 |
| 프로필 | `src/pages/profile/ProfileOrders.tsx` | 주문 내역·배송 추적 |
| 프로필 | `src/pages/profile/ProfileTestResults.tsx` | 테스트 결과 목록 — **실제 DB 사용 (목업 제거됨)** |

- 위 파일들에서 `src/data/mocks` import 및 `USE_MOCK_*` 조건부 로직 제거 후, Supabase(또는 실제 백엔드) API로 교체하면 됩니다.
- **추가 목업**을 넣을 때는 반드시 `index.ts`에 데이터/플래그를 두고, 이 표에 사용처를 한 줄 추가해 두세요.

## 일괄 제거 절차

1. **각 사용처 수정**
   - `USE_MOCK_*` 분기 제거
   - 목업 배열 대신 API 호출 결과 사용 (빈 배열 초기값 후 `useEffect` 등으로 채우기)
2. **이 폴더 삭제**
   - `src/data/mocks/index.ts`
   - `src/data/mocks/README.md` (본 문서)
3. **import 정리**
   - 삭제된 `@/data/mocks` 또는 `../../data/mocks` import 제거 후 실제 타입/API만 사용

이렇게 하면 한 번에 목업을 제거할 수 있습니다.
