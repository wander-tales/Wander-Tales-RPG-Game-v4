import { CLASSES, type GuildClass } from './recruitment'
import { RESIDENTS } from './residents.mock'

export interface PlayerInventoryItem {
  id: string
  name: string
  icon: string
  category: 'weapon' | 'armor' | 'consumable' | 'relic'
  cls?: GuildClass
  bonus: string
  qty: number
  equipped?: boolean
}

export interface PlayerAccount {
  instagram: string
  displayName: string
  pin: string
  cls: GuildClass
  classLocked: boolean
  follows: boolean
  online: boolean
  xp: number
  gold: number
  inventory: PlayerInventoryItem[]
  createdAt: string
}

export type QuestObjectiveType = 'kill_any' | 'kill_slime' | 'kill_goblin' | 'raid_dungeon' | 'talk_npc' | 'explore_distance'

export interface ClassQuest {
  id: string
  cls: GuildClass
  tier: number
  minLevel: number
  title: string
  description: string
  objectiveLabel: string
  objectiveType: QuestObjectiveType
  progress: number
  target: number
  rewardXp: number
  rewardGold: number
  rewardItem: PlayerInventoryItem
}

const ACCOUNTS_KEY = 'wt.playerAccounts.v1'
const GM_CRED_KEY = 'wt.gmCreds.v1'

const STARTER_WEAPON_BY_CLASS: Record<GuildClass, PlayerInventoryItem> = {
  Warrior: {
    id: 'wpn_warrior_starter',
    name: 'Iron Vanguard Greatsword',
    icon: '🗡️',
    category: 'weapon',
    cls: 'Warrior',
    bonus: '+15 ATK · Tebasan Perisai',
    qty: 1,
    equipped: true,
  },
  Mage: {
    id: 'wpn_mage_starter',
    name: 'Astral Oak Staff',
    icon: '🪄',
    category: 'weapon',
    cls: 'Mage',
    bonus: '+18 MATK · Bola Api Mana',
    qty: 1,
    equipped: true,
  },
  Archer: {
    id: 'wpn_archer_starter',
    name: 'Sylvan Longbow',
    icon: '🏹',
    category: 'weapon',
    cls: 'Archer',
    bonus: '+16 AGI · Panah Angin',
    qty: 1,
    equipped: true,
  },
  Rogue: {
    id: 'wpn_rogue_starter',
    name: 'Shadowfang Twin Daggers',
    icon: '🗡️',
    category: 'weapon',
    cls: 'Rogue',
    bonus: '+17 CRIT · Serangan Bayangan',
    qty: 1,
    equipped: true,
  },
  Healer: {
    id: 'wpn_healer_starter',
    name: 'Sunbloom Scepter',
    icon: '✨',
    category: 'weapon',
    cls: 'Healer',
    bonus: '+16 HEAL · Berkah Cahaya',
    qty: 1,
    equipped: true,
  },
  Paladin: {
    id: 'wpn_paladin_starter',
    name: 'Dawnbreaker Warhammer',
    icon: '🔨',
    category: 'weapon',
    cls: 'Paladin',
    bonus: '+15 ATK / +15 DEF · Perisai Suci',
    qty: 1,
    equipped: true,
  },
}

export function starterInventoryForClass(cls: GuildClass): PlayerInventoryItem[] {
  return [
    { ...STARTER_WEAPON_BY_CLASS[cls] },
    {
      id: 'arm_guild_tunic',
      name: `Jubah Adventurer ${cls}`,
      icon: '👕',
      category: 'armor',
      cls,
      bonus: '+20 Max HP · +5 DEF',
      qty: 1,
      equipped: true,
    },
    {
      id: 'pot_heal_minor',
      name: 'Ramuan Penyembuh Desa',
      icon: '🧪',
      category: 'consumable',
      bonus: 'Pulihkan +45 HP saat digunakan',
      qty: 2,
      equipped: false,
    },
  ]
}

