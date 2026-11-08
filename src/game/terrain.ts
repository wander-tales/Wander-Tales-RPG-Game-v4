// The island's shape: four mountains round the town (ice in the west, a volcano in the east, sand in the south, a
// forested mountain in the north), wide biome hinterlands behind each mountain range, natural rolling hills, a
// winding river with bridges, four natural lakes, and the coast. Pure logic, shared by collision, scenery and the renderer.
import { TOWN_HALF, WORLD_HALF } from './map.ts'

export type Biome = 'grass' | 'snow' | 'sand' | 'ash' | 'lush'
export interface Mountain { kind: 'ice' | 'sand' | 'volcano' | 'lush'; x: number; z: number; r: number; h: number }

/** Main peaks plus shoulders and distant hinterland outcrops. Slopes are passable so the player can traverse every biome. */
export const MOUNTAINS: Mountain[] = [
  // West: ice range + snowy hinterland crags (pushed further from the main village)
  { kind: 'ice', x: -208, z: -14, r: 44, h: 32 }, { kind: 'ice', x: -220, z: 48, r: 30, h: 22 }, { kind: 'ice', x: -198, z: -74, r: 28, h: 20 },
  { kind: 'ice', x: -218, z: 106, r: 26, h: 18 }, { kind: 'ice', x: -212, z: -126, r: 25, h: 16 },
  { kind: 'ice', x: -332, z: -62, r: 20, h: 14 }, { kind: 'ice', x: -342, z: 52, r: 18, h: 12 },
  // East: volcano range + ashland cinder cones
  { kind: 'volcano', x: 208, z: 15, r: 48, h: 38 }, { kind: 'volcano', x: 222, z: -52, r: 26, h: 17 }, { kind: 'volcano', x: 220, z: 80, r: 28, h: 18 },
  { kind: 'volcano', x: 212, z: -108, r: 24, h: 14 },
  { kind: 'volcano', x: 336, z: -26, r: 20, h: 13 }, { kind: 'volcano', x: 328, z: 66, r: 18, h: 11 },
  // South: sandstone range + desert mesas in the southern hinterland
  { kind: 'sand', x: -22, z: 208, r: 42, h: 22 }, { kind: 'sand', x: -82, z: 224, r: 28, h: 16 }, { kind: 'sand', x: 88, z: 216, r: 28, h: 16 },
  { kind: 'sand', x: -136, z: 218, r: 24, h: 13 }, { kind: 'sand', x: 142, z: 220, r: 22, h: 12 },
  { kind: 'sand', x: -64, z: 332, r: 20, h: 12 }, { kind: 'sand', x: 108, z: 324, r: 18, h: 11 },
  // North: lush forested range + northern woodland hills
  { kind: 'lush', x: -36, z: -208, r: 44, h: 28 }, { kind: 'lush', x: 88, z: -218, r: 30, h: 20 }, { kind: 'lush', x: -96, z: -216, r: 26, h: 18 },
  { kind: 'lush', x: -144, z: -208, r: 22, h: 15 }, { kind: 'lush', x: 142, z: -210, r: 24, h: 15 },
  { kind: 'lush', x: -56, z: -332, r: 22, h: 14 }, { kind: 'lush', x: 96, z: -322, r: 20, h: 12 },
]
/** Top of the volcano's crater (for the lava glow and smoke). */
export const CRATER = { x: 208, z: 15, y: 38 * 0.86, r: 7 }

/** Natural lakes across the island: one in the northwest meadow and one in the snow, lush, and sand biomes. */
export interface Lake { id: string; name: string; x: number; z: number; rx: number; rz: number; biome: Biome }
export const LAKES: Lake[] = [
  { id: 'lake_meadow', name: 'Danau Cermin', x: -102, z: -96, rx: 22, rz: 16, biome: 'grass' },
  { id: 'lake_snow', name: 'Danau Gletser', x: -264, z: -68, rx: 18, rz: 14, biome: 'snow' },
  { id: 'lake_lush', name: 'Telaga Zamrud', x: -68, z: -282, rx: 19, rz: 14, biome: 'lush' },
  { id: 'lake_sand', name: 'Oase Gurun', x: -64, z: 282, rx: 17, rz: 13, biome: 'sand' },
]

