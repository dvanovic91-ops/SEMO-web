# Supabase Storage — 이미지 저장소 설정

피부 사진, 리뷰 사진 등 유저 업로드를 안전하게 저장하기 위한 버킷과 RLS 정책입니다.

## 1. 버킷 생성

Supabase 대시보드 → **Storage** → **New bucket**

- **Name:** `user-uploads`
- **Public bucket:** OFF (비공개. URL은 signed URL 또는 RLS 통과 후만 접근)
- **Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif` (필요 시 추가)
- **File size limit:** 예: 5MB

또는 SQL로 버킷을 만들 수 없으므로 반드시 대시보드에서 생성합니다.

## 2. RLS 정책 (본인 폴더만 접근)

경로 규칙: **`{user_id}/...`** — 각 유저는 `auth.uid()`와 같은 이름의 폴더 아래에만 올리기/보기/삭제 가능하도록 합니다.

Supabase 대시보드 → **Storage** → **Policies** → `user-uploads` 버킷에 아래 정책 추가.

### 정책 1: 본인 폴더에만 업로드 (INSERT)

```sql
create policy "user-uploads insert own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'user-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

### 정책 2: 본인 폴더만 조회 (SELECT)

```sql
create policy "user-uploads select own folder"
on storage.objects for select
to authenticated
using (
  bucket_id = 'user-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

### 정책 3: 본인 폴더만 수정 (UPDATE)

```sql
create policy "user-uploads update own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'user-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'user-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

### 정책 4: 본인 폴더만 삭제 (DELETE)

```sql
create policy "user-uploads delete own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'user-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

## 3. 프론트에서 사용 예시

- **저장 경로:** `{userId}/{timestamp 또는 uuid}-{filename}`  
  예: `a1b2c3d4-.../1730123456-photo.jpg`
- **업로드:** `supabase.storage.from('user-uploads').upload(path, file, { upsert: true })`
- **공개 URL이 필요할 때:** 버킷을 Public이 아니면 `createSignedUrl()` 사용. Public이면 `getPublicUrl()`.

```ts
const path = `${userId}/${Date.now()}-${file.name}`;
const { data, error } = await supabase.storage
  .from('user-uploads')
  .upload(path, file, { contentType: file.type });
// 저장 후 data.path를 DB(리뷰, 프로필 등)에 저장
```

리뷰/프로필 테이블에는 **파일 경로**(`user-uploads` 버킷 내 path)만 저장하고, 표시할 때 Storage URL을 조합해 사용하면 됩니다.
