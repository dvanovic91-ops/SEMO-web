# 400 / React #310 오류 원인 분석 및 근본 대응

## 1. 어떤 기능이 문제에 영향을 줄 수 있었는지

과거에 추가·변경된 기능 중 400 / #310과 연관될 수 있는 것들:

| 기능 | 400 가능성 | #310 가능성 | 설명 |
|------|------------|-------------|------|
| **관리자 대시보드 (Admin)** | ✅ 높음 | ✅ 높음 | products, main_layout_slots, product_components, product_views, product_reviews 조회·저장. 스키마와 맞지 않는 select/order 시 400. 여러 useEffect + tab/selectedProduct 의존으로 리렌더·effect 반복 가능. |
| **상품 상세 + 리뷰 (ProductDetail)** | ✅ 높음 | ✅ 있음 | product_reviews에서 `profiles(name, email)` 조인. profiles에 email 없거나 조인 실패 시 400. id 변경 시 effect 재실행, setState 타이밍에 따라 루프 가능. |
| **Beauty Box 쇼핑 (Shop)** | ✅ 있음 | 낮음 | main_layout_slots, products 조회. 이미 order 제거·기본 스키마만 사용하도록 수정됨. |
| **AuthContext (로그인·관리자 여부)** | ✅ 높음 | ✅ 있음 | 매 페이지 로드 시 `profiles` select('is_admin'). DB에 is_admin 없으면 400. value 객체를 매 렌더 새로 만들어 구독 컴포넌트가 자주 리렌더될 수 있음. |
| **Navbar (텔레그램 연동 아이콘)** | ✅ 있음 | ✅ 있음 | `profiles` select('telegram_id'). telegram_id 컬럼 없으면 400. fetchTelegramLinked 의존 effect가 session 로드 후 다시 실행되며 연쇄 리렌더 가능. |
| **Profile 페이지** | ✅ 있음 | 있음 | `profiles` select(name, grade, points, telegram_id, telegram_reward_given). 일부 컬럼 없으면 400. refreshProfile 의존 effect. |
| **관리자 차트 (Recharts)** | 경고만 | - | 컨테이너 크기 0일 때 width/height -1 경고. 400/#310 직접 원인은 아님. |

정리하면, **400**은 주로  
- `profiles`의 is_admin / telegram_id / grade / telegram_reward_given 등 **선택 컬럼이 실제 DB에 없을 때**,  
- **product_reviews**에서 **profiles(name, email)** 조인 실패 시  
발생할 수 있고,  
**#310**은 **AuthContext value가 매 렌더 새로 만들어지면서** 구독 컴포넌트가 자주 리렌더되고, 그 과정에서 **useEffect 의존(함수/객체)** 이 바뀌어 effect가 반복 실행될 때 발생할 수 있습니다.

---

## 2. 가장 근본적인 해결 방향

### 2.1 400 방지 (근본)

- **DB와 코드를 일치시키기**  
  - `docs/SUPABASE_FULL_SCHEMA.sql` + `docs/SUPABASE_SCHEMA_DASHBOARD_PRODUCT_REVIEWS.sql`를 **순서대로** 적용해, profiles / products / product_reviews 등 필요한 컬럼이 모두 있는 상태로 유지하는 것이 가장 근본적입니다.
- **그래도 400이 나는 환경(스키마 불일치)을 대비한 방어 코드**  
  - **profiles**: 가능한 한 **최소 컬럼만** select (예: id만, 또는 id + name + points 등 확실히 있는 것만).  
    - is_admin, telegram_id 등은 alter로 추가된 컬럼이라, 예전 스키마에서는 없을 수 있음.  
  - **product_reviews**:  
    - 조인이 문제라면 **profiles(name, email) 제거** 후, 작성자 이름은 "Пользователь" 등 고정 문구로 표시.  
  - **AuthContext**  
    - 관리자 여부를 **DB가 아닌 환경변수**로만 쓰도록 할 수 있음:  
      `.env`에 `VITE_ADMIN_EMAILS=admin@example.com` (쉼표로 여러 개 가능) 설정 시 profiles select 없이 이 목록으로만 isAdmin 판단 → profiles 조회 400 제거.

### 2.2 React #310 방지 (근본)

- **Context value 참조 안정화**  
  - AuthContext에서 `value`를 **useMemo**로 감싸서, (userEmail, userId, initialized, isAdmin) 등이 바뀔 때만 새 객체가 나가게 하기.  
  - 그러면 “value가 매번 새로 만들어져서” effect 의존이 자꾸 바뀌는 상황을 줄일 수 있음.
- **useEffect 의존**  
  - 의존 배열에는 **원시값/안정된 참조**만 두고, **객체/함수**는 필요한 경우 useCallback/useMemo로 안정화.
- **setState 안정화**  
  - setState 전에 **이전 값과 같으면 호출하지 않기** (함수형 업데이트에서 `prev === next ? prev : next` 등).  
  - 불필요한 리렌더와 그에 따른 effect 재실행을 줄여 #310 가능성을 낮춤.

---

## 3. 근본 수정 시 망가질 수 있는 기능

| 수정 내용 | 영향 받는 기능 | 비고 |
|-----------|----------------|------|
| profiles select를 **id만** 사용 | 관리자 판별 불가 → **관리자 페이지 접근 불가** | REACT_APP_ADMIN_EMAILS로 보완 가능 |
| profiles select에서 **telegram_id 제거** | **Navbar 텔레그램 연동 아이콘** 항상 미연동 표시 | DB에 telegram_id 있으면 그대로 두는 편이 안전 |
| profiles select에서 **grade, telegram_reward_given 제거** | **Profile** 페이지에서 등급·연동 보상 표시 불가 | name, points만으로는 제한적 표시 |
| **product_reviews**에서 profiles 조인 제거 | 상품 상세 **리뷰 작성자 이름/이메일** 미표시 | "Пользователь" 등 고정 문구로 대체 가능 |
| AuthContext **value를 useMemo**로만 고정 | 없음 (동작은 유지, 리렌더만 줄어듦) | 권장 |

---

## 4. 권장 적용 순서

1. **DB 스키마 정리**  
   - SUPABASE_FULL_SCHEMA.sql + DASHBOARD 스키마를 적용해 profiles, products, product_reviews 등 필요한 컬럼이 모두 있는지 확인.
2. **코드 방어**  
   - AuthContext: value useMemo, (선택) REACT_APP_ADMIN_EMAILS로 관리자 판별.  
   - product_reviews: profiles 조인 제거 시 작성자 표시를 고정 문구로.  
   - profiles select는 가능한 한 최소 컬럼만 사용하고, 없을 수 있는 컬럼은 try/catch로 처리.
3. **#310 대응**  
   - setState 시 이전 값과 같으면 업데이트 생략, useEffect 의존은 원시값/안정 참조만 사용.

이 순서로 적용하면 400/#310을 줄이면서, “어떤 기능이 깨질 수 있는지”는 위 표를 기준으로 제어할 수 있습니다.
