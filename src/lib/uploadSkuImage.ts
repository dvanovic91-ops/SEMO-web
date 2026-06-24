import { supabase } from './supabase';

/** InventoryTab·박스 빌더 SKU 이미지 — promos 버킷 sku/ 경로 */
const BUCKET = 'promos';

export async function uploadSkuImageFile(file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.');

  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `sku/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || `image/${safeExt}`,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
