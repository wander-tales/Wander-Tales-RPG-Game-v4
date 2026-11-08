import type { Appearance, Personality } from '../game/residents.mock.ts'
import type { CommentRow, Entry, GuildClass, RecruitEvent } from '../game/recruitment.ts'
export type { CommentRow, Entry, GuildClass, RecruitEvent }

export interface GuildMember {
  id: string; residentId: string; displayName: string; rank: number; rankName: string; cls: GuildClass; renown: number; joinedAt: string
}
export interface NewEvent { title: string; postUrl: string; startsAt: string; endsAt: string; minComments: number; slots: number; minChars: number; maxPerDay: number }
export interface ImportSummary { added: number; duplicates: number; invalid: number }

export interface RegistrationInput {
  instagram: string
  displayName: string
  personality: Personality
  appearance: Appearance
  consentData: boolean
  showInstagram: boolean
}

export type RegistrationStatus = 'pending' | 'approved' | 'rejected'

export interface Registration {
  id: string
  instagram: string
  displayName: string
  personality: Personality
  appearance: Appearance
  status: RegistrationStatus
  verificationCode: string
  source: 'self' | 'admin' | 'csv'
  showInstagram: boolean
  reviewNote: string | null
  createdAt: string
  /** true = on the uploaded follower list, null = no list was uploaded when they registered */
  follows: boolean | null
}

/** A registered resident as the game sees it. `id` is the permanent resident_id. */
export interface CommunityResident {
  id: string
  displayName: string
  /** only set when the resident agreed to show it */
  instagram: string | null
  personality: Personality
  appearance: Appearance
  homeBuildingId: string | null
  createdAt: string
}

export interface ImportRow {
  instagram: string
  display_name: string
  personality: Personality
  appearance: Appearance
  consent: boolean
  show_instagram: boolean
}
export interface ImportResult { row: number; ok: boolean; error?: string; resident_id?: string }

export interface FollowerListInfo { uploadedAt: string; count: number }

export interface AdminSession { signedIn: boolean; email: string | null; isGuildMaster: boolean }

/** What a save looks like at a glance (shown when two saves conflict). */
export interface CloudSummary { day: number; season: string; gold: number; population: number; buildings: number }
export interface CloudSave { rev: number; savedAt: string; device: string; summary: CloudSummary; data: unknown }
/** `ok: false` means someone saved in between: `current` is what is stored now. */
export type CloudWrite = { ok: true; rev: number } | { ok: false; current: CloudSave }
/** One kept version of a slot (the save itself is fetched with cloudLoad(slot, rev)). */
export interface CloudVersion { rev: number; savedAt: string; device: string; summary: CloudSummary }
export interface CloudSlotInfo extends CloudVersion { slot: number }
export const CLOUD_SLOTS = 3
export const CLOUD_HISTORY = 10

export interface Backend {
  mode: 'supabase' | 'local'
  // followers
  register(input: RegistrationInput): Promise<{ id: string; verificationCode: string; status: RegistrationStatus }>
  myRegistration(): Promise<Registration | null>
  withdraw(): Promise<void>
  listResidents(): Promise<CommunityResident[]>
  /** null when no follower list has been uploaded yet (check skipped) */
  isFollower(instagram: string): Promise<boolean | null>
  followerListInfo(): Promise<FollowerListInfo | null>
  // Guild Master
  session(): Promise<AdminSession>
  /** Emails a one-time sign-in link. */
  signIn(email: string): Promise<void>
  /** Signs in with a password set earlier with setPassword (no email round trip). */
  signInWithPassword(email: string, password: string): Promise<void>
  /** Sets or changes the signed-in account's password. */
  setPassword(password: string): Promise<void>
  signOut(): Promise<void>
  listRegistrations(status: RegistrationStatus): Promise<Registration[]>
  review(id: string, approve: boolean, note?: string): Promise<void>
  addResident(input: RegistrationInput): Promise<string>
  importResidents(rows: ImportRow[]): Promise<ImportResult[]>
  removeResident(id: string): Promise<void>
  setHome(id: string, home: string | null): Promise<void>
  /** replace the follower list with SHA-256 hashes of usernames */
  setFollowers(hashes: string[]): Promise<number>
  // guild (Phase 5)
  listGuildMembers(): Promise<GuildMember[]>
  listEvents(): Promise<RecruitEvent[]>
  leaderboard(eventId: string): Promise<Entry[]>
  createEvent(e: NewEvent): Promise<string>
  importComments(eventId: string, rows: CommentRow[]): Promise<ImportSummary>
  reviewEntry(eventId: string, instagram: string, approve: boolean, cls: GuildClass): Promise<void>
  closeEvent(eventId: string): Promise<void>
  updateMember(id: string, rank: number | null, cls: GuildClass | null): Promise<void>
  addRenown(id: string, amount: number, reason: string): Promise<number>
  removeMember(id: string): Promise<void>
  // cloud save (Guild Master only): 3 slots, the last 10 versions of each kept
  /** The slot's current save, or an older kept version when `rev` is given. */
  cloudLoad(slot: number, rev?: number): Promise<CloudSave | null>
  /** Compare-and-set: only writes when `baseRev` equals the slot's stored revision (0 = nothing stored yet). */
  cloudSave(data: unknown, summary: CloudSummary, device: string, baseRev: number, slot: number): Promise<CloudWrite>
  /** Slots that hold a save. */
  cloudSlots(): Promise<CloudSlotInfo[]>
  /** Kept versions of a slot, newest first. */
  cloudHistory(slot: number): Promise<CloudVersion[]>
}

const MESSAGES: Record<string, string> = {
  not_following: 'You don’t follow @wandertales.guild yet. Follow us on Instagram, then try again. (Kamu belum follow @wandertales.guild.)',
  already_registered: 'This Instagram account is already registered.',
  not_eligible: 'This entry is not eligible yet.',
  no_slots_left: 'All recruitment slots for this event are filled.',
  event_not_open: 'This recruitment event is closed.',
  invalid_amount: 'Renown must be between 1 and 500.',
  already_pending: 'You already have a registration waiting for review.',
  invalid_instagram: 'That doesn’t look like a valid Instagram username.',
  invalid_name: 'Display name must be 2–24 characters.',
  invalid_personality: 'Please choose a personality.',
  invalid_appearance: 'Something is wrong with the avatar — try Randomize.',
  consent_required: 'Consent is required to join the town.',
  too_many_attempts: 'Too many attempts today. Please try again tomorrow.',
  not_guild_master: 'Only the Guild Master can do that.',
  sign_in_required: 'Please sign in first.',
  already_reviewed: 'This registration was already reviewed.',
  not_found: 'Not found — it may have been withdrawn.',
  save_too_large: 'The save is too large for the cloud (4 MB limit).',
  invalid_slot: 'There are only 3 cloud save slots.',
  invalid_save: 'The save data is not valid.',
}
/** Turn backend error codes into friendly text. */
export function errorText(e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k))
  return code ? MESSAGES[code] : msg
}
