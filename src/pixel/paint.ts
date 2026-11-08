// Pixel art drawing helpers. Every sprite and tile in the 2D world is drawn here, pixel by pixel, on small canvases
// that the renderer uploads with nearest-neighbour sampling.
//
// SCALE (documented once, used everywhere):
//   1 world metre = 16 px  (environment tiles are 16×16 = 1 m²)
//   character frames are 32×32 px, feet pivot at (16, 31)
//   the whole world is drawn at an integer zoom (2×, 3×, 4×…), never fractional

export const PPM = 16 // pixels per metre

/** Fantasy palette — shared by tiles, buildings and characters so nothing looks off-model. */
export const PAL = {
  outline: '#1d1622',
  grass: ['#5c9c48', '#6aac52', '#4f8a3f', '#7bbd5c'],
  grassDark: '#3f7334',
  dirt: ['#c9a46a', '#bd955c', '#d6b27a'],
  dirtEdge: '#9c7748',
  stone: ['#b8b2a6', '#a59f93', '#cbc5b9'],
  mortar: '#857e72',
  water: ['#3f86c4', '#4f97d2', '#6cb0e2', '#2f6fa8'],
  sand: '#e2cf96',
  wood: ['#8a5a33', '#a2733f', '#6b4426'],
  leaf: ['#3f7a3a', '#4f8f44', '#2f5f2e', '#67a852'],
  pine: ['#2f5f42', '#3c7552', '#244a34'],
  trunk: ['#6b4426', '#553419'],
  flower: ['#e86a7a', '#f2d35a', '#ffffff', '#9a7be0', '#f29a4a'],
}

export type Ctx = CanvasRenderingContext2D

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const x = c.getContext('2d', { willReadFrequently: true })!
  x.imageSmoothingEnabled = false
  return [c, x]
}

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
/** Lighten (k > 0) or darken (k < 0) a colour, hue-shifted a touch toward warm light / cool shadow like hand-picked ramps. */
export function shade(c: string, k: number) {
  const [r, g, b] = hex(c)
  return k >= 0
    ? toHex(r + (255 - r) * k + 6 * k, g + (255 - g) * k, b + (255 - b) * k - 6 * k)
    : toHex(r * (1 + k) - 4 * k, g * (1 + k), b * (1 + k) - 10 * k)
}

export const px = (x: Ctx, X: number, Y: number, c: string) => { x.fillStyle = c; x.fillRect(X, Y, 1, 1) }
export const rect = (x: Ctx, X: number, Y: number, w: number, h: number, c: string) => { if (w > 0 && h > 0) { x.fillStyle = c; x.fillRect(X, Y, w, h) } }
/** A filled block with a light top row and dark bottom row / right column — the basic shaded volume. */
export function box(x: Ctx, X: number, Y: number, w: number, h: number, c: string) {
  rect(x, X, Y, w, h, c)
  if (h > 2) rect(x, X, Y, w, 1, shade(c, 0.22))
  if (h > 2) rect(x, X, Y + h - 1, w, 1, shade(c, -0.28))
  if (w > 2) rect(x, X + w - 1, Y + 1, 1, h - 2, shade(c, -0.16))
}

/** Add a 1-px outline around every opaque pixel of a region (same style on every character). */
export function outline(x: Ctx, X: number, Y: number, w: number, h: number, c = PAL.outline) {
  const img = x.getImageData(X, Y, w, h), d = img.data
  const solid = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 0
  const [r, g, b] = hex(c), add: number[] = []
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (solid(i, j)) continue
    if (solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1)) add.push((j * w + i) * 4)
  }
  for (const k of add) { d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255 }
  x.putImageData(img, X, Y)
}

/** Seeded random, so the same world draws the same way every time. */
export function rnd(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
}
