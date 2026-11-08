-- WanderTales Guild — add two head accessories (horns, headband) to the simple avatar's accessory list.
-- Same function, same checks, just a longer accessory enum — replace it in place.
create or replace function public.valid_appearance(a jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(a) = 'object'
    and coalesce(a->>'skin', '') ~ '^#[0-9a-fA-F]{6}$'
    and coalesce(a->>'hair', '') ~ '^#[0-9a-fA-F]{6}$'
    and coalesce(a->>'shirt', '') ~ '^#[0-9a-fA-F]{6}$'
    and coalesce(a->>'pants', '') ~ '^#[0-9a-fA-F]{6}$'
    and (a->>'hat' is null or a->>'hat' ~ '^#[0-9a-fA-F]{6}$')
    and a->>'hairStyle' in ('short', 'long', 'bun', 'spiky')
    and coalesce(a->>'eyes', 'round') in ('round', 'happy', 'sleepy', 'wide')
    and coalesce(a->>'accessory', 'none') in ('none', 'glasses', 'scarf', 'flower', 'horns', 'headband')
    and coalesce(a->>'build', 'regular') in ('slim', 'regular', 'sturdy')
    and jsonb_typeof(a->'height') = 'number'
    and (a->>'height')::numeric between 0.9 and 1.1
$$;
