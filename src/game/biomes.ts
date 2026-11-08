// Biome settlements, Biome NPCs (NOT counted as village residents), and Biome Dungeons.
import { BUILDINGS, SOLIDS, WORLD_HALF, type BiomeRegion } from './map.ts'
import { collides } from './collision.ts'
import { lerpAngle, player } from './live.ts'
import { height, walkable } from './terrain.ts'
import { rng } from './scenery.ts'
import { changed, record, storageCap, town } from './town.ts'
import { chron } from './chronicle.ts'
import { playerLevelInfo, useGame } from './store.ts'
import type { Appearance } from './residents.mock.ts'
import type { Bundle, Resource } from './professions.ts'
import type { GuildClass } from './recruitment.ts'

export interface BiomeMeta {
  id: BiomeRegion
  name: string
  icon: string
  direction: string
  color: string
  description: string
}

export const BIOME_INFO: Record<BiomeRegion, BiomeMeta> = {
  snow: {
    id: 'snow',
    name: 'Tundra Gletser Es',
    icon: '❄️',
    direction: 'Barat',
    color: '#6bb8e8',
    description: 'Daratan salju abadi di balik Pegunungan Es Barat, rumah para pemburu salju dan pandai rune.',
  },
  ash: {
    id: 'ash',
    name: 'Dataran Abu Vulkanik',
    icon: '🌋',
    direction: 'Timur',
    color: '#e06a3b',
    description: 'Hamparan basal dan abu panas di balik Gunung Berapi Timur, tempat penempa obsidian dan penyihir api.',
  },
  sand: {
    id: 'sand',
    name: 'Padang Gurun Matahari',
    icon: '🏜️',
    direction: 'Selatan',
    color: '#e0b252',
    description: 'Gurun pasir emas dengan oase alami dan reruntuhan piramida kuno di balik Pegunungan Selatan.',
  },
  lush: {
    id: 'lush',
    name: 'Hutan Purba Zamrud',
    icon: '🌿',
    direction: 'Utara',
    color: '#52b868',
    description: 'Rimba belantara lebat dan Telaga Zamrud di balik Pegunungan Utara yang dijaga para druid.',
  },
}

export interface DungeonInfo {
  id: string
  name: string
  biome: BiomeRegion
  boss: string
  difficulty: 1 | 2 | 3 | 4 | 5
  recLevel: number
  gold: number
  xp: number
  goods: Bundle
  lore: string
}

export const DUNGEONS: Record<string, DungeonInfo> = {
  dungeon_ice: {
    id: 'dungeon_ice',
    name: '❄️ Glacial Cavern Dungeon',
    biome: 'snow',
    boss: 'Frost Wyrm Skadi',
    difficulty: 3,
    recLevel: 2,
    gold: 120,
    xp: 75,
    goods: { stone: 14, iron: 6, potion: 1 },
    lore: 'Lorong es berkilau yang menembus jantung gletser barat. Di dasarnya tertidur naga es purba.',
  },
  dungeon_volcano: {
    id: 'dungeon_volcano',
    name: '🌋 Magma Citadel Dungeon',
    biome: 'ash',
    boss: 'Ignis Behemoth',
    difficulty: 5,
    recLevel: 3,
    gold: 185,
    xp: 110,
    goods: { iron: 12, weapons: 2, stone: 10 },
    lore: 'Benteng obsidian kuno yang dikelilingi sungai lava mendidih di balik kawah gunung berapi timur.',
  },
  dungeon_sand: {
    id: 'dungeon_sand',
    name: '🏜️ Sunken Pyramid Dungeon',
    biome: 'sand',
    boss: 'Pharaoh Sentinel Anubis',
    difficulty: 4,
    recLevel: 2,
    gold: 155,
    xp: 90,
    goods: { furniture: 2, potion: 2, stone: 12 },
    lore: 'Piramida raja gurun yang terkubur badai pasir selama ribuan tahun, penuh harta karun dan jebakan kuno.',
  },
  dungeon_lush: {
    id: 'dungeon_lush',
    name: '🌿 Ancient Ruins Dungeon',
    biome: 'lush',
    boss: 'Elder Treant Sylvanus',
    difficulty: 2,
    recLevel: 1,
    gold: 95,
    xp: 65,
    goods: { wood: 18, herbs: 10, potion: 1 },
    lore: 'Kuil batu berlumut yang dijaga oleh roh pohon raksasa dan makhluk-makhluk hutan utara.',
  },
}

/** Cooldown timestamps (game minutes) per dungeon so raids feel rewarding. */
export const dungeonState: Record<string, { lastClearedAt: number; clears: number }> = {
  dungeon_ice: { lastClearedAt: -999, clears: 0 },
  dungeon_volcano: { lastClearedAt: -999, clears: 0 },
  dungeon_sand: { lastClearedAt: -999, clears: 0 },
  dungeon_lush: { lastClearedAt: -999, clears: 0 },
}

