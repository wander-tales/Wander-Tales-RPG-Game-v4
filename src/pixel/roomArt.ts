// Pixel art for building interiors, painted over the real room layout (game/interior.ts ROOMS). Every piece of
// furniture is drawn on top of its own collision box, so what you see is exactly what blocks you.
import { ROOMS, type RoomId } from '../game/interior'
import type { Box } from '../game/collision'
import { PAL, PPM, box, canvas, outline, px, rect, rnd, shade, type Ctx } from './paint'

export const SHELL_COUNT = 5 // the first boxes of every room are its outer walls

export type Kind = 'stairs' | 'desk' | 'fire' | 'shelf' | 'crates' | 'barrel' | 'logs' | 'plant' | 'bar' | 'table' | 'barrels' | 'oven' | 'counter' | 'rack' | 'sacks' | 'forge' | 'anvil' | 'tools' | 'bed' | 'hearth' | 'wardrobe' | 'weapons'
/** What each furniture box is, in ROOMS order (after the shell). */
export const FURNITURE: Record<RoomId, Kind[]> = {
  guild: ['stairs', 'desk', 'fire', 'shelf', 'shelf', 'crates', 'barrel', 'logs', 'plant', 'plant', 'plant'],
  tavern: ['bar', 'fire', 'table', 'table', 'table', 'table', 'barrels', 'shelf', 'plant', 'plant', 'plant'],
  bakery: ['oven', 'counter', 'table', 'rack', 'rack', 'sacks'],
  blacksmith: ['forge', 'anvil', 'weapons', 'tools', 'crates'],
  house: ['bed', 'hearth', 'table', 'wardrobe'],
}
export const HEIGHT: Record<Kind, number> = { stairs: 6, desk: 14, fire: 40, shelf: 36, crates: 14, barrel: 14, logs: 10, plant: 14, bar: 14, table: 10, barrels: 16, oven: 40, counter: 14, rack: 30, sacks: 10, forge: 36, anvil: 12, tools: 30, bed: 10, hearth: 34, wardrobe: 40, weapons: 30 }
export const FIRES: Kind[] = ['fire', 'oven', 'forge', 'hearth']

export const FLOOR: Record<RoomId, [string, string, 'plank' | 'tile' | 'stone']> = {
  guild: ['#9a6a3e', '#8a5c33', 'plank'], tavern: ['#7a5232', '#6b4628', 'plank'], bakery: ['#c98a5a', '#b87a4c', 'tile'],
  blacksmith: ['#8f877b', '#7d756b', 'stone'], house: ['#a87a4a', '#966a3e', 'plank'],
}
export const WALL: Record<RoomId, string> = { guild: '#e8d9b8', tavern: '#d9b98a', bakery: '#f2e3c6', blacksmith: '#8f877b', house: '#e6d3ad' }

export interface Piece { canvas: HTMLCanvasElement; box: Box; kind: Kind }
/** One sprite per furniture box, standing on its box (anchor bottom-left at minX, maxZ). */
export function paintFurniture(room: RoomId): Piece[] {
  return ROOMS[room].boxes.slice(SHELL_COUNT).map((b, i) => {
    const kind = FURNITURE[room][i] ?? 'crates'
    const w = Math.round((b.maxX - b.minX) * PPM), d = Math.round((b.maxZ - b.minZ) * PPM), h = HEIGHT[kind]
    const [cv, x] = canvas(w + 2, d + h + 2)
    piece(x, kind, 1, 1, w, d, h)
    outline(x, 0, 0, cv.width, cv.height)
    return { canvas: cv, box: b, kind }
  })
}

