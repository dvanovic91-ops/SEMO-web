import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 클라이언트 — 프론트에서 DB·Auth 접근용.
 * .env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 설정 필요.
 */
const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = url && anonKey ? createClient(url, anonKey) : (null as ReturnType<typeof createClient> | null);
