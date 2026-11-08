// WanderTales Instagram DM bot (Supabase Edge Function, deployed with verify_jwt = false).
// A follower DMs "DAFTAR" (any case) to @wandertales.guild → the bot creates their login account in
// public.player_accounts (the table the game login reads) and replies with a 6-digit PIN.
// "LUPA PIN" gives a new PIN. Secrets: META_VERIFY_TOKEN, META_APP_SECRET, META_ACCESS_TOKEN,
// META_IG_ACCOUNT_ID, META_GRAPH_API_VERSION (e.g. v21.0). SUPABASE_URL / SERVICE_ROLE_KEY are built in.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN') ?? ''
const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? ''
const ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') ?? ''
const IG_ACCOUNT_ID = Deno.env.get('META_IG_ACCOUNT_ID') ?? ''
const GRAPH_VERSION = Deno.env.get('META_GRAPH_API_VERSION') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const GUILD = '@wandertales.guild'
const CLASSES = ['Warrior', 'Mage', 'Archer', 'Rogue', 'Healer', 'Paladin'] as const

let db: ReturnType<typeof createClient> | null = null
function getDb() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing')
  db ??= createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return db
}

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'object' && e ? String((e as Record<string, unknown>).message ?? JSON.stringify(e)) : String(e)
const log = (stage: string) => console.log(`[WANDERTALES] ${stage}`)

