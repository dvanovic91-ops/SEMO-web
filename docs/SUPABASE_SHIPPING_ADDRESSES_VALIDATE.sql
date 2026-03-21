-- =============================================================================
-- shipping_addresses: 선택적 백엔드 검증 (트리거)
-- 레거시 이관(migrateLegacyProfileEditToSupabase)이 불완전 행을 넣는 경우
-- 이 스크립트를 이관 완료 후에 실행하는 것을 권장합니다.
-- =============================================================================

create or replace function public.shipping_addresses_require_complete_or_empty()
returns trigger
language plpgsql
as $$
declare
  has_any boolean;
  ph text;
begin
  has_any :=
    coalesce(trim(NEW.city_region), '') <> ''
    or coalesce(trim(NEW.street_house), '') <> ''
    or coalesce(trim(NEW.postcode), '') <> ''
    or coalesce(trim(NEW.phone), '') <> ''
    or coalesce(trim(NEW.inn), '') <> ''
    or coalesce(trim(NEW.passport_series), '') <> ''
    or coalesce(trim(NEW.passport_number), '') <> ''
    or coalesce(trim(NEW.fio_last), '') <> ''
    or coalesce(trim(NEW.fio_first), '') <> ''
    or coalesce(trim(NEW.fio_middle), '') <> '';

  if not has_any then
    return NEW;
  end if;

  if coalesce(trim(NEW.fio_last), '') = '' or coalesce(trim(NEW.fio_first), '') = '' then
    raise exception 'shipping_incomplete: ФИО';
  end if;
  if coalesce(trim(NEW.city_region), '') = '' or coalesce(trim(NEW.street_house), '') = '' then
    raise exception 'shipping_incomplete: адрес';
  end if;
  if regexp_replace(coalesce(NEW.postcode, ''), '\D', '', 'g') !~ '^\d{6}$' then
    raise exception 'shipping_incomplete: индекс';
  end if;
  if regexp_replace(coalesce(NEW.inn, ''), '\D', '', 'g') !~ '^\d{12}$' then
    raise exception 'shipping_incomplete: ИНН';
  end if;
  if regexp_replace(coalesce(NEW.passport_series, ''), '\D', '', 'g') !~ '^\d{4}$' then
    raise exception 'shipping_incomplete: серия паспорта';
  end if;
  if regexp_replace(coalesce(NEW.passport_number, ''), '\D', '', 'g') !~ '^\d{6}$' then
    raise exception 'shipping_incomplete: номер паспорта';
  end if;

  ph := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');
  if length(ph) < 11 then
    raise exception 'shipping_incomplete: телефон';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_shipping_addresses_complete on public.shipping_addresses;

create trigger trg_shipping_addresses_complete
  before insert or update on public.shipping_addresses
  for each row
  execute function public.shipping_addresses_require_complete_or_empty();