export function raidDungeon(dungeonId: string): { ok: boolean; message: string } {
  const d = DUNGEONS[dungeonId]
  if (!d) return { ok: false, message: 'Dungeon tidak ditemukan.' }
  const s = useGame.getState()
  const st = dungeonState[dungeonId] ?? (dungeonState[dungeonId] = { lastClearedAt: -999, clears: 0 })
  const cooldown = 60 // 1 game hour cooldown
  if (s.time - st.lastClearedAt < cooldown) {
    const waitMin = Math.ceil(cooldown - (s.time - st.lastClearedAt))
    return { ok: false, message: `⏳ Dungeon masih memulihkan segelnya (${waitMin} menit game lagi).` }
  }
  st.lastClearedAt = s.time
  st.clears++

  const lv = playerLevelInfo(s.playerXp).level
  const bonus = 1 + Math.max(0, lv - 1) * 0.1
  const goldWon = Math.round(d.gold * bonus)
  town.gold += goldWon
  record('quest', goldWon, `Cleared ${d.name} (Boss: ${d.boss})`, s.time)

  const lootText: string[] = []
  for (const [k, v] of Object.entries(d.goods)) {
    const qty = v ?? 0
    if (qty > 0) {
      town.stock[k as Resource] = Math.min(storageCap(), town.stock[k as Resource] + qty)
      lootText.push(`+${qty} ${k}`)
    }
  }
  s.gainXp(d.xp)
  s.recordQuestProgress('raid_dungeon', 1)
  chron(s.time, 'quest', '🗝️', `${s.playerName || 'Guild Master'} menaklukkan ${d.name} (${d.boss})! +${goldWon} gold, +${d.xp} EXP.`)
  changed()
  useGame.setState((prev) => ({ rev: prev.rev + 1 }))
  const msg = `⚔️ ${d.boss} dikalahkan! +${goldWon} 🪙 Gold, +${d.xp} ⭐ EXP${lootText.length ? `, ${lootText.join(', ')}` : ''}`
  s.notify(msg)
  return { ok: true, message: msg }
}

// ---------- BIOME NPCs (NOT counted as village residents!) ----------

export interface BiomeNpc {
  id: string
  name: string
  title: string
  biome: BiomeRegion
  homeBuildingId: string
  homeX: number
  homeZ: number
  cls: GuildClass
  appearance: Appearance
  lines: string[]
}

