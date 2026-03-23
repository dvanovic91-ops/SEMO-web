-- Бот (service_role) вызывает: select * from telegram_orders_preview('telegram_user_id');
-- Возвращает последние 3 заказа + total_count для текста «ещё заказы».

create or replace function public.telegram_orders_preview(p_telegram_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_orders jsonb;
  v_total int;
begin
  if p_telegram_id is null or trim(p_telegram_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_telegram_id');
  end if;

  select id into v_user_id from public.profiles where telegram_id = trim(p_telegram_id);
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'telegram_not_linked');
  end if;

  select count(*)::int into v_total from public.orders where user_id = v_user_id;

  select coalesce(
    (
      select jsonb_agg(sub.j order by sub.created_at desc)
      from (
        select
          jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'created_at', o.created_at,
            'status', o.status,
            'total_cents', o.total_cents,
            'receiver_name', o.receiver_name,
            'receiver_phone', o.receiver_phone,
            'shipping_address', o.shipping_address,
            'tracking_url', o.tracking_url,
            'fulfillment_tracking', o.fulfillment_tracking
          ) as j,
          o.created_at
        from public.orders o
        where o.user_id = v_user_id
        order by o.created_at desc
        limit 3
      ) sub
    ),
    '[]'::jsonb
  ) into v_orders;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'total_count', coalesce(v_total, 0),
    'orders', v_orders
  );
end;
$$;

revoke all on function public.telegram_orders_preview(text) from public;
grant execute on function public.telegram_orders_preview(text) to service_role;

comment on function public.telegram_orders_preview(text) is
  'User-бот: по telegram_id из profiles — последние 3 заказа + total_count. Только service_role.';
