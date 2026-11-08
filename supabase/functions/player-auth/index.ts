import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PIN_SECRET = Deno.env.get("PIN_HASH_SECRET") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-player-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanInstagram(value: unknown): string {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin: string): Promise<string> {
  if (!PIN_SECRET) throw new Error("PIN_HASH_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PIN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function newSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function findSession(req: Request) {
  // The Supabase gateway Authorization header remains the public anon JWT.
  // The private player session is sent separately in x-player-session.
  const token = req.headers.get("x-player-session")?.trim() ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await db
    .from("player_sessions")
    .select("resident_id,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at).getTime() <= Date.now()) {
    if (data) await db.from("player_sessions").delete().eq("token_hash", tokenHash);
    return null;
  }
  await db.from("player_sessions").update({ last_seen_at: new Date().toISOString() }).eq("token_hash", tokenHash);
  return { residentId: data.resident_id as string, tokenHash };
}

function validClass(value: unknown): value is string {
  return ["Warrior", "Mage", "Archer", "Rogue", "Healer", "Paladin"].includes(String(value));
}

function validInventory(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 250;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PIN_SECRET) {
      throw new Error("Player authentication server configuration is incomplete");
    }

    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "login") {
      const instagram = cleanInstagram(body.instagram);
      const pin = String(body.pin ?? "").trim();
      if (!/^[a-z0-9._]{1,30}$/.test(instagram)) return reply({ error: "invalid_username" }, 400);
      if (!/^\d{6}$/.test(pin)) return reply({ error: "invalid_pin_format" }, 400);

      const { data: resident, error: residentError } = await db
        .from("residents")
        .select("id,display_name,instagram")
        .eq("town_id", "00000000-0000-0000-0000-000000000001")
        .eq("instagram", instagram)
        .maybeSingle();
      if (residentError) throw residentError;
      if (!resident) return reply({ error: "account_not_found" }, 401);

      const { data: credential, error: credentialError } = await db
        .from("player_pin_credentials")
        .select("resident_id,pin_hash,pin_expires_at,failed_attempts,locked_until")
        .eq("resident_id", resident.id)
        .maybeSingle();
      if (credentialError) throw credentialError;
      if (!credential?.pin_hash) return reply({ error: "pin_not_issued" }, 401);

      const now = Date.now();
      if (credential.locked_until && new Date(credential.locked_until).getTime() > now) {
        return reply({ error: "too_many_attempts" }, 429);
      }
      if (!credential.pin_expires_at || new Date(credential.pin_expires_at).getTime() <= now) {
        return reply({ error: "pin_expired" }, 401);
      }

      const matches = safeEqual(await hashPin(pin), String(credential.pin_hash));
      if (!matches) {
        const attempts = Number(credential.failed_attempts ?? 0) + 1;
        await db.from("player_pin_credentials").update({
          failed_attempts: attempts,
          locked_until: attempts >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("resident_id", resident.id);
        return reply({ error: attempts >= 5 ? "too_many_attempts" : "invalid_pin" }, 401);
      }

      await db.from("player_pin_credentials").update({
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      }).eq("resident_id", resident.id);

      const token = newSessionToken();
      const tokenHash = await sha256(token);
      const { error: sessionError } = await db.from("player_sessions").insert({
        token_hash: tokenHash,
        resident_id: resident.id,
        expires_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (sessionError) throw sessionError;

      const { data: profile, error: profileError } = await db
        .from("player_game_profiles")
        .select("player_class,class_locked,xp,gold,inventory,player_name,quest_state,completed_quests_count")
        .eq("resident_id", resident.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return reply({ error: "profile_not_found" }, 404);

      return reply({
        token,
        account: {
          residentId: resident.id,
          instagram,
          displayName: profile.player_name || resident.display_name,
          cls: profile.player_class,
          classLocked: profile.class_locked,
          xp: profile.xp,
          gold: profile.gold,
          inventory: profile.inventory,
          quests: profile.quest_state,
          completedQuestsCount: profile.completed_quests_count,
          createdAt: new Date().toISOString(),
        },
      });
    }

    const session = await findSession(req);
    if (!session) return reply({ error: "session_expired" }, 401);

    if (action === "load") {
      const { data: resident, error: residentError } = await db
        .from("residents").select("instagram,display_name").eq("id", session.residentId).single();
      if (residentError) throw residentError;
      const { data: profile, error: profileError } = await db
        .from("player_game_profiles")
        .select("player_class,class_locked,xp,gold,inventory,player_name,quest_state,completed_quests_count")
        .eq("resident_id", session.residentId).single();
      if (profileError) throw profileError;
      return reply({
        account: {
          residentId: session.residentId,
          instagram: resident.instagram,
          displayName: profile.player_name || resident.display_name,
          cls: profile.player_class,
          classLocked: profile.class_locked,
          xp: profile.xp,
          gold: profile.gold,
          inventory: profile.inventory,
          quests: profile.quest_state,
          completedQuestsCount: profile.completed_quests_count,
        },
      });
    }

    if (action === "save") {
      const p = body.profile ?? {};
      if (!validClass(p.playerClass) || !Number.isInteger(p.xp) || p.xp < 0 ||
          !Number.isInteger(p.gold) || p.gold < 0 || !validInventory(p.inventory) ||
          !Array.isArray(p.quests) || p.quests.length > 30 ||
          !Number.isInteger(p.completedQuestsCount) || p.completedQuestsCount < 0) {
        return reply({ error: "invalid_profile" }, 400);
      }

      const { data: current, error: currentError } = await db
        .from("player_game_profiles")
        .select("player_class,class_locked")
        .eq("resident_id", session.residentId).single();
      if (currentError) throw currentError;
      if (current.class_locked && current.player_class !== p.playerClass) {
        return reply({ error: "class_locked" }, 403);
      }

      const { error: saveError } = await db.from("player_game_profiles").update({
        player_class: p.playerClass,
        class_locked: !!p.classLocked || !!current.class_locked,
        xp: p.xp,
        gold: p.gold,
        inventory: p.inventory,
        player_name: String(p.playerName ?? "").trim().slice(0, 24) || null,
        quest_state: p.quests,
        completed_quests_count: p.completedQuestsCount,
        updated_at: new Date().toISOString(),
      }).eq("resident_id", session.residentId);
      if (saveError) throw saveError;
      return reply({ ok: true });
    }

    if (action === "logout") {
      const { error } = await db.from("player_sessions").delete().eq("token_hash", session.tokenHash);
      if (error) throw error;
      return reply({ ok: true });
    }

    return reply({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("[PLAYER AUTH]", error);
    return reply({ error: "server_error" }, 500);
  }
});