export const BIOME_NPCS: BiomeNpc[] = [
  // West Snow Biome NPCs
  {
    id: 'bnpc_brynjar',
    name: 'Brynjar Frostshield',
    title: 'Penjaga Gletser Barat',
    biome: 'snow',
    homeBuildingId: 'dungeon_ice',
    homeX: -290,
    homeZ: -4,
    cls: 'Paladin',
    appearance: { skin: '#f5d6c6', hair: '#d8e4f0', hairStyle: 'long', shirt: '#3a6a9c', pants: '#2a3644', height: 1.04 },
    lines: [
      'Angin dari Glacial Cavern semakin dingin akhir-akhir ini. Hati-hati jika ingin menantang Frost Wyrm!',
      'Kami para penjaga es tinggal di tundra barat ini untuk menjaga segel gletser kuno.',
      'Danau Gletser di utara pondok kami airnya sangat jernih meski dikelilingi salju abadi.',
    ],
  },
  {
    id: 'bnpc_freya',
    name: 'Freya Snowbloom',
    title: 'Peramu Salju',
    biome: 'snow',
    homeBuildingId: 'snow_lodge',
    homeX: -270,
    homeZ: 17,
    cls: 'Healer',
    appearance: { skin: '#f7d7c4', hair: '#e8c068', hairStyle: 'bun', shirt: '#eef4fa', pants: '#4a607a', height: 0.98 },
    lines: [
      'Selamat datang di Frostpeak Lodge! Hangatkan dirimu di dekat perapian sebelum melanjutkan perjalanan.',
      'Bunga es yang tumbuh di belakang pegunungan barat ini bisa diracik menjadi ramuan pelindung dingin.',
      'Kami bukan penduduk desa tengah, tapi kami selalu senang menerima kunjungan Guild Master!',
    ],
  },
  {
    id: 'bnpc_torvald',
    name: 'Torvald Runeforge',
    title: 'Pandai Rune Es',
    biome: 'snow',
    homeBuildingId: 'snow_forge',
    homeX: -278,
    homeZ: 22,
    cls: 'Warrior',
    appearance: { skin: '#e8b89a', hair: '#7a4a2a', hairStyle: 'short', shirt: '#2f4f6f', pants: '#2d2926', height: 1.05 },
    lines: [
      'Baja biasa akan retak di suhu sedingin ini. Di bengkel ini, kuukir rune es pada setiap bilah pedang.',
      'Jika kamu berhasil mengalahkan penjaga Glacial Cavern, bawa bijih besinya kemari!',
    ],
  },

  // East Volcano / Ash Biome NPCs
  {
    id: 'bnpc_valkor',
    name: 'Valkor Ashblade',
    title: 'Penjaga Benteng Magma',
    biome: 'ash',
    homeBuildingId: 'dungeon_volcano',
    homeX: 292,
    homeZ: 10,
    cls: 'Warrior',
    appearance: { skin: '#c68642', hair: '#2a2220', hairStyle: 'spiky', shirt: '#8a2e22', pants: '#2b2628', height: 1.05 },
    lines: [
      'Di balik gerbang Magma Citadel ini, Ignis Behemoth menguasai lautan api.',
      'Tanah abu di belakang gunung berapi ini keras, tapi kaya akan bijih besi dan batu obsidian.',
      'Pastikan level dan perlengkapanmu siap sebelum memasuki Magma Citadel Dungeon!',
    ],
  },
  {
    id: 'bnpc_ignis',
    name: 'Pyra Ignis',
    title: 'Penyihir Kristal Api',
    biome: 'ash',
    homeBuildingId: 'ash_sanctum',
    homeX: 268,
    homeZ: 28,
    cls: 'Mage',
    appearance: { skin: '#f1c27d', hair: '#c83e2b', hairStyle: 'long', shirt: '#5c2638', pants: '#2f242c', height: 0.99 },
    lines: [
      'Energi panas bumi di dataran timur ini luar biasa untuk penelitian alkimia api.',
      'Dari puncak gunung berapi, kamu bisa melihat kawah lava yang menyala siang dan malam.',
    ],
  },
  {
    id: 'bnpc_kaelen',
    name: 'Kaelen Obsidian',
    title: 'Master Peleburan',
    biome: 'ash',
    homeBuildingId: 'ash_foundry',
    homeX: 278,
    homeZ: -10,
    cls: 'Rogue',
    appearance: { skin: '#8d5524', hair: '#3a3230', hairStyle: 'short', shirt: '#4a3c38', pants: '#242022', height: 1.02 },
    lines: [
      'Kami melebur batu obsidian langsung dengan panas kawah timur.',
      'Jembatan kayu di sungai memudahkan pengelana menyeberang dari desa ke tanah vulkanik ini.',
    ],
  },

  // South Desert / Sand Biome NPCs
  {
    id: 'bnpc_zahara',
    name: 'Zahara Sunweaver',
    title: 'Pemimpin Kafilah Gurun',
    biome: 'sand',
    homeBuildingId: 'sand_bazaar',
    homeX: -18,
    homeZ: 266,
    cls: 'Rogue',
    appearance: { skin: '#c68642', hair: '#1c1815', hairStyle: 'long', shirt: '#d99b26', pants: '#5e3a24', height: 0.99 },
    lines: [
      'Selamat datang di Sunstone Caravanserai! Air di Oase Gurun sebelah barat sangat menyegarkan.',
      'Kafilah kami berdagang rempah dan barang antik yang ditemukan di sekitar gurun selatan.',
    ],
  },
  {
    id: 'bnpc_rashid',
    name: 'Rashid Dunechaser',
    title: 'Penjelajah Padang Pasir',
    biome: 'sand',
    homeBuildingId: 'sand_camp',
    homeX: 12,
    homeZ: 270,
    cls: 'Archer',
    appearance: { skin: '#b87638', hair: '#322218', hairStyle: 'spiky', shirt: '#c87a28', pants: '#4a3828', height: 1.02 },
    lines: [
      'Angin gurun sering menyingkap jalan rahasia menuju Sunken Pyramid Dungeon di selatan.',
      'Kalau kamu mendaki bukit batu pasir, pemandangannya membentang sampai ke laut selatan!',
    ],
  },
  {
    id: 'bnpc_azir',
    name: 'Azir Goldwatcher',
    title: 'Penjaga Makam Kuno',
    biome: 'sand',
    homeBuildingId: 'dungeon_sand',
    homeX: 6,
    homeZ: 295,
    cls: 'Paladin',
    appearance: { skin: '#8d5524', hair: '#f0d060', hairStyle: 'short', shirt: '#c99a2e', pants: '#3b2e22', height: 1.04 },
    lines: [
      'Sunken Pyramid menyimpan harta raja kuno, namun Pharaoh Sentinel tidak akan membiarkan siapa pun lewat dengan mudah.',
      'Masuklah ke piramida jika kamu berani menguji kekuatanmu, Guild Master!',
    ],
  },

  // North Lush Forest Biome NPCs
  {
    id: 'bnpc_lyra',
    name: 'Lyra Whisperwind',
    title: 'Druid Telaga Zamrud',
    biome: 'lush',
    homeBuildingId: 'lush_circle',
    homeX: -26,
    homeZ: -288,
    cls: 'Healer',
    appearance: { skin: '#f5d0b8', hair: '#3e7a48', hairStyle: 'long', shirt: '#3a7a4c', pants: '#3b2e22', height: 0.98 },
    lines: [
      'Dengarkan gemericik air Telaga Zamrud dan kicauan burung-burung yang terbang di atas kanopi hutan.',
      'Hutan purba utara ini penuh dengan tanaman herbal langka yang tumbuh subur di balik gunung.',
    ],
  },
  {
    id: 'bnpc_rowan',
    name: 'Rowan Oakheart',
    title: 'Kapten Penjaga Hutan',
    biome: 'lush',
    homeBuildingId: 'lush_lodge',
    homeX: -18,
    homeZ: -261,
    cls: 'Archer',
    appearance: { skin: '#e8b89a', hair: '#6b4226', hairStyle: 'short', shirt: '#2f683b', pants: '#3a2e24', height: 1.03 },
    lines: [
      'Para penjaga hutan memantau seluruh perbatasan utara dari Sylvan Ranger Lodge.',
      'Kamu bisa menjelajahi setiap sudut hutan ini hingga ke tepi pantai utara pulau.',
    ],
  },
  {
    id: 'bnpc_ellowen',
    name: 'Ellowen Mossgaze',
    title: 'Peneliti Reruntuhan Kuno',
    biome: 'lush',
    homeBuildingId: 'dungeon_lush',
    homeX: 10,
    homeZ: -290,
    cls: 'Mage',
    appearance: { skin: '#f7d7c4', hair: '#9c5a3c', hairStyle: 'bun', shirt: '#486b52', pants: '#2d3830', height: 0.97 },
    lines: [
      'Ancient Ruins Dungeon ini dulunya adalah kuil zaman pertama sebelum akar-akar raksasa menyelimutinya.',
      'Elder Treant di dalamnya menjaga kayu purba dan kristal herbal yang sangat berharga!',
    ],
  },
]

