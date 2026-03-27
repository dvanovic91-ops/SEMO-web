import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useSkinReminderBadge(userId: string | null | undefined, cycle: 'monthly' | 'quarterly' = 'monthly') {
  const [due, setDue] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!userId || !supabase) {
      setDue(false);
      return;
    }
    const run = async () => {
      const { data } = await supabase
        .from('skin_test_results')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const last = data?.created_at ? new Date(data.created_at) : null;
      if (!last || Number.isNaN(last.getTime())) {
        setDue(true);
        return;
      }
      const now = Date.now();
      const intervalDays = cycle === 'quarterly' ? 90 : 30;
      const nextAt = last.getTime() + intervalDays * 24 * 60 * 60 * 1000;
      setDue(now >= nextAt);
    };
    void run();
    return () => {
      alive = false;
    };
  }, [userId, cycle]);

  return useMemo(() => ({ due, count: due ? 1 : 0 }), [due]);
}