const DEFAULT_ACCOUNTS: PlayerAccount[] = [
  {
    instagram: 'wandertales.player',
    displayName: 'Arka Wanderer',
    pin: '123456',
    cls: 'Warrior',
    classLocked: true,
    follows: true,
    online: true,
    xp: 65,
    gold: 120,
    inventory: starterInventoryForClass('Warrior'),
    createdAt: new Date().toISOString(),
  },
  {
    instagram: 'lyra.guild',
    displayName: 'Lyra Starweaver',
    pin: '654321',
    cls: 'Mage',
    classLocked: true,
    follows: true,
    online: false,
    xp: 140,
    gold: 185,
    inventory: starterInventoryForClass('Mage'),
    createdAt: new Date().toISOString(),
  },
  {
    instagram: 'rowan.archer',
    displayName: 'Rowan Swiftbow',
    pin: '112233',
    cls: 'Archer',
    classLocked: true,
    follows: true,
    online: false,
    xp: 80,
    gold: 95,
    inventory: starterInventoryForClass('Archer'),
    createdAt: new Date().toISOString(),
  },
]

export function cleanIg(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 30)
}

export function generateRandomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function getPlayerAccounts(): PlayerAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(DEFAULT_ACCOUNTS))
      return [...DEFAULT_ACCOUNTS]
    }
    const parsed = JSON.parse(raw) as PlayerAccount[]
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(DEFAULT_ACCOUNTS))
      return [...DEFAULT_ACCOUNTS]
    }
    return parsed
  } catch {
    return [...DEFAULT_ACCOUNTS]
  }
}

export function savePlayerAccounts(list: PlayerAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function findPlayerAccount(instagramRaw: string): PlayerAccount | undefined {
  const ig = cleanIg(instagramRaw)
  if (!ig) return undefined
  return getPlayerAccounts().find((a) => a.instagram === ig)
}

export function upsertPlayerAccount(acc: PlayerAccount) {
  const list = getPlayerAccounts()
  const idx = list.findIndex((a) => a.instagram === acc.instagram)
  if (idx >= 0) list[idx] = acc
  else list.unshift(acc)
  savePlayerAccounts(list)
}

export function registerPlayerPin(
  instagramRaw: string,
  displayNameRaw?: string,
  cls: GuildClass = 'Warrior',
  customPin?: string,
): { ok: boolean; account?: PlayerAccount; error?: string } {
  const ig = cleanIg(instagramRaw)
  if (!ig) return { ok: false, error: 'Masukkan username Instagram yang valid.' }
  const pin = customPin && /^\d{6}$/.test(customPin.trim()) ? customPin.trim() : generateRandomPin()
  const list = getPlayerAccounts()
  const existing = list.find((a) => a.instagram === ig)
  if (existing) {
    existing.pin = pin
    if (displayNameRaw?.trim()) existing.displayName = displayNameRaw.trim().slice(0, 24)
    existing.follows = true
    savePlayerAccounts(list)
    return { ok: true, account: existing }
  }
  const validCls: GuildClass = (CLASSES as readonly string[]).includes(cls) ? cls : 'Warrior'
  const displayName = (displayNameRaw?.trim() || validCls).slice(0, 24)
  const newAcc: PlayerAccount = {
    instagram: ig,
    displayName,
    pin,
    cls: validCls,
    classLocked: false, // Player can confirm/lock their permanent class once
    follows: true,
    online: false,
    xp: 45,
    gold: 100,
    inventory: starterInventoryForClass(validCls),
    createdAt: new Date().toISOString(),
  }
  list.unshift(newAcc)
  savePlayerAccounts(list)
  return { ok: true, account: newAcc }
}

export function removePlayerAccount(instagramRaw: string) {
  const ig = cleanIg(instagramRaw)
  const list = getPlayerAccounts().filter((a) => a.instagram !== ig)
  savePlayerAccounts(list)
}

export function regeneratePlayerPin(instagramRaw: string): string | null {
  const ig = cleanIg(instagramRaw)
  const list = getPlayerAccounts()
  const target = list.find((a) => a.instagram === ig)
  if (!target) return null
  target.pin = generateRandomPin()
  savePlayerAccounts(list)
  return target.pin
}

export function verifyPlayerLogin(
  instagramRaw: string,
  pinRaw: string,
  confirmedFollow = true,
): { ok: boolean; account?: PlayerAccount; error?: string } {
  const ig = cleanIg(instagramRaw)
  const pin = pinRaw.trim()
  if (!ig) {
    return { ok: false, error: 'Masukkan username Instagram kamu terlebih dahulu.' }
  }
  if (!confirmedFollow) {
    return { ok: false, error: 'Wajib follow Instagram @wandertales.guild terlebih dahulu untuk bisa login!' }
  }
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, error: 'PIN harus berupa 6 digit angka dari balasan DM @wandertales.guild.' }
  }
  const list = getPlayerAccounts()
  const acc = list.find((a) => a.instagram === ig)
  if (!acc) {
    return {
      ok: false,
      error: `Username @${ig} belum terdaftar di database Guild! Silakan Follow & kirim DM ke @wandertales.guild dengan format "DAFTAR" untuk mendapatkan PIN 6 digit.`,
    }
  }
  if (!acc.follows) {
    return {
      ok: false,
      error: `Akun @${ig} terdeteksi belum follow @wandertales.guild. Wajib follow terlebih dahulu!`,
    }
  }
  if (acc.pin !== pin) {
    return {
      ok: false,
      error: 'PIN 6 digit tidak sesuai! Periksa kembali PIN dari DM @wandertales.guild.',
    }
  }
  acc.online = true
  savePlayerAccounts(list)
  return { ok: true, account: acc }
}