export interface BiomeNpcLiveState {
  x: number
  z: number
  y: number
  facing: number
  mode: 'idle' | 'walk'
  targetX: number
  targetZ: number
  wait: number
  bubble: string
  bubbleUntil: number
  talkIndex: number
}

export const biomeNpcLive: Record<string, BiomeNpcLiveState> = {}

for (let i = 0; i < BIOME_NPCS.length; i++) {
  const n = BIOME_NPCS[i]
  biomeNpcLive[n.id] = {
    x: n.homeX,
    z: n.homeZ,
    y: Math.max(0, height(n.homeX, n.homeZ)),
    facing: 0,
    mode: 'idle',
    targetX: n.homeX,
    targetZ: n.homeZ,
    wait: 1 + (i % 4),
    bubble: '',
    bubbleUntil: 0,
    talkIndex: 0,
  }
}

export const getBiomeNpc = (id: string) => BIOME_NPCS.find((n) => n.id === id)

const npcRng = rng(777)

/** Step one Biome NPC's gentle patrol around their biome outpost. */
export function stepBiomeNpc(npc: BiomeNpc, rawDt: number): BiomeNpcLiveState {
  const dt = Math.min(rawDt, 0.1)
  const st = biomeNpcLive[npc.id]
  const distPlayer = Math.hypot(player.pos.x - st.x, player.pos.z - st.z)

  // If the player is right next to this NPC, pause and face the player
  if (distPlayer < 2.8) {
    st.mode = 'idle'
    st.facing = lerpAngle(st.facing, Math.atan2(player.pos.x - st.x, player.pos.z - st.z), 1 - Math.exp(-dt * 8))
    st.y = Math.max(0, height(st.x, st.z))
    return st
  }

  const dx = st.targetX - st.x, dz = st.targetZ - st.z
  const d = Math.hypot(dx, dz)
  if (d < 0.25) {
    st.mode = 'idle'
    if ((st.wait -= dt) <= 0) {
      st.wait = 2.5 + npcRng() * 4.5
      // Pick a nearby stroll point around homeX/homeZ that isn't inside a building
      for (let tries = 0; tries < 8; tries++) {
        const a = npcRng() * Math.PI * 2, r = 1.5 + npcRng() * 5.5
        const tx = npc.homeX + Math.cos(a) * r
        const tz = npc.homeZ + Math.sin(a) * r
        if (walkable(tx, tz) && !collides(tx, tz, 0.6, SOLIDS, WORLD_HALF)) {
          st.targetX = tx
          st.targetZ = tz
          break
        }
      }
    }
  } else {
    st.mode = 'walk'
    const speed = 1.25
    const step = Math.min(d, speed * dt)
    const nx = st.x + (dx / d) * step
    const nz = st.z + (dz / d) * step
    if (walkable(nx, nz) && !collides(nx, nz, 0.45, SOLIDS, WORLD_HALF)) {
      st.x = nx
      st.z = nz
    } else {
      st.targetX = st.x
      st.targetZ = st.z
    }
    st.facing = lerpAngle(st.facing, Math.atan2(dx, dz), 1 - Math.exp(-dt * 8))
  }

  // Keep Biome NPCs from overlapping each other
  for (const other of BIOME_NPCS) {
    if (other.id === npc.id) continue
    const ost = biomeNpcLive[other.id]
    const ox = st.x - ost.x, oz = st.z - ost.z, od = Math.hypot(ox, oz)
    if (od > 0.001 && od < 1.5) {
      const push = (1.5 - od) * dt * 3
      const px = st.x + (ox / od) * push, pz = st.z + (oz / od) * push
      if (walkable(px, pz) && !collides(px, pz, 0.45, SOLIDS, WORLD_HALF)) {
        st.x = px
        st.z = pz
      }
    }
  }

  st.y = Math.max(0, height(st.x, st.z))
  return st
}

export function talkWithBiomeNpc(id: string): string | undefined {
  const npc = getBiomeNpc(id)
  const st = biomeNpcLive[id]
  if (!npc || !st) return undefined
  const line = npc.lines[st.talkIndex % npc.lines.length]
  st.talkIndex++
  st.bubble = '💬'
  st.bubbleUntil = performance.now() + 3500
  const g = useGame.getState()
  g.gainXp(15)
  g.recordQuestProgress('talk_npc', 1)
  g.select({ type: 'biomeNpc', id })
  g.notify(`${npc.name}: “${line}” (+15 EXP)`)
  return line
}

export function biomeBuildingsOf(biome: BiomeRegion) {
  return BUILDINGS.filter((b) => b.biomeRegion === biome)
}

// ---------- MONSTERS ACROSS ALL BIOMES (Low-level Slimes, Goblins, Wolves + Giant Mountain Monsters) ----------
// Spread widely across the island (minimum 65m–110m apart from each other) and always outside the main village.
// Approaching a monster triggers automatic monster aggro & attacks!

export type MonsterSpecies =
  | 'slime'
  | 'goblin'
  | 'dire_wolf'
  | 'yeti'
  | 'ice_golem'
  | 'magma_brute'
  | 'pyro_drake'
  | 'sand_colossus'
  | 'scorpion'
  | 'moss_treant'
  | 'forest_stalker'

export interface MountainMonster {
  id: string
  name: string
  species: MonsterSpecies
  biome: BiomeRegion
  level: number
  maxHp: number
  /** Damage dealt to the player when the monster attacks automatically */
  damage: number
  /** Visual scale multiplier (> 1.55 so every monster is larger than the player character) */
  scale: number
  homeX: number
  homeZ: number
  gold: number
  xp: number
  drop: [Resource, number]
  description: string
}

