-- Telegram user bot UI language (ru|en). Null = derive from Telegram client language until user picks.
alter table public.profiles
  add column if not exists telegram_bot_locale text;

alter table public.profiles
  drop constraint if exists profiles_telegram_bot_locale_check;

alter table public.profiles
  add constraint profiles_telegram_bot_locale_check
  check (telegram_bot_locale is null or telegram_bot_locale in ('ru', 'en'));

comment on column public.profiles.telegram_bot_locale is
  'User-facing language for @My_SEMO_Beautybot (ru|en). Null: use Telegram language_code until set.';