export function getGmCredentials(): { email: string; password: string } {
  try {
    const raw = localStorage.getItem(GM_CRED_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.email && parsed?.password) return parsed
    }
  } catch {
    /* ignore */
  }
  return { email: 'gm@wandertales.guild', password: 'admin123' }
}

export function verifyGmLogin(emailRaw: string, passwordRaw: string): { ok: boolean; error?: string } {
  const email = emailRaw.trim().toLowerCase()
  const password = passwordRaw.trim()
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Masukkan alamat email GM yang valid.' }
  }
  if (!password) {
    return { ok: false, error: 'Masukkan password GM.' }
  }
  const saved = getGmCredentials()
  // Accept default GM credentials or any custom saved GM credentials
  if (
    (email === saved.email.toLowerCase() && password === saved.password) ||
    (email === 'admin@wandertales.guild' && password === 'admin123') ||
    (email === 'gm@wandertales.com' && password === 'wandertales')
  ) {
    return { ok: true }
  }
  return {
    ok: false,
    error: 'Email atau password Guild Master tidak sesuai dengan akun yang terdaftar.',
  }
}

export function getPlayerTotalStats(loggedInstagram: string | null, isDemoPlayer: boolean): {
  online: number
  offline: number
  total: number
} {
  const accounts = getPlayerAccounts()
  const communityCount = RESIDENTS.filter((r) => !r.mock).length
  const totalBase = Math.max(accounts.length, communityCount)
  let online = accounts.filter((a) => a.online || a.instagram === loggedInstagram).length
  if (isDemoPlayer) online = Math.max(1, online)
  if (online === 0) online = 1 // Current active player/GM in session
  const total = Math.max(totalBase, online)
  const offline = Math.max(0, total - online)
  return { online, offline, total }
}

// ---------- CLASS-SPECIFIC PROGRESSIVE QUEST SYSTEM ----------

interface ClassQuestBlueprint {
  titleBase: string
  descBase: string
  objectiveLabel: string
  objectiveType: QuestObjectiveType
  baseTarget: number
  targetPerLevel: number
  baseXp: number
  baseGold: number
  rewardName: string
  rewardIcon: string
  rewardCategory: 'weapon' | 'armor' | 'consumable' | 'relic'
  rewardBonusBase: string
}