export const MOUNTAIN_MONSTERS: MountainMonster[] = [
  // ---- A. LOW-LEVEL MONSTERS (Lv 1–2: Slime, Goblin, Dire Wolf — spread widely across outer hills & biome borders) ----
  {
    id: 'mon_slime_meadow',
    name: 'Green Meadow Slime',
    species: 'slime',
    biome: 'lush',
    level: 1,
    maxHp: 65,
    damage: 10,
    scale: 1.58,
    homeX: -108,
    homeZ: -22,
    gold: 18,
    xp: 22,
    drop: ['herbs', 3],
    description: 'Monster Slime hijau kenyal berukuran besar di perbukitan barat luar desa. Otomatis menyerang jika didekati!',
  },
  {
    id: 'mon_slime_aqua',
    name: 'Blue Riverbank Slime',
    species: 'slime',
    biome: 'snow',
    level: 1,
    maxHp: 70,
    damage: 11,
    scale: 1.6,
    homeX: -124,
    homeZ: -152,
    gold: 20,
    xp: 24,
    drop: ['fish', 3],
    description: 'Slime air biru dingin yang melompat-lompat di padang rumput barat laut.',
  },
  {
    id: 'mon_goblin_scout',
    name: 'Goblin Scout',
    species: 'goblin',
    biome: 'sand',
    level: 1,
    maxHp: 80,
    damage: 13,
    scale: 1.68,
    homeX: -102,
    homeZ: 96,
    gold: 25,
    xp: 28,
    drop: ['wood', 5],
    description: 'Pengintai Goblin bersenjata gada kayu yang mengintai di perbukitan barat daya luar desa.',
  },
  {
    id: 'mon_goblin_raider',
    name: 'Goblin Clubber',
    species: 'goblin',
    biome: 'ash',
    level: 1,
    maxHp: 85,
    damage: 14,
    scale: 1.7,
    homeX: 118,
    homeZ: 84,
    gold: 28,
    xp: 30,
    drop: ['stone', 5],
    description: 'Perampok Goblin agresif yang berpatroli di seberang sungai tenggara.',
  },
  {
    id: 'mon_wolf_meadow',
    name: 'Timber Shadow Wolf',
    species: 'dire_wolf',
    biome: 'lush',
    level: 1,
    maxHp: 80,
    damage: 13,
    scale: 1.68,
    homeX: 116,
    homeZ: -78,
    gold: 24,
    xp: 28,
    drop: ['vegetables', 4],
    description: 'Serigala liar bertubuh besar dengan taring tajam di padang timur laut.',
  },
  {
    id: 'mon_slime_amber',
    name: 'Golden Honey Slime',
    species: 'slime',
    biome: 'sand',
    level: 1,
    maxHp: 75,
    damage: 12,
    scale: 1.62,
    homeX: 16,
    homeZ: 126,
    gold: 22,
    xp: 25,
    drop: ['wheat', 5],
    description: 'Slime kuning keemasan raksasa yang menghuni lembah selatan menuju gurun.',
  },

  // ---- B. NORTH LUSH FOREST & MOUNTAIN BIOME (Spread widely across the northern expanse) ----
  {
    id: 'mon_slime_moss',
    name: 'Forest Moss Slime',
    species: 'slime',
    biome: 'lush',
    level: 2,
    maxHp: 90,
    damage: 14,
    scale: 1.65,
    homeX: -195,
    homeZ: -215,
    gold: 30,
    xp: 32,
    drop: ['herbs', 5],
    description: 'Slime lumut zamrud di perbatasan barat Hutan Purba Utara.',
  },
  {
    id: 'mon_goblin_forest',
    name: 'Sylvan Goblin Raider',
    species: 'goblin',
    biome: 'lush',
    level: 2,
    maxHp: 100,
    damage: 16,
    scale: 1.74,
    homeX: 185,
    homeZ: -205,
    gold: 35,
    xp: 36,
    drop: ['wood', 7],
    description: 'Goblin pemburu hutan yang bersembunyi di kaki bukit timur laut.',
  },
  {
    id: 'mon_treant_1',
    name: 'Elder Moss Treant',
    species: 'moss_treant',
    biome: 'lush',
    level: 3,
    maxHp: 135,
    damage: 19,
    scale: 2.05,
    homeX: -38,
    homeZ: -206,
    gold: 46,
    xp: 45,
    drop: ['wood', 10],
    description: 'Monster pohon purba raksasa berlumut zamrud yang berjaga di Pegunungan Hutan Utara.',
  },
  {
    id: 'mon_stalker_1',
    name: 'Horned Jungle Behemoth',
    species: 'forest_stalker',
    biome: 'lush',
    level: 3,
    maxHp: 130,
    damage: 18,
    scale: 1.9,
    homeX: 98,
    homeZ: -222,
    gold: 44,
    xp: 44,
    drop: ['herbs', 7],
    description: 'Monster buas bertanduk besar yang mengintai di punggung timur Pegunungan Utara.',
  },
  {
    id: 'mon_treant_2',
    name: 'Heartwood Behemoth',
    species: 'moss_treant',
    biome: 'lush',
    level: 4,
    maxHp: 155,
    damage: 22,
    scale: 2.15,
    homeX: -168,
    homeZ: -318,
    gold: 56,
    xp: 52,
    drop: ['wood', 12],
    description: 'Penjaga hutan raksasa dengan mahkota tanduk kayu di pedalaman barat laut hutan purba.',
  },
  {
    id: 'mon_stalker_2',
    name: 'Emerald Sylvan Beast',
    species: 'forest_stalker',
    biome: 'lush',
    level: 3,
    maxHp: 140,
    damage: 20,
    scale: 1.95,
    homeX: 152,
    homeZ: -324,
    gold: 50,
    xp: 48,
    drop: ['herbs', 8],
    description: 'Monster penjaga rimba purba berukuran besar dengan mata zamrud menyala di pesisir utara.',
  },

  // ---- C. SOUTH SANDSTONE MOUNTAIN & DESERT BIOME (Spread widely across the southern expanse) ----
  {
    id: 'mon_slime_sand',
    name: 'Dune Sand Slime',
    species: 'slime',
    biome: 'sand',
    level: 2,
    maxHp: 92,
    damage: 15,
    scale: 1.66,
    homeX: -188,
    homeZ: 198,
    gold: 32,
    xp: 34,
    drop: ['stone', 5],
    description: 'Slime pasir gurun yang menyerap batu kuarsa panas di barat daya gurun.',
  },
  {
    id: 'mon_goblin_sand',
    name: 'Desert Goblin Bandit',
    species: 'goblin',
    biome: 'sand',
    level: 2,
    maxHp: 105,
    damage: 17,
    scale: 1.75,
    homeX: 186,
    homeZ: 196,
    gold: 38,
    xp: 38,
    drop: ['iron', 4],
    description: 'Bandit Goblin gurun yang mengincar pengelana di ngarai tenggara.',
  },
  {
    id: 'mon_colossus_1',
    name: 'Sandstone Colossus',
    species: 'sand_colossus',
    biome: 'sand',
    level: 3,
    maxHp: 150,
    damage: 21,
    scale: 2.05,
    homeX: -24,
    homeZ: 208,
    gold: 54,
    xp: 50,
    drop: ['stone', 8],
    description: 'Raksasa batu pasir kuno berukir emas yang menjaga Pegunungan Gurun Selatan.',
  },
  {
    id: 'mon_scorpion_1',
    name: 'Giant Dune Scorpion',
    species: 'scorpion',
    biome: 'sand',
    level: 3,
    maxHp: 135,
    damage: 20,
    scale: 1.9,
    homeX: -138,
    homeZ: 282,
    gold: 48,
    xp: 46,
    drop: ['herbs', 6],
    description: 'Kalajengking gurun raksasa berlapis tempurung emas keras dengan sengat beracun.',
  },
  {
    id: 'mon_colossus_2',
    name: 'Sun-Carved Guardian',
    species: 'sand_colossus',
    biome: 'sand',
    level: 4,
    maxHp: 165,
    damage: 23,
    scale: 2.0,
    homeX: 112,
    homeZ: 232,
    gold: 62,
    xp: 55,
    drop: ['stone', 9],
    description: 'Patung raksasa hidup peninggalan kerajaan matahari di tebing gurun selatan.',
  },
  {
    id: 'mon_scorpion_2',
    name: 'Golden Carapace King',
    species: 'scorpion',
    biome: 'sand',
    level: 4,
    maxHp: 160,
    damage: 22,
    scale: 2.05,
    homeX: 118,
    homeZ: 336,
    gold: 60,
    xp: 54,
    drop: ['potion', 1],
    description: 'Raja kalajengking raksasa yang menguasai bukit pasir di ujung selatan pulau.',
  },

  // ---- D. WEST ICE MOUNTAIN & SNOW TUNDRA BIOME (Spread widely across the western expanse) ----
  {
    id: 'mon_wolf_frost',
    name: 'Frostfang Dire Wolf',
    species: 'dire_wolf',
    biome: 'snow',
    level: 2,
    maxHp: 110,
    damage: 17,
    scale: 1.78,
    homeX: -182,
    homeZ: 112,
    gold: 40,
    xp: 40,
    drop: ['fish', 5],
    description: 'Serigala es raksasa berbulu perak yang berburu di lereng selatan Pegunungan Es.',
  },
  {
    id: 'mon_yeti_1',
    name: 'Frost Yeti Raksasa',
    species: 'yeti',
    biome: 'snow',
    level: 3,
    maxHp: 135,
    damage: 20,
    scale: 1.95,
    homeX: -206,
    homeZ: -12,
    gold: 48,
    xp: 46,
    drop: ['stone', 7],
    description: 'Monster raksasa berbulu salju tebal yang menghuni puncak Gunung Es Barat.',
  },
  {
    id: 'mon_icegolem_1',
    name: 'Glacier Titan Golem',
    species: 'ice_golem',
    biome: 'snow',
    level: 4,
    maxHp: 165,
    damage: 23,
    scale: 2.05,
    homeX: -214,
    homeZ: -118,
    gold: 58,
    xp: 54,
    drop: ['stone', 8],
    description: 'Golem kristal es raksasa yang bangkit dari bongkahan gletser abadi di punggung utara.',
  },
  {
    id: 'mon_yeti_2',
    name: 'Alpha Blizzard Yeti',
    species: 'yeti',
    biome: 'snow',
    level: 4,
    maxHp: 160,
    damage: 22,
    scale: 2.1,
    homeX: -336,
    homeZ: 96,
    gold: 62,
    xp: 56,
    drop: ['iron', 6],
    description: 'Pemimpin kawanan yeti gunung es di daratan salju barat daya.',
  },
  {
    id: 'mon_icegolem_2',
    name: 'Permafrost Behemoth',
    species: 'ice_golem',
    biome: 'snow',
    level: 4,
    maxHp: 170,
    damage: 24,
    scale: 2.0,
    homeX: -338,
    homeZ: -128,
    gold: 64,
    xp: 58,
    drop: ['iron', 6],
    description: 'Penjaga batu es raksasa yang berpatroli di tebing gletser barat laut.',
  },

  // ---- E. EAST VOLCANO & ASH BIOME (Spread widely across the eastern expanse) ----
  {
    id: 'mon_goblin_ash',
    name: 'Ash Goblin Trickster',
    species: 'goblin',
    biome: 'ash',
    level: 2,
    maxHp: 108,
    damage: 18,
    scale: 1.75,
    homeX: 204,
    homeZ: -116,
    gold: 40,
    xp: 40,
    drop: ['iron', 4],
    description: 'Goblin abu vulkanik bersenjata gada bara di perbukitan timur laut.',
  },
  {
    id: 'mon_magma_1',
    name: 'Obsidian Magma Brute',
    species: 'magma_brute',
    biome: 'ash',
    level: 4,
    maxHp: 170,
    damage: 24,
    scale: 2.05,
    homeX: 194,
    homeZ: 28,
    gold: 65,
    xp: 60,
    drop: ['iron', 7],
    description: 'Raksasa batu basal dengan aliran lava menyala di tubuhnya yang menjaga lereng Gunung Berapi Timur.',
  },
  {
    id: 'mon_drake_1',
    name: 'Crimson Pyro Drake',
    species: 'pyro_drake',
    biome: 'ash',
    level: 4,
    maxHp: 155,
    damage: 23,
    scale: 1.95,
    homeX: 226,
    homeZ: 124,
    gold: 62,
    xp: 56,
    drop: ['stone', 7],
    description: 'Naga api bersayap bara yang bersarang di tebing vulkanik tenggara.',
  },
  {
    id: 'mon_magma_2',
    name: 'Molten Titan',
    species: 'magma_brute',
    biome: 'ash',
    level: 5,
    maxHp: 195,
    damage: 26,
    scale: 2.15,
    homeX: 338,
    homeZ: 92,
    gold: 78,
    xp: 68,
    drop: ['iron', 9],
    description: 'Monster magma kolosal yang menguasai dataran vulkanik ujung timur.',
  },
  {
    id: 'mon_drake_2',
    name: 'Ashwing Wyvern',
    species: 'pyro_drake',
    biome: 'ash',
    level: 5,
    maxHp: 180,
    damage: 25,
    scale: 2.0,
    homeX: 334,
    homeZ: -104,
    gold: 72,
    xp: 64,
    drop: ['iron', 8],
    description: 'Monster wyvern vulkanik yang mengintai di pesisir abu timur laut.',
  },
]

