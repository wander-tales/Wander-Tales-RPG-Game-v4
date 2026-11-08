// Wall faces for the 3D buildings: each face gets its own pixel texture painted at exactly its size (16 px / m),
// so timber frames, windows and doors line up with the real wall geometry.
import { PAL, box, canvas, px, rect, shade, type Ctx } from '../pixel/paint'

export type Sign = 'mug' | 'bread' | 'anvil' | 'pick' | 'log' | 'gear' | 'potion'
export interface FacadeStyle {
  wall: string; stone?: boolean; half?: boolean; planks?: boolean
  shutter?: string; flowers?: boolean; awning?: [string, string]; sign?: Sign; banners?: boolean; barrels?: boolean
}
export interface Face { door?: 'single' | 'double' | 'barn'; floors: number; windows?: boolean }

const TIMBER = PAL.wood[2]

export function stoneWall(x: Ctx, X: number, Y: number, w: number, h: number, c: string) {
  rect(x, X, Y, w, h, c)
  for (let j = 0; j < h; j += 5) {
    rect(x, X, Y + j, w, 1, shade(c, -0.22))
    for (let i = (j / 5) % 2 ? 0 : 5; i < w; i += 10) { rect(x, X + i, Y + j, 1, Math.min(5, h - j), shade(c, -0.22)); if (j + 1 < h) px(x, X + i + 2, Y + j + 1, shade(c, 0.15)) }
  }
}

/** One wall face. Returns the canvas and night-glow points (lanterns, furnace) in face pixels. */
export function paintFacade(st: FacadeStyle, W: number, H: number, f: Face, seed = 0): { canvas: HTMLCanvasElement; lights: [number, number][] } {
  const [cv, x] = canvas(W, H), lights: [number, number][] = []
  box(x, 0, 0, W, H, st.wall)
  if (st.stone) stoneWall(x, 0, 0, W, H, st.wall)
  else if (st.planks) { for (let i = 0; i < W; i += 4) rect(x, i, 0, 1, H, shade(st.wall, -0.25)); rect(x, 0, 0, W, 2, shade(st.wall, -0.4)) }
  else {
    const split = st.half ? Math.round(H * 0.42) : 0
    if (split) stoneWall(x, 0, H - split, W, split, '#b8b2a6')
    const th = H - split
    for (let fl = 0; fl < f.floors; fl++) rect(x, 0, Math.round((th * fl) / f.floors), W, 2, TIMBER) // floor beams
    rect(x, 0, th - 2, W, 2, TIMBER)
    for (let i = 0; i <= W - 2; i += 22) rect(x, Math.min(i, W - 2), 0, 2, th, TIMBER)
    rect(x, W - 2, 0, 2, th, TIMBER)
    const fh = Math.round(th / f.floors)
    for (let fl = 0; fl < f.floors; fl++) for (let i = 0; i + 22 <= W; i += 22) for (let k = 0; k < Math.min(9, fh / 2 - 1); k++) { px(x, i + 2 + k, fl * fh + 2 + k, TIMBER); px(x, i + 20 - k, fl * fh + 2 + k, TIMBER) } // braces
  }
  stoneWall(x, 0, H - 7, W, 7, PAL.stone[1]) // plinth

  // door
  const dw = f.door === 'double' ? 22 : f.door === 'barn' ? 22 : 14, dh = f.door === 'double' ? 32 : f.door === 'barn' ? 30 : 24
  const doorX = f.door ? Math.floor((W - dw) / 2) : -1
  if (f.door) {
    const dy = H - dh, frame = shade(PAL.stone[1], -0.1)
    box(x, doorX - 2, dy - 2, dw + 4, dh + 2, frame)
    box(x, doorX, dy, dw, dh, PAL.wood[0])
    for (const [cx, cy] of [[doorX, dy], [doorX + dw - 1, dy], [doorX + 1, dy], [doorX + dw - 2, dy], [doorX, dy + 1], [doorX + dw - 1, dy + 1]]) px(x, cx, cy, frame) // arched top
    for (let i = 3; i < dw - 1; i += 4) rect(x, doorX + i, dy + 2, 1, dh - 2, TIMBER)
    if (dw > 16) rect(x, doorX + Math.floor(dw / 2), dy, 1, dh, TIMBER)
    if (f.door === 'barn') for (let k = 0; k < dh - 4; k++) { const t = Math.round((k * (dw - 4)) / (dh - 4)); px(x, doorX + 2 + t, dy + 2 + k, '#f2e3c6'); px(x, doorX + dw - 3 - t, dy + 2 + k, '#f2e3c6') }
    px(x, doorX + dw - 4, dy + Math.floor(dh / 2), '#e7c35b')
    if (f.door !== 'barn') for (const lx of [doorX - 7, doorX + dw + 4]) {
      if (lx < 2 || lx > W - 5) continue
      rect(x, lx + 1, dy, 1, 2, '#2a2d34'); box(x, lx, dy + 2, 3, 5, '#2a2d34'); rect(x, lx + 1, dy + 3, 1, 3, '#f4d35e')
      lights.push([lx + 1, dy + 5])
    }
  }
  // awning
  if (st.awning) {
    for (let i = 0; i < W - 4; i++) rect(x, 2 + i, 3, 1, 6, Math.floor(i / 4) % 2 ? st.awning[0] : st.awning[1])
    for (let i = 0; i < W - 4; i += 2) px(x, 2 + i, 9, Math.floor(i / 4) % 2 ? st.awning[0] : st.awning[1])
  }
  // windows: one row per floor, shutters + flower boxes
  if (f.windows !== false) {
    const th = H - 7, fh = th / f.floors
    for (let fl = 0; fl < f.floors; fl++) for (let i = 8; i + 12 < W - 6; i += 26) {
      const yy = Math.round(fl * fh + (fh - 14) / 2 + (st.awning && fl === 0 ? 4 : 0))
      if (doorX >= 0 && i + 16 > doorX - 9 && i - 4 < doorX + dw + 9 && yy + 14 > H - dh - 3) continue
      if (st.banners && (i < 22 || i > W - 34) && fl === 0) continue
      if (st.shutter) { box(x, i - 4, yy, 3, 12, st.shutter); box(x, i + 13, yy, 3, 12, st.shutter) }
      box(x, i - 1, yy - 1, 14, 14, TIMBER)
      rect(x, i, yy, 12, 12, '#5d8fc4'); rect(x, i, yy, 12, 3, '#9cc4e8'); px(x, i + 2, yy + 4, '#cfe4f4')
      rect(x, i + 5, yy, 2, 12, TIMBER); rect(x, i, yy + 5, 12, 2, TIMBER)
      if (st.flowers) { box(x, i - 2, yy + 13, 16, 3, PAL.wood[1]); for (let k = 0; k < 7; k++) px(x, i - 1 + k * 2, yy + 12 - (k % 2), PAL.flower[(k + seed) % PAL.flower.length]); rect(x, i - 1, yy + 13, 14, 1, PAL.leaf[1]) }
    }
  }
  // trade details
  if (st.banners) for (const bx of [6, W - 18]) {
    box(x, bx, 2, 12, 28, '#3e5c8a'); rect(x, bx, 2, 12, 2, '#e7c35b'); rect(x, bx + 1, 29, 4, 2, '#3e5c8a'); rect(x, bx + 7, 29, 4, 2, '#3e5c8a')
    for (let k = 0; k < 6; k++) { px(x, bx + 3 + k, 9 + k, '#e7c35b'); px(x, bx + 8 - k, 9 + k, '#e7c35b') }
  }
  if (st.sign && f.door) {
    const sx = doorX + dw + 12 < W - 14 ? doorX + dw + 10 : Math.max(2, doorX - 22), sy = Math.max(2, H - dh - 14)
    rect(x, sx + 3, sy - 3, 10, 1, '#2a2d34'); rect(x, sx + 6, sy - 2, 1, 2, '#2a2d34')
    for (let j = 0; j < 14; j++) for (let i = 0; i < 14; i++) { const d = (i - 6.5) ** 2 + (j - 6.5) ** 2; if (d < 49) px(x, sx + i, sy + j, d > 36 ? TIMBER : PAL.wood[1]) }
    const S = st.sign
    if (S === 'mug') { rect(x, sx + 4, sy + 5, 5, 6, '#e7c35b'); rect(x, sx + 4, sy + 3, 5, 2, '#ffffff'); rect(x, sx + 9, sy + 6, 1, 3, '#e7c35b') }
    else if (S === 'bread') { rect(x, sx + 3, sy + 6, 8, 4, '#d69a4a'); rect(x, sx + 4, sy + 5, 6, 1, '#e8b870') }
    else if (S === 'anvil') { rect(x, sx + 3, sy + 5, 8, 3, '#3a3d44'); rect(x, sx + 5, sy + 8, 4, 3, '#3a3d44') }
    else rect(x, sx + 4, sy + 4, 6, 6, { pick: '#9aa0a8', log: '#7a5434', gear: '#9aa0a8', potion: '#9a7be0' }[S])
  }
  if (st.barrels) for (const bx of [W - 12, 2]) {
    if (doorX >= 0 && bx + 10 > doorX - 8 && bx < doorX + dw + 8) continue
    box(x, bx, H - 11, 9, 11, PAL.wood[1]); rect(x, bx, H - 8, 9, 1, '#3a3d44'); rect(x, bx, H - 3, 9, 1, '#3a3d44')
  }
  return { canvas: cv, lights }
}

