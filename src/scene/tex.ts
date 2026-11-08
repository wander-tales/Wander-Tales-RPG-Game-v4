// Pixel-art textures for 3D surfaces. Everything is painted on small canvases (pixel/paint.ts helpers) and sampled
// nearest-neighbour, so 3D faces keep crisp pixels. Texel density: 16 px per metre everywhere (PPM).
import * as THREE from 'three'
import { PAL, PPM, box, canvas, px, rect, rnd, shade } from '../pixel/paint'

export function tex(cv: HTMLCanvasElement, repeat = false) {
  const t = new THREE.CanvasTexture(cv)
  t.magFilter = THREE.NearestFilter // crisp pixels up close…
  t.minFilter = THREE.LinearMipmapLinearFilter // …and no shimmering noise when zoomed far out
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Re-maps a geometry's UVs to world metres / `tile` (box-projected by face normal), so one repeating texture keeps
 * the same pixel size on every face of every size. */
export function worldUV(g: THREE.BufferGeometry, tile: number) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, -z / tile)
    else if (ax >= az) uv.setXY(i, (n.getX(i) > 0 ? -z : z) / tile, y / tile)
    else uv.setXY(i, (n.getZ(i) > 0 ? x : -x) / tile, y / tile)
  }
  uv.needsUpdate = true
  return g
}

const cache = new Map<string, THREE.Texture>()
const cached = (key: string, make: () => HTMLCanvasElement) => { let t = cache.get(key); if (!t) { t = tex(make(), true); cache.set(key, t) } return t }

/** 2 m roof tile pattern: overlapping rows with scalloped edges and glints. */
export const roofTex = (c: string) => cached(`roof:${c}`, () => {
  const [cv, x] = canvas(32, 32)
  rect(x, 0, 0, 32, 32, c)
  for (let j = 0; j < 32; j += 4) {
    rect(x, 0, j + 3, 32, 1, shade(c, -0.32))
    for (let i = (j / 4) % 2 ? 0 : 3; i < 32; i += 6) { rect(x, i, j, 1, 3, shade(c, -0.18)); px(x, i + 2, j + 1, shade(c, 0.2)) }
  }
  return cv
})
export const stoneTex = (c: string = PAL.stone[1]) => cached(`stone:${c}`, () => {
  const [cv, x] = canvas(32, 32), r = rnd(3)
  rect(x, 0, 0, 32, 32, c)
  for (let j = 0; j < 32; j += 6) {
    rect(x, 0, j, 32, 1, shade(c, -0.25))
    for (let i = (j / 6) % 2 ? 0 : 6; i < 32; i += 12) { rect(x, i, j, 1, 6, shade(c, -0.25)); px(x, i + 2, j + 2, shade(c, 0.18)); if (r() < 0.5) px(x, i + 7, j + 4, shade(c, -0.1)) }
  }
  return cv
})
export const plankTex = (c: string = PAL.wood[1], vertical = false) => cached(`plank:${c}:${vertical}`, () => {
  const [cv, x] = canvas(32, 32), r = rnd(9)
  rect(x, 0, 0, 32, 32, c)
  for (let k = 0; k < 32; k += 4) {
    if (vertical) rect(x, k, 0, 1, 32, shade(c, -0.3)); else rect(x, 0, k, 32, 1, shade(c, -0.3))
    const o = Math.floor(r() * 28); if (vertical) rect(x, k + 2, o, 1, 3, shade(c, 0.15)); else rect(x, o, k + 2, 3, 1, shade(c, 0.15))
  }
  return cv
})
export const barkTex = () => cached('bark', () => {
  const [cv, x] = canvas(16, 16)
  rect(x, 0, 0, 16, 16, PAL.trunk[0])
  for (let i = 0; i < 16; i += 3) rect(x, i, 0, 1, 16, PAL.trunk[1])
  px(x, 4, 5, shade(PAL.trunk[0], 0.2)); px(x, 10, 11, shade(PAL.trunk[0], 0.2))
  return cv
})
/** Leafy texture: tones scattered in 2×2 clumps. */
export const leafTex = (base: string, light: string, dark: string) => cached(`leaf:${base}`, () => {
  const [cv, x] = canvas(32, 32), r = rnd(base.length * 17)
  rect(x, 0, 0, 32, 32, base)
  for (let k = 0; k < 90; k++) rect(x, Math.floor(r() * 31), Math.floor(r() * 31), 2, 2, r() < 0.5 ? light : dark)
  return cv
})
export const flowerBedTex = () => cached('flowers', () => {
  const [cv, x] = canvas(32, 32), r = rnd(4)
  rect(x, 0, 0, 32, 32, PAL.leaf[0])
  for (let k = 0; k < 60; k++) rect(x, Math.floor(r() * 31), Math.floor(r() * 31), 2, 2, PAL.leaf[r() < 0.5 ? 1 : 2])
  for (let k = 0; k < 26; k++) { const fx = Math.floor(r() * 30), fy = Math.floor(r() * 30), c = PAL.flower[Math.floor(r() * PAL.flower.length)]; px(x, fx + 1, fy, c); px(x, fx, fy + 1, c); px(x, fx + 2, fy + 1, c); px(x, fx + 1, fy + 2, c); px(x, fx + 1, fy + 1, '#f4d35e') }
  return cv
})
export const waterTex = () => cached('water', () => {
  const [cv, x] = canvas(32, 32), r = rnd(11)
  rect(x, 0, 0, 32, 32, PAL.water[0])
  for (let k = 0; k < 14; k++) rect(x, Math.floor(r() * 32), Math.floor(r() * 32), 2 + Math.floor(r() * 4), 1, k % 3 ? PAL.water[1] : PAL.water[2])
  return cv
})
/** Striped awning cloth, stripes running down the slope. */
export const stripeTex = (a: string, b: string) => cached(`stripe:${a}:${b}`, () => {
  const [cv, x] = canvas(16, 16)
  rect(x, 0, 0, 8, 16, a); rect(x, 8, 0, 8, 16, b); rect(x, 0, 15, 16, 1, shade(a, -0.3))
  return cv
})
export const paperTex = () => cached('paper', () => {
  const [cv, x] = canvas(32, 16)
  box(x, 0, 0, 32, 16, PAL.wood[1]); rect(x, 2, 2, 28, 12, '#c9a46a')
  for (let k = 0; k < 5; k++) { rect(x, 3 + k * 6, 3 + (k % 2) * 3, 5, 6, k % 2 ? '#f2e3c6' : '#ffffff'); rect(x, 4 + k * 6, 5 + (k % 2) * 3, 3, 1, '#857e72') }
  return cv
})

/** Shared lit material for a pixel texture (Lambert: cheap, flat-ish shading that suits pixel art). */
const mats = new Map<THREE.Texture, THREE.MeshLambertMaterial>()
export function matOf(t: THREE.Texture, opts: { alphaTest?: number; side?: THREE.Side } = {}) {
  if (opts.alphaTest || opts.side) return new THREE.MeshLambertMaterial({ map: t, alphaTest: opts.alphaTest ?? 0, side: opts.side ?? THREE.FrontSide })
  let m = mats.get(t)
  if (!m) { m = new THREE.MeshLambertMaterial({ map: t }); mats.set(t, m) }
  return m
}
const plain = new Map<string, THREE.MeshLambertMaterial>()
export const colorMat = (c: string, emissive?: string) => {
  const k = `${c}:${emissive ?? ''}`
  let m = plain.get(k)
  if (!m) { m = new THREE.MeshLambertMaterial({ color: c, emissive: emissive ?? '#000000' }); plain.set(k, m) }
  return m
}

export { PPM }