export interface MonsterLiveState {
  x: number
  z: number
  y: number
  facing: number
  hp: number
  walking: boolean
  targetX: number
  targetZ: number
  wait: number
  hitUntil: number
  attackUntil: number
  nextAttackAt: number
  deadUntil: number
  defeats: number
}

export const monsterLive: Record<string, MonsterLiveState> = {}

for (let i = 0; i < MOUNTAIN_MONSTERS.length; i++) {
  const m = MOUNTAIN_MONSTERS[i]
  monsterLive[m.id] = {
    x: m.homeX,
    z: m.homeZ,
    y: Math.max(0, height(m.homeX, m.homeZ)),
    facing: (i * 1.1) % (Math.PI * 2),
    hp: m.maxHp,
    walking: false,
    targetX: m.homeX,
    targetZ: m.homeZ,
    wait: 1 + (i % 3),
    hitUntil: 0,
    attackUntil: 0,
    nextAttackAt: 0,
    deadUntil: 0,
    defeats: 0,
  }
}

export const getMonster = (id: string) => MOUNTAIN_MONSTERS.find((m) => m.id === id)

const monRng = rng(991)
const MIN_MONSTER_SEPARATION = 42 // keep monsters well separated from one another

function tooCloseToOtherMonster(monId: string, x: number, z: number): boolean {
  for (const other of MOUNTAIN_MONSTERS) {
    if (other.id === monId) continue
    const ost = monsterLive[other.id]
    if (!ost || ost.deadUntil > 0) continue
    if (Math.hypot(x - ost.x, z - ost.z) < MIN_MONSTER_SEPARATION) return true
  }
  return false
}

