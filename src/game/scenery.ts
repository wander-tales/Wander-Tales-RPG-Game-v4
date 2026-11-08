// Deterministic placement of trees, rocks, flowers and lamps.
import { BUILDINGS, EDGES, NODES, RIVER_X, WORLD_HALF, buildingBox } from './map.ts'
import { circleHitsBox, type Box } from './collision.ts'
import { biome, coastDist, height, isWater, riverCenterX, riverHalfWidth, sceneryWalkable } from './terrain.ts'

export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

export function distToSegment(px: number, pz: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0], vz = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz)))
  return Math.hypot(px - (a[0] + vx * t), pz - (a[1] + vz * t))
}

export const nearPath = (x: number, z: number, m: number) =>
  EDGES.some(([a, b]) => distToSegment(x, z, NODES[a], NODES[b]) < m)

const padded = BUILDINGS.map((b) => buildingBox(b, 3.2))
const nearWater = (x: number, z: number) =>
  isWater(x, z) || Math.abs(x - riverCenterX(z)) < riverHalfWidth(z) + 2.5
const blocked = (x: number, z: number, m: number) =>
  !sceneryWalkable(x, z) || nearWater(x, z) || padded.some((b) => circleHitsBox(x, z, m, b)) || Math.hypot(x, z) < 11 || nearPath(x, z, 2.6)

/**
 * Tree kinds by biome:
 * 0 = Meadow Oak (grass / village)
 * 1 = Evergreen Pine (grass / lush)
 * 2 = Snow-Capped Frost Pine (snow biome)
 * 3 = Desert Saguaro Cactus (sand biome)
 * 4 = Charred Ember Tree (ash / volcano biome)
 * 5 = Ancient Emerald Canopy Tree (lush forest biome)
 */
export type TreeKind = 0 | 1 | 2 | 3 | 4 | 5
export interface Tree { x: number; z: number; s: number; kind: TreeKind }
export const TREES: Tree[] = []
{
  const r = rng(7)
  for (let i = 0; i < 1400 && TREES.length < 260; i++) {
    const x = (r() - 0.5) * 112, z = (r() - 0.5) * 112
    const edge = Math.max(Math.abs(x), Math.abs(z))
    // forest gets dense toward the map edge, sparse inside town
    if (r() > (edge > 38 ? 0.9 : 0.12)) continue
    if (blocked(x, z, 1.2)) continue
    if (TREES.some((t) => Math.hypot(t.x - x, t.z - z) < 2.6)) continue
    TREES.push({ x, z, s: 0.8 + r() * 0.6, kind: r() < 0.55 ? 0 : 1 })
  }
  // the rest of the island, biome by biome. Appended after the first 260 so every older tree keeps its number
  // (saves remember felled trees by index). Each biome gets its own distinctive vegetation!
  const r2 = rng(17), L = WORLD_HALF - 8, cell = new Map<string, boolean>()
  const key = (x: number, z: number) => `${Math.floor(x / 2.6)},${Math.floor(z / 2.6)}`
  for (const t of TREES) cell.set(key(t.x, t.z), true)
  const crowded = (x: number, z: number) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (cell.has(`${Math.floor(x / 2.6) + i},${Math.floor(z / 2.6) + j}`)) return true; return false }
  for (let i = 0; i < 140000 && TREES.length < 5600; i++) {
    const x = (r2() - 0.5) * 2 * L, z = (r2() - 0.5) * 2 * L
    if (Math.max(Math.abs(x), Math.abs(z)) < 57 || coastDist(x, z) < 5 || nearWater(x, z)) continue // the old map is already planted
    if (padded.some((b) => circleHitsBox(x, z, 2.2, b))) continue
    const b = biome(x, z), h = height(x, z), grove = Math.sin(x * 0.07) + Math.cos(z * 0.06) + Math.sin((x + z) * 0.035)
    const p =
      b === 'lush' ? (h < 26 ? 0.9 : 0) :
      b === 'snow' ? (h < 20 ? 0.52 : 0) :
      b === 'sand' ? (h < 14 ? 0.24 : 0) :
      b === 'ash'  ? (h < 16 ? 0.22 : 0) :
      grove > 0.4 ? 0.82 : 0.08
    if (r2() > p || crowded(x, z)) continue
    cell.set(key(x, z), true)
    const kind: TreeKind =
      b === 'snow' ? 2 :
      b === 'sand' ? 3 :
      b === 'ash'  ? 4 :
      b === 'lush' ? (r2() < 0.75 ? 5 : 1) :
      (r2() < 0.55 ? 0 : 1)
    TREES.push({ x, z, s: 0.8 + r2() * 0.7, kind })
  }
}
export const TREE_BOXES: Box[] = TREES.map((t) => ({ minX: t.x - 0.4, maxX: t.x + 0.4, minZ: t.z - 0.4, maxZ: t.z + 0.4 }))

