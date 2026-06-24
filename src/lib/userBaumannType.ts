import type { SupabaseClient } from '@supabase/supabase-js';

const VALID_BAUMANN = /^[DO][SR][NP][TW]$/;

export function normalizeBaumannType(raw: unknown): string | null {
  const t = String(raw ?? '').trim().toUpperCase();
  return VALID_BAUMANN.test(t) ? t : null;
}

type SkinTestRow = {
  skin_type?: string | null;
  completed_at?: string | null;
};

/** profiles → skin_test_results(최신 completed_at) — Profile.tsx 와 동일 기준 */
export async function fetchUserBaumannType(
  client: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('baumann_type')
    .eq('id', userId)
    .maybeSingle();

  if (!profileError && profile) {
    const fromProfile = normalizeBaumannType(
      (profile as { baumann_type?: string | null }).baumann_type,
    );
    if (fromProfile) return fromProfile;
  }

  // 예전 DB는 completed_at만 있음 — created_at 정렬 시 조회 실패(프로필엔 OSPW 있는데 모달 뜨는 버그)
  const { data: rows, error: rowsError } = await client
    .from('skin_test_results')
    .select('skin_type, completed_at')
    .eq('user_id', userId);

  if (rowsError || !rows?.length) return null;

  const sorted = (rows as SkinTestRow[])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime(),
    );

  for (const row of sorted) {
    const t = normalizeBaumannType(row.skin_type);
    if (t) return t;
  }
  return null;
}

export const SKIN_TEST_RETURN_KEY = 'semo_skin_test_return_to';
