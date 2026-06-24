const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** 이미지 파일을 remove.bg Edge Function에 보내 배경 제거된 PNG File 반환. 실패 시 원본 반환. */
export async function removeBackground(file: File): Promise<File> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/removebg`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });

  if (!res.ok) throw new Error(`배경 제거 실패 (${res.status})`);

  const blob = await res.blob();
  return new File([blob], 'image.png', { type: 'image/png' });
}
