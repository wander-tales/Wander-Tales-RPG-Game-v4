// Town layout: buildings, colliders and the walk graph NPCs use.
// World axes: x = east, z = south, y = up. 1 unit ≈ 1 metre.
import type { Box } from './collision.ts'

export type BuildingKind =
  | 'square' | 'guild' | 'tavern' | 'bakery' | 'blacksmith' | 'market'
  | 'farm' | 'house' | 'construction' | 'dock'
  | 'lumber' | 'quarry' | 'mine' | 'workshop' | 'alchemist'
  | 'outpost' | 'dungeon'

export type BiomeRegion = 'snow' | 'ash' | 'sand' | 'lush'

export interface BuildingDef {
  id: string
  kind: BuildingKind
  name: string
  x: number
  z: number
  /** world-axis footprint (x size, z size) */
  w: number
  d: number
  /** facing of the front door, radians around y (0 = +z / south) */
  rot: number
  /** walk-graph node in front of the door */
  door: string
  description: string
  solid?: boolean
  /** set for biome buildings & dungeons outside the village */
  biomeRegion?: BiomeRegion
}

const S = Math.PI / 2

export const BUILDINGS: BuildingDef[] = [
  { id: 'square', kind: 'square', name: 'Town Square', x: 0, z: 0, w: 3.4, d: 3.4, rot: 0, door: 'sN', // the fountain: box hugs the round basin
    description: 'The heart of WanderTales. Residents gather around the old fountain to chat and celebrate.' },
  { id: 'guild', kind: 'guild', name: 'Guild Headquarters', x: 0, z: -20, w: 12, d: 10, rot: 0, door: 'guild',
    description: 'Seat of the Guild Master. Recruitment board, quest board and the Town Chronicle live here.' },
  { id: 'tavern', kind: 'tavern', name: 'The Sleepy Griffin Tavern', x: 16, z: -4, w: 9, d: 8, rot: -S, door: 'tavern',
    description: 'Warm stew, cold cider and the best gossip in town.' },
  { id: 'bakery', kind: 'bakery', name: 'Hearthstone Bakery', x: -15, z: -4, w: 7, d: 7, rot: S, door: 'bakery',
    description: 'Fresh bread every morning, baked from the farm\'s wheat.' },
  { id: 'blacksmith', kind: 'blacksmith', name: 'Emberforge Smithy', x: -15, z: 12, w: 8, d: 7, rot: S, door: 'smith',
    description: 'Tools and weapons hammered from Iron and Wood.' },
  { id: 'market', kind: 'market', name: 'Market Row', x: 14, z: 12, w: 10, d: 8, rot: Math.PI, door: 'market',
    description: 'Stalls where residents buy and sell goods.' },
  { id: 'farm', kind: 'farm', name: 'Goldenfield Farm', x: 0, z: 30, w: 18, d: 12, rot: Math.PI, door: 'farm',
    description: 'Rows of wheat and vegetables that feed the whole town.' },
  { id: 'h1', kind: 'house', name: 'Willow Cottage', x: -30, z: -14, w: 6, d: 6, rot: S, door: 'h1', description: 'A cosy home in the Residential District.' },
  { id: 'h2', kind: 'house', name: 'Mossy Cottage', x: -30, z: -2, w: 6, d: 6, rot: S, door: 'h2', description: 'A cosy home in the Residential District.' },
  { id: 'h3', kind: 'house', name: 'Bramble Cottage', x: -30, z: 10, w: 6, d: 6, rot: S, door: 'h3', description: 'A cosy home in the Residential District.' },
  { id: 'h4', kind: 'house', name: 'Acorn Cottage', x: -30, z: -26, w: 6, d: 6, rot: S, door: 'h4', description: 'A cosy home in the Residential District.' },
  { id: 'construction', kind: 'construction', name: "Builders' Yard", x: 22, z: 30, w: 8, d: 8, rot: Math.PI, door: 'build',
    description: 'Home base of the town builders. They head out from here to every construction and upgrade.' },
  { id: 'dock', kind: 'dock', name: 'Fishing Dock', x: 39, z: 4, w: 6, d: 4, rot: -S, door: 'dock', solid: false,
    description: 'A little pier on the river. Fishermen work here at dawn.' },

  // ---------- WEST BIOME (SNOW / ICE) ----------
  { id: 'snow_lodge', kind: 'outpost', biomeRegion: 'snow', name: 'Frostpeak Lodge', x: -270, z: 10, w: 8, d: 7, rot: 0, door: 'd_snow_lodge',
    description: 'Pondok kayu hangat tempat para pemburu salju dan penjelajah gunung es beristirahat.' },
  { id: 'snow_watch', kind: 'outpost', biomeRegion: 'snow', name: 'Glacier Watchtower', x: -262, z: -18, w: 6, d: 6, rot: 0, door: 'd_snow_watch',
    description: 'Menara pengawas batu es yang memantau badai salju dan Danau Gletser di barat.' },
  { id: 'snow_forge', kind: 'outpost', biomeRegion: 'snow', name: 'Cryo-Runesmith Hut', x: -286, z: 24, w: 7, d: 6, rot: S, door: 'd_snow_forge',
    description: 'Bengkel pandai rune kuno yang menempa senjata dengan kristal es abadi.' },
  { id: 'dungeon_ice', kind: 'dungeon', biomeRegion: 'snow', name: '❄️ Glacial Cavern Dungeon', x: -300, z: -8, w: 10, d: 10, rot: S, door: 'd_dungeon_ice',
    description: 'Dungeon gua gletser kuno di balik gunung es. Dijaga oleh Frost Wyrm dan Golem Es.' },

  // ---------- EAST BIOME (VOLCANO / ASH) ----------
  { id: 'ash_outpost', kind: 'outpost', biomeRegion: 'ash', name: 'Cinderwatch Outpost', x: 270, z: 8, w: 8, d: 7, rot: 0, door: 'd_ash_outpost',
    description: 'Benteng batu basal yang melindungi para pengelana dari hujan abu vulkanik.' },
  { id: 'ash_foundry', kind: 'outpost', biomeRegion: 'ash', name: 'Obsidian Foundry', x: 282, z: -18, w: 8, d: 7, rot: 0, door: 'd_ash_foundry',
    description: 'Tungku peleburan bijih obsidian yang memanfaatkan panas bumi kawah gunung berapi.' },
  { id: 'ash_sanctum', kind: 'outpost', biomeRegion: 'ash', name: 'Pyromancer Sanctum', x: 276, z: 32, w: 6, d: 6, rot: -S, door: 'd_ash_sanctum',
    description: 'Menara penelitian kristal api dan alkimia magma di dataran timur.' },
  { id: 'dungeon_volcano', kind: 'dungeon', biomeRegion: 'ash', name: '🌋 Magma Citadel Dungeon', x: 302, z: 10, w: 10, d: 10, rot: -S, door: 'd_dungeon_volcano',
    description: 'Dungeon benteng obsidian di jantung tanah vulkanik. Tempat bersemayamnya Ignis Behemoth.' },

  // ---------- SOUTH BIOME (DESERT / SAND) ----------
  { id: 'sand_bazaar', kind: 'outpost', biomeRegion: 'sand', name: 'Sunstone Caravanserai', x: -20, z: 274, w: 9, d: 7, rot: Math.PI, door: 'd_sand_bazaar',
    description: 'Pos persinggahan kafilah gurun dengan tenda sutra di dekat Oase Gurun.' },
  { id: 'sand_camp', kind: 'outpost', biomeRegion: 'sand', name: 'Mirage Nomad Lodge', x: 12, z: 278, w: 7, d: 6, rot: Math.PI, door: 'd_sand_camp',
    description: 'Pondok batu pasir tempat para penjelajah gurun berteduh dari terik matahari.' },
  { id: 'sand_shrine', kind: 'outpost', biomeRegion: 'sand', name: 'Aurelian Sun Shrine', x: -34, z: 298, w: 6, d: 6, rot: S, door: 'd_sand_shrine',
    description: 'Kuil matahari kuno dengan ukiran emas peninggalan kerajaan padang pasir.' },
  { id: 'dungeon_sand', kind: 'dungeon', biomeRegion: 'sand', name: '🏜️ Sunken Pyramid Dungeon', x: 8, z: 306, w: 10, d: 10, rot: Math.PI, door: 'd_dungeon_sand',
    description: 'Dungeon piramida kuno yang separuh terkubur pasir gurun. Dijaga oleh Pharaoh Sentinel.' },

  // ---------- NORTH BIOME (LUSH FOREST) ----------
  { id: 'lush_lodge', kind: 'outpost', biomeRegion: 'lush', name: 'Sylvan Ranger Lodge', x: -20, z: -270, w: 8, d: 7, rot: 0, door: 'd_lush_lodge',
    description: 'Pondok penjaga hutan beratap lumut di tengah pepohonan purba utara.' },
  { id: 'lush_apothecary', kind: 'outpost', biomeRegion: 'lush', name: 'Moonbloom Apothecary', x: 12, z: -266, w: 6, d: 6, rot: 0, door: 'd_lush_apothecary',
    description: 'Rumah ramuan herbal yang meracik obat dari jamur bercahaya dan bunga hutan.' },
  { id: 'lush_circle', kind: 'outpost', biomeRegion: 'lush', name: 'Elderwood Druid Hall', x: -34, z: -292, w: 7, d: 6, rot: S, door: 'd_lush_circle',
    description: 'Balai para druid penjaga kelestarian Telaga Zamrud dan hutan utara.' },
  { id: 'dungeon_lush', kind: 'dungeon', biomeRegion: 'lush', name: '🌿 Ancient Ruins Dungeon', x: 10, z: -300, w: 10, d: 10, rot: 0, door: 'd_dungeon_lush',
    description: 'Dungeon reruntuhan kuil lumut kuno yang menembus labirin akar Elder Treant.' },
]