/**
 * Step one Monster:
 * - Stays far from the main village (>= 88m) and well separated from other monsters.
 * - Cannot enter rivers or lakes.
 * - Automatically aggros & attacks the player when the player comes near!
 */
export function stepMonster(mon: MountainMonster, rawDt: number): MonsterLiveState {
  const dt = Math.min(rawDt, 0.1)
  const st = monsterLive[mon.id]
  const now = performance.now()
  const game = useGame.getState()

  if (st.deadUntil > 0) {
    if (now >= st.deadUntil) {
      st.deadUntil = 0
      st.hp = mon.maxHp
      st.x = mon.homeX
      st.z = mon.homeZ
      st.y = Math.max(0, height(st.x, st.z))
    }
    return st
  }

  const playerAlive = !game.playerDeadUntil || Date.now() >= game.playerDeadUntil
  const distPlayer = Math.hypot(player.pos.x - st.x, player.pos.z - st.z)
  const distHomeToPlayer = Math.hypot(player.pos.x - mon.homeX, player.pos.z - mon.homeZ)
  const aggroRange = 10.5
  const attackRange = 2.6 + mon.scale * 0.55

  // Automatic Aggro & Attack when the player approaches this monster!
  if (playerAlive && !game.interior && distPlayer <= aggroRange && distHomeToPlayer <= 26) {
    st.facing = lerpAngle(st.facing, Math.atan2(player.pos.x - st.x, player.pos.z - st.z), 1 - Math.exp(-dt * 10))
    if (distPlayer <= attackRange) {
      st.walking = false
      if (now >= st.nextAttackAt) {
        st.nextAttackAt = now + 1550
        st.attackUntil = now + 420
        const died = game.damagePlayer(mon.damage, `${mon.name} (Lv.${mon.level})`)
        if (died) {
          chron(game.time, 'quest', '💀', `${game.playerName || game.playerClass} gugur saat melawan ${mon.name} (Lv.${mon.level}). Respawn dalam 2 menit.`)
        }
      }
    } else {
      // Chase the player
      const dx = player.pos.x - st.x, dz = player.pos.z - st.z
      const chaseSpeed = 2.35
      const step = Math.min(distPlayer - attackRange * 0.85, chaseSpeed * dt)
      const nx = st.x + (dx / distPlayer) * step
      const nz = st.z + (dz / distPlayer) * step
      if (
        Math.hypot(nx, nz) >= 85 &&
        walkable(nx, nz) &&
        !collides(nx, nz, 0.9, SOLIDS, WORLD_HALF) &&
        !tooCloseToOtherMonster(mon.id, nx, nz)
      ) {
        st.x = nx
        st.z = nz
        st.walking = true
      } else {
        st.walking = false
      }
    }
    st.y = Math.max(0, height(st.x, st.z))
    return st
  }

  // Normal patrol around homeX/homeZ
  const dx = st.targetX - st.x, dz = st.targetZ - st.z
  const d = Math.hypot(dx, dz)
  if (d < 0.35) {
    st.walking = false
    if ((st.wait -= dt) <= 0) {
      st.wait = 2.0 + monRng() * 4.0
      for (let tries = 0; tries < 8; tries++) {
        const a = monRng() * Math.PI * 2, r = 3 + monRng() * 9
        const tx = mon.homeX + Math.cos(a) * r
        const tz = mon.homeZ + Math.sin(a) * r
        if (
          Math.hypot(tx, tz) >= 88 &&
          walkable(tx, tz) &&
          !collides(tx, tz, 1.1, SOLIDS, WORLD_HALF) &&
          !tooCloseToOtherMonster(mon.id, tx, tz)
        ) {
          st.targetX = tx
          st.targetZ = tz
          break
        }
      }
    }
  } else {
    st.walking = true
    const speed = 1.45
    const step = Math.min(d, speed * dt)
    const nx = st.x + (dx / d) * step
    const nz = st.z + (dz / d) * step
    if (
      Math.hypot(nx, nz) >= 88 &&
      walkable(nx, nz) &&
      !collides(nx, nz, 0.9, SOLIDS, WORLD_HALF) &&
      !tooCloseToOtherMonster(mon.id, nx, nz)
    ) {
      st.x = nx
      st.z = nz
    } else {
      st.targetX = st.x
      st.targetZ = st.z
    }
    st.facing = lerpAngle(st.facing, Math.atan2(dx, dz), 1 - Math.exp(-dt * 7))
  }

  st.y = Math.max(0, height(st.x, st.z))
  return st
}

