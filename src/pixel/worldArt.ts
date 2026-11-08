// Ground texture for the 3D town (grass, roads, plaza, river banks, farm fields, flowers) painted from the real map
// data, plus the lamp glow. Art never decides what is solid: collision stays in game/map.ts + game/town.ts.
import { BUILDINGS, EDGES, NODES, RIVER_X, RIVER_W, TOWN_HALF } from '../game/map'
import { FLOWERS } from '../game/scenery'
import { PAL, PPM, canvas, px, rect } from './paint'

export const WORLD_PX = TOWN_HALF * 2 * PPM
export const toPx = (m: number) => Math.round((m + TOWN_HALF) * PPM)

const rgb = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
function segDist(px0: number, pz0: number, a: [number, number], b: [number, number]) {
  const vx = b[0] - a[0], vz = b[1] - a[1], l = vx * vx + vz * vz || 1
  const t = Math.max(0, Math.min(1, ((px0 - a[0]) * vx + (pz0 - a[1]) * vz) / l))
  return Math.hypot(px0 - (a[0] + vx * t), pz0 - (a[1] + vz * t))
}

// ---------- ground ----------
const enum G { Grass, Path, PathEdge, Stone, StoneEdge, Sand, Soil, Field }
/** The town's ground as one canvas, ±TOWN_HALF m round the centre (grass, roads, plaza, river banks, farm fields, flowers).
 * Rebuilt when the town changes. The rest of the island is the 3D terrain (scene/terrain3d.ts). */