// ---------- Meta signature ----------
async function verifySignature(body: string, signature: string) {
  if (!APP_SECRET || !signature.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = 'sha256=' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (signature.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// ---------- Graph API ----------
function checkMetaConfig() {
  if (!ACCESS_TOKEN) throw new Error('META_ACCESS_TOKEN is missing')
  if (!/^v\d+\.\d+$/.test(GRAPH_VERSION)) throw new Error('META_GRAPH_API_VERSION is missing or invalid')
}

async function readJson(res: Response, what: string) {
  const raw = await res.text()
  let data: any
  try { data = JSON.parse(raw) } catch { throw new Error(`${what} returned invalid JSON. HTTP ${res.status}`) }
  if (!res.ok) throw new Error(`${what} HTTP ${res.status}: ${data?.error?.message ?? 'Unknown error'}`)
  return data
}

async function getUsername(igScopedId: string): Promise<string | null> {
  checkMetaConfig()
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(igScopedId)}`)
  url.searchParams.set('fields', 'username')
  url.searchParams.set('access_token', ACCESS_TOKEN)
  const data = await readJson(await fetch(url), 'Meta API')
  return typeof data.username === 'string' ? data.username.replace(/^@/, '').toLowerCase() : null
}

async function sendDm(recipientId: string, text: string) {
  checkMetaConfig()
  if (!IG_ACCOUNT_ID) throw new Error('META_IG_ACCOUNT_ID is missing')
  log('Sending Instagram DM')
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${IG_ACCOUNT_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text }, access_token: ACCESS_TOKEN }),
  })
  await readJson(res, 'Instagram DM')
  log('Instagram DM sent')
}

// ---------- commands ----------
type Command = 'DAFTAR' | 'LUPA_PIN'
/** "Daftar", "daftar!", " DAFTAR " → DAFTAR; "lupa pin" / "lupapin" → LUPA_PIN. */
function parseCommand(text: string): Command | null {
  const t = text.toUpperCase().replace(/[^A-Z]/g, '')
  if (t === 'DAFTAR') return 'DAFTAR'
  if (t === 'LUPAPIN') return 'LUPA_PIN'
  return null
}

function newPin() {
  const n = new Uint32Array(1)
  crypto.getRandomValues(n)
  return String(100000 + (n[0] % 900000))
}

const pinMessage = (username: string, pin: string, fresh: boolean) =>
  `Halo @${username}! ${fresh ? 'Pendaftaran kamu di WanderTales berhasil 🎉' : 'Ini PIN WanderTales kamu.'}\n\n` +
  `Username Login: @${username}\nPIN 6 Digit: ${pin}\n\n` +
  `Masukkan username Instagram dan PIN ini di halaman login game. Jangan bagikan PIN ke siapa pun. ` +
  `Kalau lupa, kirim LUPA PIN ke DM ini.`

async function handleCommand(senderId: string, username: string, cmd: Command) {
  const database = getDb()

  // follower check: null = no follower list uploaded yet (allowed), false = not following
  log('Checking follower')
  const { data: follows, error: followError } = await database.rpc('is_follower', { p_instagram: username })
  if (followError) throw new Error(`Follower check error: ${followError.message}`)
  if (follows === false) {
    await sendDm(senderId, `Halo @${username}! Kamu belum terdeteksi follow ${GUILD}. Follow dulu, lalu kirim DAFTAR lagi ya. (Daftar follower diperbarui berkala oleh Guild Master.)`)
    return
  }

  log('Looking up account')
  const { data: existing, error: findError } = await database
    .from('player_accounts')
    .select('instagram,pin')
    .eq('instagram', username)
    .maybeSingle()
  if (findError) throw new Error(`Account lookup error: ${findError.message}`)

  if (existing && cmd === 'DAFTAR') {
    // already registered: resend the same PIN, make sure login is allowed
    await database.from('player_accounts').update({ follows: true, updated_at: new Date().toISOString() }).eq('instagram', username)
    await sendDm(senderId, pinMessage(username, existing.pin as string, false))
    return
  }

  const pin = newPin()
  if (existing) {
    log('Issuing new PIN')
    const { error } = await database
      .from('player_accounts')
      .update({ pin, follows: true, failed_logins: 0, locked_until: null, updated_at: new Date().toISOString() })
      .eq('instagram', username)
    if (error) throw new Error(`PIN update error: ${error.message}`)
  } else {
    log('Creating account')
    const cls = CLASSES[0] // player picks and locks a class in-game
    const { error } = await database.from('player_accounts').insert({
      instagram: username, display_name: cls, pin, class: cls, class_locked: false, follows: true, xp: 45, gold: 100, inventory: [],
    })
    if (error) throw new Error(`Account create error: ${error.message}`)
    await database.from('audit_log').insert({ action: 'dm_register', detail: { instagram: username } })
  }
  await sendDm(senderId, pinMessage(username, pin, !existing))
}

// ---------- webhook ----------
const releaseEvent = async (key: string | null) => {
  if (!key) return
  try { await getDb().from('instagram_webhook_events').delete().eq('event_key', key) } catch (e) { console.error('[WANDERTALES] Event cleanup failed:', errorMessage(e)) }
}

Deno.serve(async (req: Request) => {
  let stage = 'starting'
  try {
    const url = new URL(req.url)

    if (req.method === 'GET') {
      // Meta webhook verification
      const challenge = url.searchParams.get('hub.challenge')
      if (url.searchParams.get('hub.mode') === 'subscribe' && VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN && challenge) {
        return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
      }
      return new Response('Verification failed', { status: 403 })
    }
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    stage = 'verify_signature'
    const body = await req.text()
    if (!APP_SECRET) throw new Error('META_APP_SECRET is not configured')
    if (!(await verifySignature(body, req.headers.get('x-hub-signature-256') ?? ''))) {
      log('Invalid Meta signature')
      return new Response('Invalid signature', { status: 401 })
    }

    let payload: any
    try { payload = JSON.parse(body) } catch { return new Response('Invalid JSON', { status: 400 }) }
    if (payload.object !== 'instagram') return Response.json({ received: true })
    log('Instagram webhook received')

    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        if (event.message?.is_echo || !event.message?.text || !event.sender?.id) continue
        const cmd = parseCommand(String(event.message.text))
        if (!cmd) continue
        log(`Incoming command: ${cmd}`)

        const senderId = String(event.sender.id)
        const mid: string | undefined = event.message.mid
        let reserved: string | null = null

        // Meta can deliver the same message twice: handle each message id once
        if (mid) {
          stage = 'check_duplicate'
          const { error } = await getDb().from('instagram_webhook_events').insert({ event_key: mid })
          if (error?.code === '23505') { log('Duplicate event ignored'); continue }
          if (error) throw new Error(`Webhook event database error: ${error.message}`)
          reserved = mid
        }

        try {
          stage = 'get_username'
          const username = await getUsername(senderId)
          if (!username) {
            await sendDm(senderId, 'Maaf, username Instagram kamu tidak bisa dibaca. Coba kirim DAFTAR lagi sebentar lagi.')
            await releaseEvent(reserved)
            continue
          }
          stage = 'handle_command'
          await handleCommand(senderId, username, cmd)
        } catch (e) {
          await releaseEvent(reserved) // let Meta's retry try again
          throw e
        }
      }
    }
    log('Webhook completed')
    return Response.json({ received: true })
  } catch (e) {
    console.error('[WANDERTALES WEBHOOK ERROR]', { stage, message: errorMessage(e) })
    return Response.json({ received: false, error: 'Webhook processing failed', stage }, { status: 500 })
  }
})
