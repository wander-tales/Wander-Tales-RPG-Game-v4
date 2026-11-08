-- WanderTales Guild — Phase 8: cloud save slots and version history.
-- Up to 3 save slots per town. Every successful write is also kept in game_save_versions (the last 10 per slot),
-- so an older version can be loaded again. Writes stay compare-and-set on `rev`, per slot, exactly as in 0004.
-- Existing saves become slot 1.

alter table public.game_saves add column slot smallint not null default 1 check (slot between 1 and 3);
alter table public.game_saves drop constraint game_saves_pkey;
alter table public.game_saves add primary key (town_id, slot);

create table public.game_save_versions (
  town_id uuid not null references public.towns (id),
  slot smallint not null check (slot between 1 and 3),
  rev int not null check (rev > 0),
  data jsonb not null,
  summary jsonb not null default '{}',
  device text not null default '',
  saved_by uuid references auth.users (id) on delete set null,
  saved_at timestamptz not null default now(),
  primary key (town_id, slot, rev)
);
alter table public.game_save_versions enable row level security; -- no policies: only the functions below can touch it
-- the current save of an existing slot is its first version
insert into public.game_save_versions (town_id, slot, rev, data, summary, device, saved_by, saved_at)
  select town_id, slot, rev, data, summary, device, saved_by, saved_at from public.game_saves where rev > 0;

drop function public.cloud_save_load(uuid);
drop function public.cloud_save_write(jsonb, jsonb, text, int, uuid);

create function public.check_slot(p_slot int) returns void
language plpgsql immutable as $$
begin
  if p_slot is null or p_slot not between 1 and 3 then raise exception 'invalid_slot'; end if;
end $$;

-- The slot's current save, or one older version of it when p_rev is given. null when there is nothing.
create function public.cloud_save_load(p_slot int default 1, p_rev int default null,
  p_town uuid default '00000000-0000-0000-0000-000000000001') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.game_saves; v public.game_save_versions;
begin
  perform public.require_guild_master();
  perform public.check_slot(p_slot);
  if p_rev is not null then
    select * into v from public.game_save_versions where town_id = p_town and slot = p_slot and rev = p_rev;
    if not found then return null; end if;
    return jsonb_build_object('rev', v.rev, 'savedAt', v.saved_at, 'device', v.device, 'summary', v.summary, 'data', v.data);
  end if;
  select * into r from public.game_saves where town_id = p_town and slot = p_slot;
  if not found or r.rev = 0 then return null; end if;
  return public.save_json(r);
end $$;

-- Returns {"ok": true, "rev": n} or {"ok": false, "current": <stored save>} when p_base_rev is stale.
create function public.cloud_save_write(p_data jsonb, p_summary jsonb, p_device text, p_base_rev int, p_slot int default 1,
  p_town uuid default '00000000-0000-0000-0000-000000000001') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.game_saves;
begin
  perform public.require_guild_master();
  perform public.check_slot(p_slot);
  if p_data is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(coalesce(p_summary, '{}'::jsonb)) <> 'object' then raise exception 'invalid_save'; end if;
  if octet_length(p_data::text) > 4000000 then raise exception 'save_too_large'; end if;
  insert into public.game_saves (town_id, slot) values (p_town, p_slot) on conflict do nothing; -- first save creates the slot (rev 0)
  select * into r from public.game_saves where town_id = p_town and slot = p_slot for update; -- serialises two devices saving at once
  if r.rev <> coalesce(p_base_rev, 0) then
    return jsonb_build_object('ok', false, 'current', public.save_json(r));
  end if;
  update public.game_saves
    set rev = r.rev + 1, data = p_data, summary = coalesce(p_summary, '{}'::jsonb), device = left(coalesce(p_device, ''), 60), saved_by = auth.uid(), saved_at = now()
    where town_id = p_town and slot = p_slot returning * into r;
  insert into public.game_save_versions (town_id, slot, rev, data, summary, device, saved_by, saved_at)
    values (p_town, p_slot, r.rev, r.data, r.summary, r.device, r.saved_by, r.saved_at);
  delete from public.game_save_versions where town_id = p_town and slot = p_slot and rev <= r.rev - 10; -- keep the last 10
  insert into public.audit_log (actor, action, detail) values (auth.uid(), 'cloud_save', jsonb_build_object('rev', r.rev, 'slot', p_slot, 'device', r.device));
  return jsonb_build_object('ok', true, 'rev', r.rev);
end $$;

-- Every slot that has a save: [{slot, rev, savedAt, device, summary}]
create function public.cloud_save_slots(p_town uuid default '00000000-0000-0000-0000-000000000001') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_guild_master();
  return coalesce((select jsonb_agg(jsonb_build_object('slot', slot, 'rev', rev, 'savedAt', saved_at, 'device', device, 'summary', summary) order by slot)
    from public.game_saves where town_id = p_town and rev > 0), '[]'::jsonb);
end $$;

-- The kept versions of one slot, newest first: [{rev, savedAt, device, summary}]
create function public.cloud_save_history(p_slot int default 1, p_town uuid default '00000000-0000-0000-0000-000000000001') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_guild_master();
  perform public.check_slot(p_slot);
  return coalesce((select jsonb_agg(jsonb_build_object('rev', rev, 'savedAt', saved_at, 'device', device, 'summary', summary) order by rev desc)
    from public.game_save_versions where town_id = p_town and slot = p_slot), '[]'::jsonb);
end $$;

revoke all on function public.check_slot(int) from public, anon, authenticated;
revoke all on function public.cloud_save_load(int, int, uuid) from public, anon;
revoke all on function public.cloud_save_write(jsonb, jsonb, text, int, int, uuid) from public, anon;
revoke all on function public.cloud_save_slots(uuid) from public, anon;
revoke all on function public.cloud_save_history(int, uuid) from public, anon;
grant execute on function public.cloud_save_load(int, int, uuid) to authenticated;
grant execute on function public.cloud_save_write(jsonb, jsonb, text, int, int, uuid) to authenticated;
grant execute on function public.cloud_save_slots(uuid) to authenticated;
grant execute on function public.cloud_save_history(int, uuid) to authenticated;