/** Attack a Monster (deals player-level scaled damage, awards Gold/Resource/EXP on defeat). */
export function attackMonster(id: string) {
  const mon = getMonster(id)
  const st = monsterLive[id]
  if (!mon || !st) return
  const s = useGame.getState()
  if (s.playerDeadUntil && Date.now() < s.playerDeadUntil) {
    s.notify('💀 Kamu sedang gugur! Tunggu waktu respawn selesai.')
    return
  }
  const now = performance.now()
  if (st.deadUntil > now) {
    s.notify(`⏳ ${mon.name} sedang dikalahkan dan akan muncul kembali sebentar lagi.`)
    return
  }

  const lv = playerLevelInfo(s.playerXp).level
  const dmg = 35 + lv * 12
  st.hp = Math.max(0, st.hp - dmg)
  st.hitUntil = now + 450
  s.select({ type: 'monster', id })

  if (st.hp <= 0) {
    st.deadUntil = now + 35000 // respawn after 35s
    st.defeats++
    const [resKey, resQty] = mon.drop
    town.gold += mon.gold
    town.stock[resKey] = Math.min(storageCap(), town.stock[resKey] + resQty)
    record('quest', mon.gold, `Slain ${mon.name}`, s.time)
    s.gainXp(mon.xp)
    if (mon.species === 'slime') s.recordQuestProgress('kill_slime', 1)
    else if (mon.species === 'goblin') s.recordQuestProgress('kill_goblin', 1)
    else s.recordQuestProgress('kill_any', 1)
    chron(s.time, 'quest', '👹', `${s.playerName || s.playerClass} mengalahkan monster ${mon.name}! +${mon.gold} gold, +${mon.xp} EXP.`)
    changed()
    useGame.setState((prev) => ({ rev: prev.rev + 1 }))
    s.notify(`⚔️ ${mon.name} dikalahkan! +${mon.gold} 🪙 Gold, +${resQty} ${resKey}, +${mon.xp} ⭐ EXP!`)
  } else {
    useGame.setState((prev) => ({ rev: prev.rev + 1 }))
    s.notify(`⚔️ Menyerang ${mon.name} (−${dmg} HP · Sisa HP: ${st.hp}/${mon.maxHp})`)
  }
}