const CLASS_QUEST_BLUEPRINTS: Record<GuildClass, ClassQuestBlueprint[]> = {
  Warrior: [
    {
      titleBase: 'Besi Garis Depan: Basmi Slime Liar',
      descBase: 'Sebagai Warrior pelindung desa, bersihkan monster Slime yang mengancam perbatasan luar desa.',
      objectiveLabel: 'Kalahkan Monster Slime',
      objectiveType: 'kill_slime',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 55,
      baseGold: 45,
      rewardName: 'Baja Pelindung Vanguard',
      rewardIcon: '🛡️',
      rewardCategory: 'armor',
      rewardBonusBase: '+12 DEF · Ketahanan Warrior',
    },
    {
      titleBase: 'Tebasan Pedang Baja: Hancurkan Pasukan Goblin',
      descBase: 'Hadapi para perampok Goblin di perbukitan biome menggunakan kekuatan pedang Warrior.',
      objectiveLabel: 'Kalahkan Monster Goblin',
      objectiveType: 'kill_goblin',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 75,
      baseGold: 65,
      rewardName: 'Pedang Raya Crimson',
      rewardIcon: '⚔️',
      rewardCategory: 'weapon',
      rewardBonusBase: '+22 ATK · Crit Tebasan',
    },
    {
      titleBase: 'Ekspedisi Penakluk: Taklukkan Boss Dungeon',
      descBase: 'Pimpin penyerbuan ke dalam salah satu Dungeon Biome dan tumbangkan Boss penjaganya!',
      objectiveLabel: 'Raid & Menangkan Dungeon Biome',
      objectiveType: 'raid_dungeon',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 110,
      baseGold: 95,
      rewardName: 'Lambang Keberanian Titan',
      rewardIcon: '🏅',
      rewardCategory: 'relic',
      rewardBonusBase: '+35 Max HP · +10 ATK',
    },
  ],
  Mage: [
    {
      titleBase: 'Riset Alkimia Mana: Ekstrak Inti Slime',
      descBase: 'Sebagai Mage, kumpulkan esensi sihir dengan mengalahkan monster Slime di luar desa.',
      objectiveLabel: 'Kalahkan Monster Slime',
      objectiveType: 'kill_slime',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 55,
      baseGold: 45,
      rewardName: 'Elixir Mana Bintang',
      rewardIcon: '🧪',
      rewardCategory: 'consumable',
      rewardBonusBase: 'Pulihkan +60 HP & Fokus Sihir',
    },
    {
      titleBase: 'Badai Arcane: Usir Monster Biome',
      descBase: 'Uji mantra kehancuranmu dengan mengalahkan monster yang berkeliaran di wilayah Biome.',
      objectiveLabel: 'Kalahkan Monster Apa Saja',
      objectiveType: 'kill_any',
      baseTarget: 2,
      targetPerLevel: 1,
      baseXp: 80,
      baseGold: 70,
      rewardName: 'Tongkat Kristal Pyromancer',
      rewardIcon: '🪄',
      rewardCategory: 'weapon',
      rewardBonusBase: '+26 MATK · Ledakan Sihir',
    },
    {
      titleBase: 'Segel Kuno: Penaklukan Dungeon Sihir',
      descBase: 'Masuki Dungeon Biome untuk menyerap energi artefak kuno dari Boss Dungeon.',
      objectiveLabel: 'Raid & Menangkan Dungeon Biome',
      objectiveType: 'raid_dungeon',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 115,
      baseGold: 100,
      rewardName: 'Jubah Agung Archmage',
      rewardIcon: '👘',
      rewardCategory: 'armor',
      rewardBonusBase: '+30 MATK · +25 Max HP',
    },
  ],
  Archer: [
    {
      titleBase: 'Bidikan Elang: Buru Pengintai Goblin',
      descBase: 'Sebagai Archer penjelajah, hentikan pergerakan Goblin sebelum mereka mendekati jembatan desa.',
      objectiveLabel: 'Kalahkan Monster Goblin',
      objectiveType: 'kill_goblin',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 60,
      baseGold: 50,
      rewardName: 'Anak Panah Angin Zamrud',
      rewardIcon: '🏹',
      rewardCategory: 'weapon',
      rewardBonusBase: '+20 AGI · Tembakan Jarak Jauh',
    },
    {
      titleBase: 'Patroli Perbatasan Rimba & Pegunungan',
      descBase: 'Jelajahi daratan pulau dan pantau keamanan jalur menuju keempat Biome.',
      objectiveLabel: 'Jelajahi Jarak (Meter)',
      objectiveType: 'explore_distance',
      baseTarget: 80,
      targetPerLevel: 45,
      baseXp: 70,
      baseGold: 60,
      rewardName: 'Sepatu Boots Sylvan Ranger',
      rewardIcon: '🥾',
      rewardCategory: 'armor',
      rewardBonusBase: '+15 SPD · Langkah Senyap',
    },
    {
      titleBase: 'Panah Pemburu Boss: Serbu Dungeon Biome',
      descBase: 'Tembus pertahanan Boss Dungeon dengan bidikan presisi seorang Master Archer.',
      objectiveLabel: 'Raid & Menangkan Dungeon Biome',
      objectiveType: 'raid_dungeon',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 110,
      baseGold: 95,
      rewardName: 'Busur Naga Gletser',
      rewardIcon: '🏹',
      rewardCategory: 'weapon',
      rewardBonusBase: '+28 ATK · +15% Crit',
    },
  ],
  Rogue: [
    {
      titleBase: 'Operasi Senyap: Tumpas Bandit Goblin',
      descBase: 'Sebagai Rogue, menyelinap ke perbukitan luar desa dan kalahkan bandit Goblin.',
      objectiveLabel: 'Kalahkan Monster Goblin',
      objectiveType: 'kill_goblin',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 60,
      baseGold: 55,
      rewardName: 'Belati Kembar Obsidian',
      rewardIcon: '🗡️',
      rewardCategory: 'weapon',
      rewardBonusBase: '+24 CRIT · Serangan Kilat',
    },
    {
      titleBase: 'Jaringan Intelijen: Kumpulkan Informasi NPC',
      descBase: 'Ajak bicara warga desa atau NPC penjaga Biome untuk mengumpulkan kabar intelijen.',
      objectiveLabel: 'Bicara dengan Warga / NPC Biome',
      objectiveType: 'talk_npc',
      baseTarget: 2,
      targetPerLevel: 1,
      baseXp: 65,
      baseGold: 65,
      rewardName: 'Jubah Bayangan Malam',
      rewardIcon: '🧥',
      rewardCategory: 'armor',
      rewardBonusBase: '+18 EVA · Jubah Siluman',
    },
    {
      titleBase: 'Perburuan Harta Kuno: Raid Dungeon Biome',
      descBase: 'Masuki Dungeon Biome, kalahkan Boss penjaganya, dan rebut harta karun kuno!',
      objectiveLabel: 'Raid & Menangkan Dungeon Biome',
      objectiveType: 'raid_dungeon',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 115,
      baseGold: 110,
      rewardName: 'Cincin Emas Assassin',
      rewardIcon: '💍',
      rewardCategory: 'relic',
      rewardBonusBase: '+25 CRIT · Bonus Gold +15%',
    },
  ],
  Healer: [
    {
      titleBase: 'Kunjungan Kasih: Sapa & Periksa Warga / NPC',
      descBase: 'Sebagai Healer, datangi dan ajak bicara warga desa atau NPC Biome untuk menjaga semangat mereka.',
      objectiveLabel: 'Bicara dengan Warga / NPC Biome',
      objectiveType: 'talk_npc',
      baseTarget: 2,
      targetPerLevel: 1,
      baseXp: 55,
      baseGold: 45,
      rewardName: 'Ramuan Suci Sunbloom',
      rewardIcon: '🧪',
      rewardCategory: 'consumable',
      rewardBonusBase: 'Pulihkan +75 HP Seketika',
    },
    {
      titleBase: 'Pemurnian Alam: Bersihkan Slime Pengganggu',
      descBase: 'Murnikan jalur herbal di luar desa dengan mengalahkan monster Slime.',
      objectiveLabel: 'Kalahkan Monster Slime',
      objectiveType: 'kill_slime',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 70,
      baseGold: 60,
      rewardName: 'Tongkat Cahaya Seraphim',
      rewardIcon: '✨',
      rewardCategory: 'weapon',
      rewardBonusBase: '+24 HEAL · Regenerasi Aura',
    },
    {
      titleBase: 'Cahaya Penyelamat: Sucikan Dungeon Biome',
      descBase: 'Bawa cahaya penyucian ke dalam Dungeon Biome dan kalahkan Boss kegelapan.',
      objectiveLabel: 'Raid & Menangkan Dungeon Biome',
      objectiveType: 'raid_dungeon',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 110,
      baseGold: 95,
      rewardName: 'Mahkota Daun Zamrud',
      rewardIcon: '👑',
      rewardCategory: 'armor',
      rewardBonusBase: '+40 Max HP · +20 HEAL',
    },
  ],
  Paladin: [
    {
      titleBase: 'Sumpah Ksatria Suci: Basmi Monster Liar',
      descBase: 'Sebagai Paladin pelindung cahaya, kalahkan monster yang mengancam ketenangan pulau.',
      objectiveLabel: 'Kalahkan Monster Apa Saja',
      objectiveType: 'kill_any',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 60,
      baseGold: 50,
      rewardName: 'Perisai Emas Dawnlight',
      rewardIcon: '🛡️',
      rewardCategory: 'armor',
      rewardBonusBase: '+30 DEF · Blokir Serangan',
    },
    {
      titleBase: 'Patroli Penjaga Cahaya & Menyapa Warga',
      descBase: 'Berbicara dengan warga desa atau penjaga Biome untuk memastikan keamanan wilayah.',
      objectiveLabel: 'Bicara dengan Warga / NPC Biome',
      objectiveType: 'talk_npc',
      baseTarget: 2,
      targetPerLevel: 1,
      baseXp: 70,
      baseGold: 60,
      rewardName: 'Palu Suci Judgement',
      rewardIcon: '🔨',
      rewardCategory: 'weapon',
      rewardBonusBase: '+25 ATK · Cahaya Penghakiman',
    },
    {
      titleBase: 'Perang Suci: Taklukkan Boss Dungeon Biome',
      descBase: 'Hancurkan kekuatan jahat di dalam Dungeon Biome demi kejayaan Guild!',
      objectiveLabel: 'Raid & Menangkan Dungeon Biome',
      objectiveType: 'raid_dungeon',
      baseTarget: 1,
      targetPerLevel: 1,
      baseXp: 120,
      baseGold: 105,
      rewardName: 'Relik Sayap Paladin',
      rewardIcon: '🌟',
      rewardCategory: 'relic',
      rewardBonusBase: '+45 Max HP · +18 DEF',
    },
  ],
}