export const RIVER_X = 40
export const RIVER_W = 8
/** Half the island's width (m): the walkable land runs from -WORLD_HALF to +WORLD_HALF, sea beyond. */
export const WORLD_HALF = 400
/** Half-size of the detailed town ground (roads, plaza, farm fields) around the centre; the rest is open terrain. */
export const TOWN_HALF = 58

export function buildingBox(b: BuildingDef, pad = 0): Box {
  return { minX: b.x - b.w / 2 - pad, maxX: b.x + b.w / 2 + pad, minZ: b.z - b.d / 2 - pad, maxZ: b.z + b.d / 2 + pad }
}

/** No full-island river wall so the player can freely cross bridges and shallow fords into every biome. */
export const RIVER_BOXES: Box[] = []
/** A box given in building space (front = local +z, sizes as in world/Buildings.tsx) → world axes. Rotations are multiples of 90°. */
function localBox(b: BuildingDef, minX: number, maxX: number, minZ: number, maxZ: number): Box {
  const c = Math.round(Math.cos(b.rot)), s = Math.round(Math.sin(b.rot))
  const xs = [minX, maxX].flatMap((x) => [minZ, maxZ].map((z) => b.x + x * c + z * s))
  const zs = [minX, maxX].flatMap((x) => [minZ, maxZ].map((z) => b.z - x * s + z * c))
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}
/** What blocks walking: the whole plot, except the farm (fence with a gate, plus the barn — walk into the fields)
 * and the market (only the counters and the stalls behind them — shoppers stand at the counters). */
