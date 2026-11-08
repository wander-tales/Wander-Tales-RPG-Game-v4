import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN") ?? "";
const IG_ACCOUNT_ID = Deno.env.get("META_IG_ACCOUNT_ID") ?? "";
const GRAPH_VERSION = Deno.env.get("META_GRAPH_API_VERSION") ?? "";
const PIN_SECRET = Deno.env.get("PIN_HASH_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function verifySignature(body: string, signature: string): Promise<boolean> {
  if (!APP_SECRET || !signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = "sha256=" + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function hashPin(pin: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(PIN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newPin() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}
async function graph(path: string, init?: RequestInit) {
  if (!GRAPH_VERSION || !ACCESS_TOKEN) throw new Error("Meta API secrets are not configured");
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  if (init?.method !== "POST") url.searchParams.set("access_token", ACCESS_TOKEN);
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "Meta API request failed");
  return data;
}
async function sendDm(recipientId: string, message: string) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${IG_ACCOUNT_ID}/messages?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text: message } }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "Could not send Instagram DM");
}
async function getUsername(igScopedId: string): Promise<string | null> {
  const data = await graph(`${encodeURIComponent(igScopedId)}?fields=username`);
  return typeof data.username === "string" ? data.username.replace(/^@/, "").toLowerCase() : null;
}
async function issuePin(senderId: string, username: string) {
  if (!PIN_SECRET) throw new Error("PIN_HASH_SECRET is not configured");
  const { data: resident, error } = await db.from("residents").select("id,instagram,display_name").eq("instagram", username).maybeSingle();
  if (error) throw error;
  if (!resident) {
    await sendDm(senderId, "Akun Instagram ini belum menjadi penduduk WanderTales yang disetujui. Silakan selesaikan pendaftaran di website terlebih dahulu dan tunggu persetujuan Guild Master.");
    return;
  }
  const { data: follows, error: followError } = await db.rpc("is_follower", { p_instagram: username });
  if (followError) throw followError;
  if (follows === false) {
    await sendDm(senderId, "Akses PIN ditahan karena akun ini tidak terdeteksi mengikuti @wandertales.guild. Follow kembali lalu hubungi Guild Master untuk memperbarui daftar follower.");
    return;
  }
  const pin = newPin();
  const pinHash = await hashPin(pin);
  const { error: saveError } = await db.from("player_pin_credentials").upsert({
    resident_id: resident.id,
    instagram: username,
    instagram_scoped_id: senderId,
    pin_hash: pinHash,
    pin_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "resident_id" });
  if (saveError) throw saveError;
  await sendDm(senderId, `Salam, ${resident.display_name}! PIN WanderTales kamu: ${pin}\n\nMasukkan username Instagram dan PIN ini di website. PIN berlaku 30 hari. Jangan bagikan PIN kepada siapa pun. Jika lupa, kirim LUPA PIN ke DM ini.`);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    return new Response("Verification failed", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await req.text();
  if (!await verifySignature(body, req.headers.get("x-hub-signature-256") ?? "")) return new Response("Invalid signature", { status: 401 });
  let payload: any;
  try { payload = JSON.parse(body); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (payload.object !== "instagram") return Response.json({ received: true });

  try {
    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        if (event.message?.is_echo || !event.message?.text || !event.sender?.id) continue;
        const message = String(event.message.text).trim().toUpperCase();
        if (!["DAFTAR", "LUPA PIN"].includes(message)) continue;
        const mid = event.message.mid;
        if (mid) {
          const { error } = await db.from("instagram_webhook_events").insert({ event_key: mid });
          if (error?.code === "23505") continue;
          if (error) throw error;
        }
        const username = await getUsername(String(event.sender.id));
        if (!username) {
          await sendDm(String(event.sender.id), "Maaf, username Instagram tidak dapat diverifikasi. Coba lagi beberapa saat.");
          continue;
        }
        await issuePin(String(event.sender.id), username);
      }
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("Instagram webhook processing failed", error);
    return Response.json({ received: true, processing_error: true }, { status: 200 });
  }
});
