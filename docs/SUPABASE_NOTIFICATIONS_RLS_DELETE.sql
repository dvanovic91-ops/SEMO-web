-- 사용자 본인 알림 삭제 (앱에서 알림 카드 X 버튼)
-- 이미 SUPABASE_NOTIFICATIONS.sql 을 실행한 DB에는 이 파일만 추가 실행하면 됩니다.

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);