export function paintGround(): HTMLCanvasElement {
  const N = WORLD_PX
  const kind = new Uint8Array(N * N)
  const set = (i: number, j: number, k: G) => { if (i >= 0 && j >= 0 && i < N && j < N) kind[j * N + i] = k }
  // roads: every walk-graph edge, 2.5 m wide, with a darker worn edge
  for (const [a, b] of EDGES) {
    const A = NODES[a], B = NODES[b]
    if (!A || !B) continue
    const x0 = toPx(Math.min(A[0], B[0]) - 2), x1 = toPx(Math.max(A[0], B[0]) + 2), z0 = toPx(Math.min(A[1], B[1]) - 2), z1 = toPx(Math.max(A[1], B[1]) + 2)
    for (let j = z0; j < z1; j++) for (let i = x0; i < x1; i++) {
      const d = segDist(i / PPM - TOWN_HALF, j / PPM - TOWN_HALF, A, B) * PPM + hash(i >> 1, j >> 1) * 2
      const k = kind[j * N + i]
      if (d < 19) set(i, j, G.Path)
      else if (d < 21 && k === G.Grass) set(i, j, G.PathEdge)
    }
  }
  // town square: cobbled plaza
  const c = toPx(0), R = 9.5 * PPM // the square: big enough for the fountain, benches and a crowd, not the whole town
  for (let j = c - R - 2; j < c + R + 2; j++) for (let i = c - R - 2; i < c + R + 2; i++) {
    const d = Math.hypot(i - c, j - c)
    if (d < R) set(i, j, G.Stone); else if (d < R + 2) set(i, j, G.StoneEdge)
  }
  // river banks (water itself is an animated layer on top)
  for (let j = 0; j < N; j++) for (const i of [toPx(RIVER_X - RIVER_W / 2) - 6, toPx(RIVER_X + RIVER_W / 2)]) for (let k = 0; k < 6; k++) set(i + k, j, G.Sand)
  // farm: tilled rows inside the fence, market forecourt cobbled
  for (const b of BUILDINGS) {
    const x0 = toPx(b.x - b.w / 2), x1 = toPx(b.x + b.w / 2), z0 = toPx(b.z - b.d / 2), z1 = toPx(b.z + b.d / 2)
    if (b.kind === 'farm') for (let j = z0; j < z1; j++) for (let i = x0; i < x1; i++) set(i, j, (j >> 3) % 2 ? G.Field : G.Soil)
    if (b.kind === 'market') for (let j = z0; j < z1; j++) for (let i = x0; i < x1; i++) set(i, j, G.Stone)
  }

  const [cv, x] = canvas(N, N)
  const img = x.createImageData(N, N), d = img.data
  const grass = PAL.grass.map(rgb), dirt = PAL.dirt.map(rgb), stone = PAL.stone.map(rgb)
  const mortar = rgb(PAL.mortar), edge = rgb(PAL.dirtEdge), sand = rgb(PAL.sand), soil = rgb('#7a5434'), soilHi = rgb('#8f6640'), crop = rgb('#7fb04a'), cropHi = rgb('#a9cf5a'), gdark = rgb(PAL.grassDark)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = hash(i >> 1, j >> 1)
    let col: number[]
    switch (kind[j * N + i] as G) {
      case G.Path: col = dirt[h < 0.7 ? 0 : h < 0.9 ? 1 : 2]; break
      case G.PathEdge: col = edge; break
      case G.Stone: { // brick-bond cobbles 8×6 with mortar lines
        const row = Math.floor(j / 6), off = row % 2 ? 4 : 0
        col = j % 6 === 0 || (i + off) % 8 === 0 ? mortar : stone[Math.floor(hash((i + off) >> 3, row) * 3)]
        break
      }
      case G.StoneEdge: col = mortar; break
      case G.Sand: col = sand; break
      case G.Soil: col = h < 0.8 ? soil : soilHi; break
      case G.Field: col = (i >> 1) % 3 === 0 ? soil : h < 0.5 ? crop : cropHi; break
      default: {
        col = grass[h < 0.62 ? 0 : h < 0.84 ? 1 : h < 0.94 ? 2 : 3]
        const t = hash(i >> 2, j >> 2) // little grass tufts
        if (t < 0.035 && (i & 3) === 1 && (j & 3) < 2) col = gdark
      }
    }
    const k = (j * N + i) * 4
    d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255
  }
  x.putImageData(img, 0, 0)
  // flowers (tiny 3-pixel blossoms)
  for (const f of FLOWERS) {
    const X = toPx(f.x), Y = toPx(f.z), fc = PAL.flower[f.c % PAL.flower.length]
    px(x, X, Y - 1, fc); px(x, X - 1, Y, fc); px(x, X + 1, Y, fc); px(x, X, Y, '#f4d35e'); px(x, X, Y + 1, PAL.grassDark)
  }
  // farm fence (low, drawn flat on the ground; the real fence collision lives in map.ts)
  for (const b of BUILDINGS.filter((q) => q.kind === 'farm')) {
    const x0 = toPx(b.x - b.w / 2), x1 = toPx(b.x + b.w / 2), z0 = toPx(b.z - b.d / 2), z1 = toPx(b.z + b.d / 2)
    const gate = [toPx(b.x - 1.6), toPx(b.x + 1.6)]
    for (let i = x0; i <= x1; i++) { rect(x, i, z0, 1, 2, PAL.wood[0]); if (i < gate[0] || i > gate[1]) rect(x, i, z1 - 2, 1, 2, PAL.wood[0]) }
    for (let j = z0; j <= z1; j++) { rect(x, x0, j, 2, 1, PAL.wood[0]); rect(x, x1 - 2, j, 2, 1, PAL.wood[0]) }
    for (let i = x0; i <= x1; i += 8) { rect(x, i, z0 - 2, 2, 4, PAL.wood[2]); if (i < gate[0] || i > gate[1]) rect(x, i, z1 - 4, 2, 4, PAL.wood[2]) }
  }
  return cv
}

/** Soft round light for lamps at night (additive). */
export function paintGlow(r = 40): HTMLCanvasElement {
  const [cv, x] = canvas(r * 2, r * 2)
  for (let j = 0; j < r * 2; j++) for (let i = 0; i < r * 2; i++) {
    const d = Math.hypot(i - r, j - r) / r
    if (d < 1) { const a = Math.round((1 - d) * 4) / 4 * 0.5; x.fillStyle = `rgba(255,200,110,${a})`; x.fillRect(i, j, 1, 1) } // stepped falloff, no smooth gradient
  }
  return cv
}