function piece(x: Ctx, k: Kind, X: number, Y: number, w: number, d: number, h: number) {
  const top = (c: string) => box(x, X, Y, w, d, c), front = (c: string) => box(x, X, Y + d, w, h, c)
  const wood = PAL.wood[1], dark = PAL.wood[2], stone = PAL.stone[1]
  switch (k) {
    case 'stairs':
      top('#7a4e2c')
      for (let j = 0; j < d; j += 8) { rect(x, X, Y + j, w, 2, shade('#7a4e2c', 0.25)); rect(x, X, Y + j + 6, w, 2, shade('#7a4e2c', -0.3)) }
      rect(x, X + Math.floor(w / 2) - 7, Y, 14, d, '#a82e2c'); front(dark); return
    case 'desk': case 'bar': case 'counter':
      top(wood); front(dark)
      for (let i = 4; i < w - 4; i += 10) rect(x, X + i, Y + d + 2, 6, h - 4, shade(dark, 0.15))
      if (k === 'bar') for (let i = 6; i < w - 6; i += 14) { box(x, X + i, Y + 3, 5, 6, '#e7c35b'); px(x, X + i + 5, Y + 5, '#e7c35b') }
      if (k === 'desk') { box(x, X + 6, Y + 4, 10, 8, '#f2e3c6'); box(x, X + w - 14, Y + 3, 6, 7, '#5fb3d6') }
      if (k === 'counter') for (let i = 6; i < w - 8; i += 16) box(x, X + i, Y + 4, 10, 6, '#d69a4a')
      return
    case 'fire': case 'hearth': case 'oven': case 'forge': {
      const c = k === 'oven' ? '#b8442e' : k === 'forge' ? '#4a4a52' : stone
      top(shade(c, -0.1)); front(c)
      for (let j = 0; j < h; j += 6) for (let i = (j / 6) % 2 ? 0 : 5; i < w; i += 10) rect(x, X + i, Y + d + j, 1, 6, shade(c, -0.3))
      const ow = Math.min(w - 8, 22), ox = X + Math.floor((w - ow) / 2), oy = Y + d + h - 18
      rect(x, ox, oy, ow, 16, '#1d1622'); rect(x, ox + 3, oy + 8, ow - 6, 8, '#f29a4a'); rect(x, ox + 6, oy + 5, ow - 12, 5, '#f4d35e')
      if (k === 'forge') box(x, X + 2, Y + 2, 10, 10, '#f29a4a')
      return
    }
    case 'shelf': case 'rack': case 'wardrobe': case 'tools': case 'weapons': {
      top(dark); front(k === 'wardrobe' ? wood : shade(wood, -0.1))
      if (k === 'wardrobe') { rect(x, X + Math.floor(w / 2), Y + d + 2, 1, h - 4, dark); px(x, X + Math.floor(w / 2) - 2, Y + d + h / 2, '#e7c35b'); px(x, X + Math.floor(w / 2) + 2, Y + d + h / 2, '#e7c35b'); return }
      const r = rnd(w * 7 + d), cols = ['#9c3d3d', '#3e5c8a', '#3f7a3a', '#d6a03c', '#8a5a9a']
      for (let j = 4; j < h - 4; j += 9) {
        rect(x, X + 1, Y + d + j + 7, w - 2, 1, dark)
        for (let i = 2; i < w - 3; i += 3) {
          const c = k === 'rack' ? '#d69a4a' : k === 'tools' || k === 'weapons' ? '#9aa0a8' : cols[Math.floor(r() * cols.length)]
          rect(x, X + i, Y + d + j + (k === 'rack' ? 3 : 1), 2, k === 'rack' ? 4 : 6, c)
        }
      }
      // tall side pieces (a shelf along a side wall is deep but narrow): fill the top with the same goods
      if (d > 30) for (let j = 4; j < d - 4; j += 6) rect(x, X + 2, Y + j, w - 4, 3, k === 'rack' ? '#d69a4a' : k === 'weapons' ? '#9aa0a8' : cols[(j / 6) % cols.length])
      return
    }
    case 'table': top(wood); rect(x, X + 1, Y + 1, w - 2, 1, shade(wood, 0.3)); rect(x, X + 2, Y + d, 3, h, dark); rect(x, X + w - 5, Y + d, 3, h, dark); box(x, X + w / 2 - 3, Y + d / 2 - 3, 6, 5, '#e7c35b'); return
    case 'bed': top('#efe0bf'); box(x, X + 2, Y + 2, w - 4, 10, '#ffffff'); box(x, X, Y + 14, w, d - 14, '#3e5c8a'); front(dark); return
    case 'anvil': top(dark); box(x, X + 4, Y + 2, w - 8, 10, '#5a5a62'); front(dark); box(x, X + w - 14, Y + 4, 10, d - 8, wood); return
    case 'plant': box(x, X + 2, Y + d - 2, w - 4, h, '#b8442e'); for (let k2 = 0; k2 < 3; k2++) box(x, X + 1 + k2 * 3, Y - 4 + (k2 % 2) * 3, 6, 8, PAL.leaf[k2 % 2]); return
    case 'barrel': case 'barrels': {
      const n = Math.max(1, Math.round(d / 14))
      for (let k2 = 0; k2 < n; k2++) { const yy = Y + k2 * Math.floor(d / n); box(x, X, yy, w, Math.floor(d / n), shade(wood, -0.1)); box(x, X + 1, yy + Math.floor(d / n), w - 2, h, wood); rect(x, X + 1, yy + Math.floor(d / n) + 3, w - 2, 1, '#3a3d44'); rect(x, X + 1, yy + Math.floor(d / n) + h - 4, w - 2, 1, '#3a3d44') }
      return
    }
    case 'sacks': for (let k2 = 0; k2 < 4; k2++) box(x, X + (k2 % 2) * (w / 2), Y + Math.floor(k2 / 2) * (d / 2), w / 2, d / 2 + h, k2 % 2 ? '#e8dcc8' : '#d6c49a'); return
    case 'logs': top(wood); front(wood); for (let i = 0; i < w; i += 5) { rect(x, X + i, Y + d + 2, 4, 4, '#c9a46a'); px(x, X + i + 1, Y + d + 3, dark) } return
    default: top(wood); front(dark); rect(x, X, Y + d + Math.floor(h / 2), w, 1, shade(dark, -0.3)); rect(x, X + Math.floor(w / 2), Y + d, 1, h, shade(dark, -0.3))
  }
}
