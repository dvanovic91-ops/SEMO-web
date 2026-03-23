-- Личный кабинет в Telegram: баланс баллов, купоны (как в «Мои купоны»), доставка — как на сайте.
-- Выполнить в SQL Editor. Нужны: profiles.telegram_id, membership_coupons, shipping_addresses (fio_*).

create or replace function public.telegram_cabinet_preview(p_telegram_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name text;
  v_points int;
  v_coupons jsonb;
  v_shipping jsonb;
begin
  if p_telegram_id is null or trim(p_telegram_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_telegram_id');
  end if;

  select
    p.id,
    nullif(trim(coalesce(p.name, '')), ''),
    coalesce(p.points, 0)
  into v_user_id, v_name, v_points
  from public.profiles p
  where p.telegram_id = trim(p_telegram_id);

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'telegram_not_linked');
  end if;

  v_shipping := null;

  select coalesce(
    (
      select jsonb_agg(sub.j order by sub.expires_at asc)
      from (
        select
          jsonb_build_object(
            'id', c.id,
            'amount', c.amount,
            'expires_at', c.expires_at,
            'used_at', c.used_at,
            'tier', c.tier,
            'quarter_label', c.quarter_label
          ) as j,
          c.expires_at
        from public.membership_coupons c
        where c.user_id = v_user_id
        order by c.expires_at asc
        limit 25
      ) sub
    ),
    '[]'::jsonb
  ) into v_coupons;

  select
    jsonb_build_object(
      'fio',
      trim(
        concat_ws(
          ' ',
          nullif(trim(coalesce(s.fio_last, '')), ''),
          nullif(trim(coalesce(s.fio_first, '')), ''),
          nullif(trim(coalesce(s.fio_middle, '')), '')
        )
      ),
      'address_line',
      trim(
        concat_ws(
          ', ',
          nullif(trim(coalesce(s.city_region, '')), ''),
          nullif(trim(coalesce(s.street_house, '')), ''),
          nullif(trim(coalesce(s.apartment_office, '')), ''),
          nullif(trim(coalesce(s.postcode, '')), '')
        )
      ),
      'phone', nullif(trim(coalesce(s.phone, '')), '')
    )
  into v_shipping
  from public.shipping_addresses s
  where s.user_id = v_user_id
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'display_name', coalesce(v_name, ''),
    'points', coalesce(v_points, 0),
    'coupons', coalesce(v_coupons, '[]'::jsonb),
    'shipping', v_shipping
  );
end;
$$;

revoke all on function public.telegram_cabinet_preview(text) from public;
grant execute on function public.telegram_cabinet_preview(text) to service_role;

comment on function public.telegram_cabinet_preview(text) is
  'Telegram-бот: баллы, купоны, доставка — как в ЛК. Только service_role.';