/** Gable end (triangle): plaster with a timber edge, a king post and a small window. Drawn on a rectangle; the mesh
 * only shows the triangle. */
export function paintGable(st: FacadeStyle, W: number, H: number, emblem = false) {
  const [cv, x] = canvas(W, H)
  rect(x, 0, 0, W, H, st.planks || st.stone ? st.wall : st.wall)
  if (st.planks) for (let i = 0; i < W; i += 4) rect(x, i, 0, 1, H, shade(st.wall, -0.25))
  else if (st.stone) stoneWall(x, 0, 0, W, H, st.wall)
  else { rect(x, Math.floor(W / 2) - 1, 0, 2, H, TIMBER); rect(x, 0, H - 3, W, 3, TIMBER) }
  const cx = Math.floor(W / 2), cy = Math.round(H * 0.55)
  if (emblem) { box(x, cx - 7, cy - 8, 14, 15, '#3e5c8a'); rect(x, cx - 7, cy - 8, 14, 2, '#e7c35b'); for (let k = 0; k < 8; k++) { px(x, cx - 4 + k, cy - 4 + k, '#e7c35b'); px(x, cx + 3 - k, cy - 4 + k, '#e7c35b') } }
  else if (H > 18) { box(x, cx - 5, cy - 5, 10, 10, TIMBER); rect(x, cx - 4, cy - 4, 8, 8, '#9cc4e8'); rect(x, cx - 1, cy - 4, 2, 8, TIMBER); rect(x, cx - 4, cy - 1, 8, 2, TIMBER) }
  return cv
}