export function solidBoxes(b: BuildingDef): Box[] {
  const side = Math.abs(Math.sin(b.rot)) > 0.5, W = side ? b.d : b.w, D = side ? b.w : b.d, t = 0.15
  if (b.kind === 'farm') return [
    localBox(b, -W / 2 - t, W / 2 + t, -D / 2 - t, -D / 2 + t), // back fence
    localBox(b, -W / 2 - t, -W / 2 + t, -D / 2, D / 2), localBox(b, W / 2 - t, W / 2 + t, -D / 2, D / 2), // sides
    localBox(b, -W / 2, -1.6, D / 2 - t, D / 2 + t), localBox(b, 1.6, W / 2, D / 2 - t, D / 2 + t), // front, gate in the middle
    localBox(b, W / 2 - 5.2, W / 2 - 0.8, -3.2, 2.2), // barn
  ]
  if (b.kind === 'market') return [localBox(b, -W / 2, W / 2, -D / 2, 0.85)]
  return [buildingBox(b)]
}

/** Buildings + river. Mutated in place when buildings are added or removed. */
export const SOLIDS: Box[] = []
export function rebuildSolids() {
  SOLIDS.length = 0
  SOLIDS.push(...BUILDINGS.filter((b) => b.solid !== false).flatMap(solidBoxes), ...RIVER_BOXES)
}
rebuildSolids()

export const NODES: Record<string, [number, number]> = {
  sN: [0, -7], sNE: [5, -5], sE: [7, 0], sSE: [5, 5], sS: [0, 7], sSW: [-5, 5], sW: [-7, 0], sNW: [-5, -5],
  guild: [0, -13], tavern: [10, -4], bakery: [-10, -4], wJ: [-10, 3], smith: [-9.5, 12], wR: [-25, 3],
  h1: [-25, -14], h2: [-25, -2], h3: [-25, 10], h4: [-25, -26],
  eJ: [10, 3], market: [14, 6], eR: [25, 3], dock: [33, 4], farm: [0, 22], build: [22, 22],
  // Biome building & dungeon door points (disconnected from town walk graph so town residents stay in town)
  d_snow_lodge: [-270, 15.5], d_snow_watch: [-262, -13], d_snow_forge: [-280.5, 24], d_dungeon_ice: [-293, -8],
  d_ash_outpost: [270, 13.5], d_ash_foundry: [282, -12.5], d_ash_sanctum: [271, 32], d_dungeon_volcano: [295, 10],
  d_sand_bazaar: [-20, 268.5], d_sand_camp: [12, 273], d_sand_shrine: [-29, 298], d_dungeon_sand: [8, 299],
  d_lush_lodge: [-20, -264.5], d_lush_apothecary: [12, -261], d_lush_circle: [-28.5, -292], d_dungeon_lush: [10, -293],
}

