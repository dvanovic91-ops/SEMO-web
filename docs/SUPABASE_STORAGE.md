# Supabase Storage — 설정하는 법 (따라만 하면 됨)

이 프로젝트에서 이미지 쓰려면 버킷 두 개 만들고, 각각 정책 한 번씩 추가하면 됩니다.

---

## 1. 리뷰 사진용 버킷 (review-photos)

**1단계: 버킷 만들기**

1. Supabase 대시보드 왼쪽에서 **Storage** 클릭.
2. 오른쪽 위 **New bucket** 클릭.
3. **Bucket name** 칸에 `review-photos` 그대로 입력. (이름 틀리면 앱에서 안 씀)
4. **Public bucket** 스위치 **켜기(ON)**. (리뷰 사진은 누구나 봐야 해서)
5. Restrict file size / Restrict MIME types는 안 건드려도 됨.
6. **Create** 클릭.

**2단계: 업로드 허용 정책 넣기**

1. 방금 만든 **review-photos** 버킷 이름 클릭해서 들어감.
2. 위쪽 탭에서 **Policies** 클릭.
3. **New policy** 누르고 **For full customization** 같은 걸로 “직접 SQL 쓰기” 들어가거나,  
   또는 **SQL Editor**로 가서 아래 SQL 한 번에 실행해도 됨.

```sql
create policy "review-photos insert authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'review-photos');
```

이거 하나만 있으면 “로그인한 사람이 review-photos에 업로드 가능”이 됨.  
Public이 켜져 있으니까 읽기는 별도 정책 없어도 됨.

**리뷰 사진 업로드가 안 될 때 (흔한 원인)**

1. **이미지 용량**  
   웹 폼에서는 **파일 1장당 5MB**로 제한해 두었습니다. 아이폰 원본 등 큰 사진은 500KB~1MB 이하로 압축하거나, 작은 사진으로 테스트해 보세요.

2. **SELECT(읽기) 권한**  
   버킷을 **Public**으로 만들었으면, 업로드한 이미지 읽기는 별도 정책 없이 됩니다.  
   Public이 아닌 경우: Storage → 해당 버킷 → Policies에서 **SELECT**를 `public` 또는 `authenticated`에게 허용하는 정책을 추가하세요.

3. **로그인 상태**  
   업로드 정책이 `authenticated`이므로 **로그인한 사용자만** 올릴 수 있습니다.  
   로그인 여부·세션 만료(예: localhost에서 오래 두었을 때)를 확인하세요.

---

## 2. 상품 이미지용 버킷 (product-images)

**1단계: 버킷 만들기**

1. **Storage** 메뉴에서 다시 **New bucket** 클릭.
2. **Bucket name**에 `product-images` 그대로 입력.
3. **Public bucket** 스위치 **켜기(ON)**.
4. **Create** 클릭.

**2단계: 업로드 허용 정책 넣기**

1. **product-images** 버킷 클릭 → **Policies** 탭.
2. **New policy**로 들어가서 아래 SQL 실행.

```sql
create policy "product-images insert authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images');
```

---

## SQL Editor로 정책 넣는 법 (정리)

1. Supabase 왼쪽 메뉴에서 **SQL Editor** 클릭.
2. **New query** 선택.
3. 위에 적어둔 SQL 중 넣을 것 복사해서 붙여넣기. (review-photos용 / product-images용 각각 한 번씩)
4. **Run** (또는 Ctrl+Enter) 누르기.
5. 에러 없이 완료되면 끝.

---

## 요약

| 버킷 이름       | 용도           | Public | 정책 |
|----------------|----------------|--------|------|
| review-photos  | 리뷰 사진      | ON     | INSERT to authenticated (위 SQL 1개) |
| product-images | 상품/구성품 이미지 | ON     | INSERT to authenticated (위 SQL 1개) |

버킷 두 개 만들고, 각각 정책 SQL 한 줄씩 실행하면 설정 끝입니다.