export const ROCKS: { x: number; z: number; s: number; ry: number }[] = []
export const FLOWERS: { x: number; z: number; c: number }[] = []
{
  const r = rng(42)
  while (ROCKS.length < 40) {
    const x = (r() - 0.5) * 110, z = (r() - 0.5) * 110
    if (!blocked(x, z, 1)) ROCKS.push({ x, z, s: 0.3 + r() * 0.6, ry: r() * 6 })
  }
  const r3 = rng(43)
  for (let i = 0; i < 16000 && ROCKS.length < 950; i++) { // rocks out in the wider island, plenty in the desert and ash fields
    const x = (r3() - 0.5) * 2 * (WORLD_HALF - 8), z = (r3() - 0.5) * 2 * (WORLD_HALF - 8), b = biome(x, z)
    if (r3() > (b === 'sand' || b === 'ash' ? 1 : 0.35)) continue
    if (Math.max(Math.abs(x), Math.abs(z)) > 56 && coastDist(x, z) > 4 && !blocked(x, z, 1)) ROCKS.push({ x, z, s: 0.3 + r3() * 1.1, ry: r3() * 6 })
  }
  for (let i = 0; i < 4000 && FLOWERS.length < 420; i++) {
    const x = (r() - 0.5) * 80, z = (r() - 0.5) * 80
    // flowers hug the paths and the residential district
    const close = nearPath(x, z, 4.2) || (x < -22 && x > -38 && z > -32 && z < 16)
    if (close && !nearPath(x, z, 1.5) && !padded.some((b) => circleHitsBox(x, z, 0.2, b)) && Math.abs(x - RIVER_X) > 5 && Math.hypot(x, z) > 10)
      FLOWERS.push({ x, z, c: Math.floor(r() * 5) })
  }
}

/** Lamp posts every ~9 units along each path, offset to the side. */
export const LAMPS: [number, number][] = []
for (const [a, b] of EDGES) {
  const [ax, az] = NODES[a], [bx, bz] = NODES[b]
  const len = Math.hypot(bx - ax, bz - az)
  if (a.startsWith('s') && b.startsWith('s')) continue // square has its own lamps
  for (let t = 4.5; t < len - 2; t += 9) {
    const x = ax + ((bx - ax) * t) / len + ((bz - az) / len) * 1.7
    const z = az + ((bz - az) * t) / len - ((bx - ax) / len) * 1.7
    if (!padded.some((p) => circleHitsBox(x, z, 0.3, p))) LAMPS.push([x, z])
  }
}
for (let i = 0; i < 4; i++) LAMPS.push([Math.cos(i * Math.PI / 2 + Math.PI / 4) * 9.5, Math.sin(i * Math.PI / 2 + Math.PI / 4) * 9.5])
export const LAMP_BOXES: Box[] = LAMPS.map(([x, z]) => ({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2 }))

