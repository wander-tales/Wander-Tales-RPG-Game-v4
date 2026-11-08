import type { PlayerAccount } from './playerAuthAndQuests'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const SESSION_KEY = 'wt.playerSession.v1'

type CloudAccount = {
  residentId: string
  instagram: string
  displayName: string
  cls: PlayerAccount['cls']
  classLocked: boolean
  xp: number
  gold: number
  inventory: PlayerAccount['inventory']
  quests?: unknown[]
  completedQuestsCount?: number
  createdAt?: string
}

function explainError(code: string): string {
  const messages: Record<string, string> = {
    invalid_username: 'Username Instagram tidak valid.',
    invalid_pin_format: 'PIN harus terdiri dari 6 digit angka.',
    account_not_found: 'Akun belum terdaftar di desa WanderTales.',
    pin_not_issued: 'PIN belum diterbitkan. Kirim DM DAFTAR ke @wandertales.guild.',
    pin_expired: 'PIN sudah kedaluwarsa. Minta PIN baru melalui DM.',
    invalid_pin: 'PIN tidak sesuai. Periksa kembali PIN dari DM.',
    too_many_attempts: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',
    session_expired: 'Sesi login berakhir. Silakan login kembali.',
    profile_not_found: 'Data karakter belum tersedia. Hubungi Guild Master.',
  }
  return messages[code] ?? code
}

async function call<T>(body: Record<string, unknown>, session?: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Konfigurasi Supabase belum tersedia.')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  }
  if (session) headers['x-player-session'] = session
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/player-auth`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(explainError(String(result?.error ?? 'Gagal menghubungi server.')))
  return result as T
}

export async function cloudPlayerLogin(instagram: string, pin: string): Promise<PlayerAccount> {
  const result = await call<{ token: string; account: CloudAccount }>({ action: 'login', instagram, pin })
  if (!result.token || !result.account) throw new Error('Respons login server tidak lengkap.')
  localStorage.setItem(SESSION_KEY, result.token)
  const a = result.account
  return {
    instagram: a.instagram,
    displayName: a.displayName,
    pin: '',
    cls: a.cls,
    classLocked: a.classLocked,
    follows: true,
    online: true,
    xp: a.xp,
    gold: a.gold,
    inventory: Array.isArray(a.inventory) ? a.inventory : [],
    createdAt: a.createdAt ?? new Date().toISOString(),
  }
}

export function getPlayerSession(): string | null {
  try { return localStorage.getItem(SESSION_KEY) } catch { return null }
}

export async function cloudPlayerLogout(): Promise<void> {
  const token = getPlayerSession()
  if (!token) return
  try { await call({ action: 'logout' }, token) } finally {
    localStorage.removeItem(SESSION_KEY)
  }
}

export async function cloudPlayerSave(profile: {
  playerName: string
  playerClass: PlayerAccount['cls']
  classLocked: boolean
  xp: number
  gold: number
  inventory: PlayerAccount['inventory']
  quests: unknown[]
  completedQuestsCount: number
}): Promise<void> {
  const token = getPlayerSession()
  if (!token) return
  await call({ action: 'save', profile: {
    playerName: profile.playerName,
    playerClass: profile.playerClass,
    classLocked: profile.classLocked,
    xp: profile.xp,
    gold: profile.gold,
    inventory: profile.inventory,
    quests: profile.quests,
    completedQuestsCount: profile.completedQuestsCount,
  } }, token)
}
