-- Secure Instagram PIN authentication for approved residents.
-- Run after 0001_community.sql and 0002_follower_check.sql.

alter table public.residents
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create table if not exists public.player_pin_credentials (
  resident_id uuid primary key references public.residents(id) on delete cascade,
  instagram text not null unique,
  instagram_scoped_id text not null unique,
  pin_hash text not null check (pin_hash ~ '^[0-9a-f]{64}$'),
  pin_expires_at timestamptz not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.player_pin_credentials enable row level security;
revoke all on public.player_pin_credentials from anon, authenticated;
grant all on public.player_pin_credentials to service_role;

create table if not exists public.instagram_webhook_events (
  event_key text primary key,
  received_at timestamptz not null default now()
);
alter table public.instagram_webhook_events enable row level security;
revoke all on public.instagram_webhook_events from anon, authenticated;
grant all on public.instagram_webhook_events to service_role;

create index if not exists player_pin_credentials_expiry_idx
  on public.player_pin_credentials(pin_expires_at);
