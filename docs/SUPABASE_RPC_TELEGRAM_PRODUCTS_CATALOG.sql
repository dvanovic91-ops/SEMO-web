-- Каталог для user-бота: активные товары без поля stock (остаток не отдаём в Telegram).
-- select telegram_products_catalog();

create or replace function public.telegram_products_catalog()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'slug', p.slug,
        'description', p.description,
        'detail_description', p.detail_description,
        'rrp_price', p.rrp_price,
        'prp_price', p.prp_price,
        'image_url', p.image_url,
        'image_urls', coalesce(p.image_urls, '[]'::jsonb)
      )
      order by p.name asc nulls last
    ),
    '[]'::jsonb
  )
  from public.products p
  where coalesce(p.is_active, true) = true;
$$;

revoke all on function public.telegram_products_catalog() from public;
grant execute on function public.telegram_products_catalog() to service_role;

comment on function public.telegram_products_catalog() is
  'User-бот: список товаров для витрины в Telegram без stock. Только service_role.';