export function buildQuestsForClassAndLevel(cls: GuildClass, playerLevel: number, completedCount = 0): ClassQuest[] {
  const blueprints = CLASS_QUEST_BLUEPRINTS[cls] ?? CLASS_QUEST_BLUEPRINTS.Warrior
  const tier = Math.max(1, playerLevel + Math.floor(completedCount / 3))
  const scaleMult = 1 + (tier - 1) * 0.45

  return blueprints.map((bp, idx) => {
    const target = Math.max(1, Math.round(bp.baseTarget + (tier - 1) * bp.targetPerLevel))
    const rewardXp = Math.round(bp.baseXp * scaleMult)
    const rewardGold = Math.round(bp.baseGold * scaleMult)
    const roman = tier === 1 ? 'I' : tier === 2 ? 'II' : tier === 3 ? 'III' : tier === 4 ? 'IV' : `Lv.${tier}`
    return {
      id: `q_${cls.toLowerCase()}_t${tier}_${idx}`,
      cls,
      tier,
      minLevel: playerLevel,
      title: `${bp.titleBase} (${roman})`,
      description: bp.descBase,
      objectiveLabel: bp.objectiveLabel,
      objectiveType: bp.objectiveType,
      progress: 0,
      target,
      rewardXp,
      rewardGold,
      rewardItem: {
        id: `item_${cls.toLowerCase()}_t${tier}_${idx}`,
        name: `${bp.rewardName} +${tier}`,
        icon: bp.rewardIcon,
        category: bp.rewardCategory,
        cls,
        bonus: `${bp.rewardBonusBase} (Tier ${tier})`,
        qty: 1,
        equipped: false,
      },
    }
  })
}