/** Town road nodes only (used for initial resident placement so village residents spawn in town). */
export const TOWN_NODE_IDS = [
  'sN', 'sNE', 'sE', 'sSE', 'sS', 'sSW', 'sW', 'sNW',
  'guild', 'tavern', 'bakery', 'wJ', 'smith', 'wR', 'h1', 'h2', 'h3', 'h4',
  'eJ', 'market', 'eR', 'dock', 'farm', 'build',
]

export const EDGES: [string, string][] = [
  ['sN', 'sNE'], ['sNE', 'sE'], ['sE', 'sSE'], ['sSE', 'sS'], ['sS', 'sSW'], ['sSW', 'sW'], ['sW', 'sNW'], ['sNW', 'sN'],
  ['sN', 'guild'], ['sE', 'tavern'], ['sW', 'bakery'], ['sW', 'wJ'], ['wJ', 'bakery'], ['wJ', 'smith'],
  ['wJ', 'wR'], ['wR', 'h2'], ['wR', 'h3'], ['h2', 'h1'], ['h1', 'h4'],
  ['sE', 'eJ'], ['sSE', 'eJ'], ['tavern', 'eJ'], ['eJ', 'market'], ['eJ', 'eR'], ['eR', 'dock'], ['eR', 'build'],
  ['sS', 'farm'], ['farm', 'build'],
]

export const NEIGHBORS: Record<string, string[]> = {}
for (const [a, b] of EDGES) {
  ;(NEIGHBORS[a] ??= []).push(b)
  ;(NEIGHBORS[b] ??= []).push(a)
}

/** Initial layout snapshot, so saves and resets can restore starter buildings if demolished. */
const INITIAL_BUILDINGS: BuildingDef[] = BUILDINGS.map((b) => ({ ...b }))
export const BASE_BUILDING_IDS = new Set(INITIAL_BUILDINGS.map((b) => b.id))

export function restoreInitialBuildings() {
  for (const init of INITIAL_BUILDINGS) {
    if (!BUILDINGS.some((b) => b.id === init.id)) {
      BUILDINGS.push({ ...init })
    }
  }
  rebuildSolids()
}

export function addBuilding(b: BuildingDef, door: [number, number], connectTo: string) {
  BUILDINGS.push(b)
  NODES[b.door] = door
  EDGES.push([b.door, connectTo])
  ;(NEIGHBORS[b.door] ??= []).push(connectTo)
  ;(NEIGHBORS[connectTo] ??= []).push(b.door)
  rebuildSolids()
}

export function removeBuilding(id: string) {
  const i = BUILDINGS.findIndex((b) => b.id === id)
  if (i < 0) return
  const [b] = BUILDINGS.splice(i, 1)
  const node = b.door
  // Keep permanent town road nodes intact so NPC pathfinding and road network never break
  if (!TOWN_NODE_IDS.includes(node)) {
    delete NODES[node]
    for (let k = EDGES.length - 1; k >= 0; k--) if (EDGES[k].includes(node)) EDGES.splice(k, 1)
    for (const n of NEIGHBORS[node] ?? []) NEIGHBORS[n] = NEIGHBORS[n].filter((m) => m !== node)
    delete NEIGHBORS[node]
  }
  rebuildSolids()
}

export function nearestNode(x: number, z: number) {
  let best = 'sN', bd = Infinity
  for (const id of TOWN_NODE_IDS) {
    const [nx, nz] = NODES[id]
    const d = (nx - x) ** 2 + (nz - z) ** 2
    if (d < bd) { bd = d; best = id }
  }
  return best
}

/** Shortest hop path (BFS) from a to b, excluding a. */
export function findPath(a: string, b: string): string[] {
  if (a === b) return []
  const prev: Record<string, string> = { [a]: a }
  const queue = [a]
  while (queue.length) {
    const n = queue.shift()!
    for (const m of NEIGHBORS[n] ?? []) {
      if (m in prev) continue
      prev[m] = n
      if (m === b) {
        const path = [b]
        for (let c = n; c !== a; c = prev[c]) path.unshift(c)
        return path
      }
      queue.push(m)
    }
  }
  return []
}

export const getBuilding = (id: string) => BUILDINGS.find((b) => b.id === id)