// ---------- village decorations (benches, well, cart, planters, bushes…). Solid, so they get collision boxes. ----------
export type DecorKind = 'bench' | 'well' | 'cart' | 'board' | 'planter' | 'bush' | 'stump' | 'barrels' | 'crates' | 'sacks'
export interface Decor { kind: DecorKind; x: number; z: number; w: number; d: number; /** facing (radians); w/d are already the turned footprint */ rot: number }
const SIZE: Record<DecorKind, [number, number]> = {
  bench: [1.4, 0.5], well: [1.6, 1.6], cart: [2.2, 1.2], board: [1.4, 0.4], planter: [1, 0.8], bush: [1, 0.8],
  stump: [0.7, 0.6], barrels: [1.2, 0.7], crates: [1.2, 0.8], sacks: [1, 0.7],
}
const decor = (kind: DecorKind, x: number, z: number, rot = 0): Decor => {
  const side = Math.abs(Math.sin(rot)) > 0.5
  return { kind, x, z, w: SIZE[kind][side ? 1 : 0], d: SIZE[kind][side ? 0 : 1], rot }
}
const clearOfTrees = (x: number, z: number, m: number) => !TREES.some((t) => Math.hypot(t.x - x, t.z - z) < m) && !LAMPS.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < m)
const ALL_DECOR: Decor[] = [
  // plaza: four benches facing the fountain from N/S/E/W — each sits in the fountain's own "shadow", so it never
  // narrows a way across the square; flower planters between the lamps
  decor('bench', 0, -4.3, 0), decor('bench', 0, 4.3, Math.PI), decor('bench', 4.3, 0, -Math.PI / 2), decor('bench', -4.3, 0, Math.PI / 2),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i * Math.PI) / 4 + Math.PI / 8; return decor('planter', Math.round(Math.cos(a) * 8.9 * 10) / 10, Math.round(Math.sin(a) * 8.9 * 10) / 10) }),
  decor('board', -4, -13.5), // notice board by the Guild Hall
  decor('well', -20, -8), // residential district
  decor('cart', 21, 8), // by the market
  decor('barrels', 21.6, -1), decor('crates', -20.2, 9), decor('sacks', -19.6, -6),
].filter((d) => clearOfTrees(d.x, d.z, 1.4))
{
  const r = rng(91)
  for (let i = 0; i < 45000 && ALL_DECOR.length < 900; i++) {
    const x = (r() - 0.5) * 2 * (WORLD_HALF - 8), z = (r() - 0.5) * 2 * (WORLD_HALF - 8)
    if (coastDist(x, z) < 4 || biome(x, z) === 'sand' || biome(x, z) === 'ash') continue
    const kind: DecorKind = r() < 0.82 ? 'bush' : 'stump'
    if (blocked(x, z, 1.1) || nearPath(x, z, 3) || !clearOfTrees(x, z, 1.8) || ALL_DECOR.some((d) => Math.hypot(d.x - x, d.z - z) < 2)) continue
    ALL_DECOR.push(decor(kind, Math.round(x * 4) / 4, Math.round(z * 4) / 4))
  }
}
export const decorBox = (d: Decor, pad = 0): Box => ({ minX: d.x - d.w / 2 - pad, maxX: d.x + d.w / 2 + pad, minZ: d.z - d.d / 2 - pad, maxZ: d.z + d.d / 2 + pad })

/** Decorations still standing: anything a building or a new road was put over is gone (worked out live, nothing saved). */
let decorKey = '', decorCache: Decor[] = []
export function decorNow(): Decor[] {
  const key = `${BUILDINGS.length}:${EDGES.length}:${BUILDINGS.map((b) => b.id).join()}`
  if (key !== decorKey) {
    decorKey = key
    const builds = BUILDINGS.map((b) => buildingBox(b, 0.4))
    decorCache = ALL_DECOR.filter((d) => !builds.some((b) => circleHitsBox(d.x, d.z, Math.max(d.w, d.d) / 2, b)) &&
      !EDGES.some(([a, b]) => NODES[a] && NODES[b] && distToSegment(d.x, d.z, NODES[a], NODES[b]) < Math.max(d.w, d.d) / 2 + 1.25))
  }
  return decorCache
}
