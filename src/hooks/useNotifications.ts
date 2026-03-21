import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  read_at: string | null;
  created_at: string;
  /** 관리자 공지: 이 구간 안에서만 목록에 노출 (없으면 기존 행 — 항상 표시) */
  visible_from: string | null;
  visible_until: string | null;
  /** 주문 id, 공지 유형·이동 화면 등 (jsonb) */
  metadata: Record<string, unknown> | null;
};

/**
 * Supabase `notifications` — 목록 조회, 실시간 갱신, 읽음 처리.
 * 테이블 없으면 빈 목록만 반환 (콘솔 경고).
 */
export function useNotifications(userId: string | null | undefined) {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!supabase || !userId) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, body, kind, read_at, created_at, visible_from, visible_until, metadata')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        if (error.code !== '42P01' && !error.message?.includes('does not exist')) {
          console.warn('[notifications]', error.message);
        }
        setItems([]);
        setUnreadCount(0);
        return;
      }

      const raw = (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const meta = r.metadata;
        return {
          ...r,
          metadata:
            meta && typeof meta === 'object' && !Array.isArray(meta)
              ? (meta as Record<string, unknown>)
              : null,
        } as NotificationRow;
      });
      const now = Date.now();
      const rows = raw.filter((r) => {
        if (r.kind !== 'admin') return true;
        const vf = r.visible_from;
        const vu = r.visible_until;
        if (vf == null && vu == null) return true;
        const from = vf ? new Date(vf).getTime() : -Infinity;
        const until = vu ? new Date(vu).getTime() : Infinity;
        return now >= from && now <= until;
      });
      setItems(rows);
      setUnreadCount(rows.filter((r) => !r.read_at).length);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => {
          void fetchNotifications();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  const markAllRead = useCallback(async () => {
    if (!supabase || !userId) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) {
      console.warn('[notifications] markAllRead', error.message);
      return;
    }
    await fetchNotifications();
  }, [userId, fetchNotifications]);

  /** 한 건 읽음 (알림 클릭 후 이동 시) */
  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!supabase || !userId) return;
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .is('read_at', null);
      if (error) {
        console.warn('[notifications] markNotificationRead', error.message);
        return;
      }
      await fetchNotifications();
    },
    [userId, fetchNotifications],
  );

  /** 한 건 삭제 (카드 우측 X — RLS delete_own 필요) */
  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!supabase || !userId) return;
      const { error } = await supabase.from('notifications').delete().eq('id', notificationId).eq('user_id', userId);
      if (error) {
        console.warn('[notifications] deleteNotification', error.message);
        return;
      }
      await fetchNotifications();
    },
    [userId, fetchNotifications],
  );

  return {
    items,
    unreadCount,
    loading,
    refetch: fetchNotifications,
    markAllRead,
    markNotificationRead,
    deleteNotification,
  };
}
