import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PIN_SECRET = Deno.env.get("PIN_HASH_SECRET") ?? "";
const admin = createClient(URL, SERVICE_KEY);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

async function hashPin(pin: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(PIN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    if (!PIN_SECRET) return json({ error: "Authentication is not configured." }, 503);
    const body = await req.json();
    const instagram = String(body.instagram ?? "").trim().replace(/^@+/, "").toLowerCase();
    const pin = String(body.pin ?? "").trim();
    if (!/^[a-z0-9._]{1,30}$/.test(instagram) || !/^\d{6}$/.test(pin)) return json({ error: "Username atau PIN tidak valid." }, 400);

    const { data: resident, error: residentError } = await admin.from("residents")
      .select("id,instagram,display_name,auth_user_id,registration_id")
      .eq("instagram", instagram).maybeSingle();
    if (residentError) throw residentError;
    if (!resident) return json({ error: "Username atau PIN salah, atau akun belum disetujui." }, 401);
    const { data: follows, error: followError } = await admin.rpc("is_follower", { p_instagram: instagram });
    if (followError) throw followError;
    if (follows === false) return json({ error: "Akses ditangguhkan karena akun tidak terdeteksi mengikuti @wandertales.guild. Follow kembali dan hubungi Guild Master untuk memperbarui daftar follower." }, 403);

    const { data: credential, error: credentialError } = await admin.from("player_pin_credentials")
      .select("pin_hash,pin_expires_at,failed_attempts,locked_until,instagram_scoped_id")
      .eq("resident_id", resident.id).maybeSingle();
    if (credentialError) throw credentialError;
    if (!credential || (credential.locked_until && Date.parse(credential.locked_until) > Date.now()) || Date.parse(credential.pin_expires_at) < Date.now()) {
      return json({ error: "Username atau PIN salah, atau PIN sudah kedaluwarsa. Kirim LUPA PIN melalui DM Instagram." }, 401);
    }
    const supplied = await hashPin(pin);
    if (supplied !== credential.pin_hash) {
      const attempts = Number(credential.failed_attempts ?? 0) + 1;
      await admin.from("player_pin_credentials").update({
        failed_attempts: Math.min(attempts, 5),
        locked_until: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
      }).eq("resident_id", resident.id);
      return json({ error: "Username atau PIN salah." }, 401);
    }
    await admin.from("player_pin_credentials").update({ failed_attempts: 0, locked_until: null }).eq("resident_id", resident.id);

    let userId = resident.auth_user_id as string | null;
    const email = `player-${resident.id}@auth.wandertales.invalid`;
    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, email_confirm: true, user_metadata: { resident_id: resident.id, instagram },
      });
      if (createError) throw createError;
      userId = created.user.id;
      const { error: linkError } = await admin.from("residents").update({ auth_user_id: userId }).eq("id", resident.id).is("auth_user_id", null);
      if (linkError) throw linkError;
    }
    const { error: profileError } = await admin.from("player_profiles").upsert({
      user_id: userId,
      display_name: resident.display_name,
      role: "player",
    }, { onConflict: "user_id" });
    if (profileError) throw profileError;
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) throw linkError;
    const tokenHash = link.properties?.hashed_token;
    if (!tokenHash) throw new Error("Supabase did not return a magic-link token.");
    return json({
      token_hash: tokenHash,
      player: {
        instagram: resident.instagram,
        displayName: resident.display_name,
        pin: "",
        cls: "Warrior",
        classLocked: false,
        follows: true,
        online: true,
        xp: 45,
        gold: 100,
        inventory: [],
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Player auth error", error);
    return json({ error: "Login sementara gagal. Coba lagi nanti." }, 500);
  }
});