/** Flat plateaus where biome outposts and dungeons stand so their foundations sit level on the ground. */
export const BIOME_PLATEAUS: { x: number; z: number; r: number }[] = [
  { x: -280, z: 2, r: 48 },   // West snow settlement & dungeon
  { x: 286, z: 10, r: 48 },   // East volcano settlement & dungeon
  { x: -6, z: 290, r: 50 },   // South desert settlement & dungeon
  { x: -6, z: -284, r: 50 },  // North lush settlement & dungeon
]

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
const noise = (x: number, z: number) => Math.sin(x * 0.11 + Math.cos(z * 0.07)) * 0.5 + Math.sin(z * 0.13 + x * 0.05) * 0.5

/** Winding river centerline X for a given Z. Passes through x = 40 inside town so the Fishing Dock aligns, then curves naturally. */
export function riverCenterX(z: number): number {
  const az = Math.abs(z)
  const blend = smooth((az - 38) / 55)
  const curve = Math.sin(z * 0.019) * 24 + Math.cos(z * 0.041 - 0.6) * 10 + Math.sin(z * 0.008) * 14
  return 40 + blend * curve
}

/** Half-width of the river at Z (wider in gentle bends outside town). */
export function riverHalfWidth(z: number): number {
  const blend = smooth((Math.abs(z) - 42) / 40)
  return 4 + blend * (1.2 + Math.sin(z * 0.035) * 0.8)
}

//** Wooden bridges crossing the river so characters can walk cleanly across. */
export const BRIDGES: { z: number; w: number }[] = [
  { z: -245, w: 5.0 },
  { z: -112, w: 5.0 },
  { z: -12, w: 4.4 },
  { z: 24, w: 4.4 },
  { z: 112, w: 5.0 },
  { z: 245, w: 5.0 },
]

export function onBridge(x: number, z: number): boolean {
  const rx = riverCenterX(z), hw = riverHalfWidth(z) + 1.8
  if (Math.abs(x - rx) > hw) return false
  return BRIDGES.some((b) => Math.abs(z - b.z) <= b.w / 2 - 0.15)
}

/** Normalized distance to the nearest lake (< 1 means inside the water basin). */
export function lakeNormDist(x: number, z: number): number {
  let best = 1e9
  for (const lk of LAKES) {
    const dx = (x - lk.x) / lk.rx, dz = (z - lk.z) / lk.rz
    const a = Math.atan2(dz, dx)
    const wob = Math.sin(a * 5 + lk.x * 0.1) * 0.08 + Math.cos(a * 3 - lk.z * 0.1) * 0.06
    const d = Math.hypot(dx, dz) + wob
    if (d < best) best = d
  }
  return best
}

/** True if (x, z) is in the river channel or inside a natural lake. */
export function isWater(x: number, z: number): boolean {
  if (Math.abs(x - riverCenterX(z)) < riverHalfWidth(z) + 0.35) return true
  if (lakeNormDist(x, z) < 1.03) return true
  return false
}

/** Height of a mountain at (x, z): a rounded peak with ridges; the volcano has a crater on top. */
function peak(m: Mountain, x: number, z: number) {
  const d = Math.hypot(x - m.x, z - m.z) / m.r
  if (d >= 1) return 0
  let h = m.h * (1 - smooth(d)) ** 1.4 * (1 + noise(x, z) * 0.12)
  if (m.kind === 'volcano' && m.h > 30) { const c = Math.hypot(x - m.x, z - m.z) / CRATER.r; if (c < 1) h = Math.min(h, CRATER.y - (1 - c * c) * 5) }
  return h
}

/** Gentle natural rolling hills and contours outside the flat town square. */
function rollingContour(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z))
  const townFade = smooth((edge - TOWN_HALF - 4) / 26)
  if (townFade <= 0) return 0
  const wave =
    Math.sin(x * 0.028 + z * 0.019) * 1.35 +
    Math.cos(z * 0.033 - x * 0.021) * 1.05 +
    Math.sin((x - z) * 0.052) * 0.45
  return Math.max(0, wave + 0.45) * townFade
}

