-- Player cloud authentication and persistent game profile fields.
-- PIN verification and profile access are handled only by the player-auth Edge Function.

ALTER TABLE public.player_game_profiles
  ADD COLUMN IF NOT EXISTS player_name TEXT,
  ADD COLUMN IF NOT EXISTS quest_state JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_quests_count INTEGER NOT NULL DEFAULT 0
    CHECK (completed_quests_count >= 0);

CREATE TABLE IF NOT EXISTS public.player_sessions (
  token_hash TEXT PRIMARY KEY,
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_sessions_resident_idx
  ON public.player_sessions (resident_id);

CREATE INDEX IF NOT EXISTS player_sessions_expiry_idx
  ON public.player_sessions (expires_at);

ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;

-- No client policies are created. Only the service-role Edge Function accesses sessions.
