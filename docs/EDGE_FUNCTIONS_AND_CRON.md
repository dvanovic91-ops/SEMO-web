# Edge Functions · 포인트 소멸 알림 · 테스트→추천 매칭

## 1. 포인트 소멸 예정 알림 — **현재 기능 OFF**

알림이 너무 자주 가면 봇 연동한 유저가 불편할 수 있어서, **기본값은 꺼 둔 상태**입니다.

### DB 스키마

`profiles`에 포인트 소멸일이 있으면 (기능을 켰을 때) 알림을 보냅니다.

```sql
-- 포인트 소멸 예정일 (선택 컬럼)
alter table public.profiles add column if not exists points_expires_at timestamptz;
```

포인트를 지급할 때(테스트 완료, 이벤트 등) `points_expires_at = now() + interval '90 days'` 처럼 설정하면 됩니다.

### Edge Function

- **함수 이름:** `cron-point-expiry-notify`
- **역할:** `points_expires_at`이 오늘 ~ 7일 이내이고 `telegram_id`가 있는 프로필에게 텔레그램으로 "баллы истекают ..." 메시지 전송.
- **현재:** 시크릿 `POINT_EXPIRY_NOTIFY_ENABLED`가 `true`가 아니면 **아무 알림도 보내지 않고** `{ ok: true, disabled: true }` 만 반환 (기본 OFF).

### 기능 켜는 방법

1. Edge Function 시크릿 **`POINT_EXPIRY_NOTIFY_ENABLED` = `true`**.
2. **`CRON_POINT_EXPIRY_SECRET`**: 임의의 긴 랜덤 문자열을 생성해 시크릿으로 저장.
3. **cron 호출 시간:** 오전 9시는 피하기. **오후 5~6시(17:00~18:00)** 권장.
   - **cron-job.org** / **Uptime Robot** 등: 매일 **17:00** 또는 **18:00**에  
     `POST https://<project_ref>.supabase.co/functions/v1/cron-point-expiry-notify`  
     **필수 헤더:** `x-cron-point-expiry-secret: <CRON_POINT_EXPIRY_SECRET과 동일한 값>`  
     (Bearer만으로는 호출 불가 — 무단 스팸 방지.)

---

## 2. 테스트 결과 → 추천 상품 매칭

피부 타입(`skin_type`)별로 추천 상품을 관리하고, 테스트 완료 후 해당 타입의 상품을 보여주는 방식입니다.

### DB 스키마

```sql
-- 피부 타입별 추천 상품 (product_id는 상품 테이블/슬러그 등과 연동)
create table if not exists public.skin_type_products (
  skin_type text not null,
  product_id text not null,
  sort_order int default 0,
  primary key (skin_type, product_id)
);

alter table public.skin_type_products enable row level security;

-- 모든 로그인 유저가 추천 목록만 읽기 가능 (또는 공개 읽기)
create policy "추천 상품 읽기"
  on public.skin_type_products for select
  using (true);
```

예시 데이터:

```sql
insert into public.skin_type_products (skin_type, product_id, sort_order) values
  ('dry', 'product-slug-1', 1),
  ('dry', 'product-slug-2', 2),
  ('oily', 'product-slug-3', 1);
```

### 사용 방법

- **테스트 완료 직후:** 저장된 `skin_test_results.skin_type`으로 `skin_type_products`를 조회해 추천 상품 목록 표시.
- **프론트 예시:**

```ts
const { data } = await supabase
  .from('skin_type_products')
  .select('product_id')
  .eq('skin_type', skinType)
  .order('sort_order');
// data → [{ product_id: '...' }, ...]
```

별도 Edge Function 없이, 테스트 결과 저장 후 같은 화면에서 위 쿼리로 추천만 가져오면 됩니다.  
추천 매칭 로직을 서버에서만 돌리고 싶다면, RPC `get_recommended_products(p_skin_type text)`를 만들어서 같은 테이블을 조회해 반환하도록 할 수 있습니다.
