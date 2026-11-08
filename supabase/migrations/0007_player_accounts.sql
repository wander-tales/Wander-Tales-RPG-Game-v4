-- WanderTales Guild — player login accounts (Instagram username + 6-digit PIN) in the database.
-- Until now these lived only in the Guild Master's browser, so a follower on another device
-- could not log in. The Guild Master writes them here (e.g. right after uploading the follower
-- list); players log in through player_login(), which never returns other players' PINs.

create table public.player_accounts (
  instagram text primary key check (instagram ~ '^[a-z0-9._]{1,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 24),
  pin text not null check (pin ~ '^[0-9]{6}$'),
  class text not null default 'Warrior' check (class in ('Warrior', 'Mage', 'Archer', 'Rogue', 'Healer', 'Paladin')),
  class_locked boolean not null default false,
  follows boolean not null default true,
  xp int not null default 45,
  gold int not null default 100,
  inventory jsonb not null default '[]'::jsonb check (jsonb_typeof(inventory) = 'array'),
  failed_logins int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_accounts enable row level security;
-- no policies: only reachable through the functions below

create function public.player_account_json(a public.player_accounts) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'instagram', a.instagram, 'displayName', a.display_name, 'pin', a.pin, 'cls', a.class,
    'classLocked', a.class_locked, 'follows', a.follows, 'xp', a.xp, 'gold', a.gold,
    'inventory', a.inventory, 'createdAt', a.created_at)
$$;

-- Guild Master: every account, PINs included (needed to reply to DMs / export CSV).
create function public.admin_list_player_accounts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_guild_master();
  return coalesce((select jsonb_agg(public.player_account_json(a) order by a.created_at desc) from public.player_accounts a), '[]'::jsonb);
end $$;

-- Guild Master: insert or update many accounts at once.
-- Existing accounts keep their game progress (xp, gold, inventory); only login data is updated.
create function public.admin_upsert_player_accounts(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.require_guild_master();
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'invalid_accounts'; end if;
  if jsonb_array_length(p_rows) > 200000 then raise exception 'too_many_accounts'; end if;
  insert into public.player_accounts as a (instagram, display_name, pin, class, class_locked, follows, xp, gold, inventory)
  select h, left(coalesce(nullif(btrim(r->>'displayName'), ''), r->>'cls', 'Warrior'), 24), r->>'pin',
         coalesce(r->>'cls', 'Warrior'), coalesce((r->>'classLocked')::boolean, false), coalesce((r->>'follows')::boolean, true),
         coalesce((r->>'xp')::int, 45), coalesce((r->>'gold')::int, 100),
         case when jsonb_typeof(r->'inventory') = 'array' then r->'inventory' else '[]'::jsonb end
  from (select distinct on (public.normalize_instagram(r->>'instagram')) public.normalize_instagram(r->>'instagram') h, r
        from jsonb_array_elements(p_rows) r) x
  where h is not null
  on conflict (instagram) do update set
    display_name = excluded.display_name, pin = excluded.pin, class = excluded.class,
    class_locked = excluded.class_locked, follows = excluded.follows,
    failed_logins = case when a.pin <> excluded.pin then 0 else a.failed_logins end,
    locked_until = case when a.pin <> excluded.pin then null else a.locked_until end,
    updated_at = now();
  get diagnostics n = row_count;
  insert into public.audit_log (actor, action, detail) values (auth.uid(), 'upsert_player_accounts', jsonb_build_object('count', n));
  return n;
end $$;

create function public.admin_remove_player_account(p_instagram text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_guild_master();
  delete from public.player_accounts where instagram = public.normalize_instagram(p_instagram);
  insert into public.audit_log (actor, action, detail) values (auth.uid(), 'remove_player_account', jsonb_build_object('instagram', public.normalize_instagram(p_instagram)));
end $$;

-- Player login: returns the player's own account, or {"error": not_registered / not_following /
-- wrong_pin / too_many_attempts}. Errors are returned, not raised, so the wrong-PIN counter is kept
-- (10 wrong PINs = locked for 15 minutes).
create function public.player_login(p_instagram text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.player_accounts;
begin
  select * into a from public.player_accounts where instagram = public.normalize_instagram(p_instagram);
  if not found then return jsonb_build_object('error', 'not_registered'); end if;
  if a.locked_until is not null and a.locked_until > now() then return jsonb_build_object('error', 'too_many_attempts'); end if;
  if a.pin is distinct from btrim(coalesce(p_pin, '')) then
    update public.player_accounts set failed_logins = failed_logins + 1,
      locked_until = case when failed_logins + 1 >= 10 then now() + interval '15 minutes' end
    where instagram = a.instagram;
    return jsonb_build_object('error', 'wrong_pin');
  end if;
  if not a.follows then return jsonb_build_object('error', 'not_following'); end if;
  update public.player_accounts set failed_logins = 0, locked_until = null where instagram = a.instagram;
  return public.player_account_json(a);
end $$;

revoke all on function public.player_account_json(public.player_accounts) from public, anon, authenticated;
revoke all on function public.admin_list_player_accounts() from public, anon;
revoke all on function public.admin_upsert_player_accounts(jsonb) from public, anon;
revoke all on function public.admin_remove_player_account(text) from public, anon;
revoke all on function public.player_login(text, text) from public;
grant execute on function public.admin_list_player_accounts() to authenticated;
grant execute on function public.admin_upsert_player_accounts(jsonb) to authenticated;
grant execute on function public.admin_remove_player_account(text) to authenticated;
grant execute on function public.player_login(text, text) to anon, authenticated;