/** Distance in from the coast (m); the coastline wobbles so the island isn't a square. */
export const coastDist = (x: number, z: number) => {
  const m = Math.max(Math.abs(x), Math.abs(z)), a = Math.atan2(z, x)
  const round = m * 0.75 + Math.hypot(x, z) * 0.25 // a square with rounded corners
  const bays = Math.sin(a * 5 + 1) * 9 + Math.sin(a * 11 + 2) * 5 + Math.sin(a * 23) * 2.5 // ±16.5 m of bays and headlands
  return WORLD_HALF - 14 - round + bays * 0.6
}

/** Ground height: flat in town and biome settlements, natural rolling hills and mountains elsewhere, carved for rivers/lakes/coast. */
export function height(x: number, z: number) {
  let h = rollingContour(x, z)
  for (const m of MOUNTAINS) h = Math.max(h, peak(m, x, z))

  // Flatten around biome outposts & dungeons so buildings sit level
  for (const p of BIOME_PLATEAUS) {
    const d = Math.hypot(x - p.x, z - p.z)
    if (d < p.r) h *= smooth((d - p.r * 0.65) / (p.r * 0.35))
  }

  // Keep the winding river valley flat and gently carved
  const rDist = Math.abs(x - riverCenterX(z))
  const rHalf = riverHalfWidth(z)
  h *= smooth((rDist - rHalf - 2) / 12)
  if (rDist < rHalf + 1.2) {
    const t = 1 - smooth(rDist / (rHalf + 1.2))
    h -= t * 0.42
  }

  // Carve natural lake basins
  const lkD = lakeNormDist(x, z)
  if (lkD < 1.35) {
    h *= smooth((lkD - 1.05) / 0.3)
    if (lkD < 1.02) h -= (1 - smooth(lkD / 1.02)) * 0.55
  }

  const c = coastDist(x, z)
  if (c < 6) h -= (1 - Math.max(0, c) / 6) * 1.2 + Math.max(0, -c) * 0.25
  return h
}

const BIOME: Record<Mountain['kind'], Biome> = { ice: 'snow', sand: 'sand', volcano: 'ash', lush: 'lush' }
/** Which kind of land this is: stops short of the town so its meadows stay green, and stretches across the land behind each mountain range to the coast. */
export function biome(x: number, z: number): Biome {
  const wobble = Math.sin(x * 0.05 + z * 0.03) * 10 + Math.cos(z * 0.045 - x * 0.02) * 8
  let best: Biome = 'grass', bd = 1e9
  for (const m of MOUNTAINS) {
    // Outward distance (behind the mountain toward the sea) vs inward distance (toward the town)
    const out = m.kind === 'ice' ? m.x - x : m.kind === 'volcano' ? x - m.x : m.kind === 'sand' ? z - m.z : m.z - z
    const lat = m.kind === 'ice' || m.kind === 'volcano' ? z - m.z : x - m.x
    const effOut = out > 0 ? out * 0.05 : out
    const effLat = out > 0 ? lat * 0.48 : lat
    const d = Math.hypot(effOut, effLat) - m.r * 1.15 + wobble
    if (d < 24 && d < bd) { bd = d; best = BIOME[m.kind] }
  }
  return best
}

/**
 * Can the player walk here?
 * Rivers and lakes CANNOT be crossed directly — the player can only cross the river via wooden bridges (`onBridge`).
 * Outer boundary is the island's sea coast and the volcano lava crater.
 */
export const walkable = (x: number, z: number) =>
  coastDist(x, z) > 1.5 &&
  Math.hypot(x - CRATER.x, z - CRATER.z) > CRATER.r * 0.85 &&
  (!isWater(x, z) || onBridge(x, z))

/** Where trees, rocks, and player-built town buildings may be placed (not in rivers/lakes, not on steep peaks). */
export const sceneryWalkable = (x: number, z: number) =>
  coastDist(x, z) > 3.5 && !isWater(x, z) && height(x, z) < 2.2