export function buildNextQuestForSlot(
  cls: GuildClass,
  slotIndex: number,
  playerLevel: number,
  completedCount: number,
): ClassQuest {
  const blueprints = CLASS_QUEST_BLUEPRINTS[cls] ?? CLASS_QUEST_BLUEPRINTS.Warrior
  const bp = blueprints[slotIndex % blueprints.length]
  const tier = Math.max(1, playerLevel + Math.floor(completedCount / 2))
  const scaleMult = 1 + (tier - 1) * 0.5
  const target = Math.max(1, Math.round(bp.baseTarget + (tier - 1) * bp.targetPerLevel))
  const rewardXp = Math.round(bp.baseXp * scaleMult)
  const rewardGold = Math.round(bp.baseGold * scaleMult)
  const roman = tier === 1 ? 'I' : tier === 2 ? 'II' : tier === 3 ? 'III' : tier === 4 ? 'IV' : `Tier ${tier}`

  return {
    id: `q_${cls.toLowerCase()}_t${tier}_${slotIndex}_${Date.now()}`,
    cls,
    tier,
    minLevel: playerLevel,
    title: `${bp.titleBase} (${roman})`,
    description: bp.descBase,
    objectiveLabel: bp.objectiveLabel,
    objectiveType: bp.objectiveType,
    progress: 0,
    target,
    rewardXp,
    rewardGold,
    rewardItem: {
      id: `item_${cls.toLowerCase()}_t${tier}_${slotIndex}`,
      name: `${bp.rewardName} +${tier}`,
      icon: bp.rewardIcon,
      category: bp.rewardCategory,
      cls,
      bonus: `${bp.rewardBonusBase} (Tier ${tier})`,
      qty: 1,
      equipped: false,
    },
  }
}
