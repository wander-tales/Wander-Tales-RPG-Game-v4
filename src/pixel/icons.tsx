// Pixel-art UI icons, painted in code like the rest of the art: 12×12, always shown at exactly 2× (24 px).
import { PAL, box, canvas, outline, px, rect, shade, type Ctx } from './paint'

export type IconName = 'town' | 'residents' | 'buildings' | 'build' | 'storage' | 'guild' | 'chronicle' | 'community' | 'settings' | 'explore' | 'map' | 'quests' | 'inventory'

const K = PAL.outline, RED = '#c0473a', BLUE = '#3e5c8a', GOLD = '#e8b84a', SKIN = '#f1c9a5', PARCH = '#f2e2bd', METAL = '#9aa0a8'
const disc = (x: Ctx, cx: number, cy: number, r: number, c: string) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.5) px(x, cx + i, cy + j, c) }

const PAINT: Record<IconName, (x: Ctx) => void> = {
  town: (x) => { // castle with a flag
    box(x, 1, 4, 3, 7, PAL.stone[1]); box(x, 8, 4, 3, 7, PAL.stone[1]); box(x, 3, 6, 6, 5, PAL.stone[2])
    for (const tx of [1, 3, 8, 10]) px(x, tx, 3, PAL.stone[1])
    rect(x, 5, 8, 2, 3, PAL.wood[2]); rect(x, 5, 1, 1, 5, K); rect(x, 6, 1, 3, 2, RED)
  },
  residents: (x) => { // two villagers
    disc(x, 3, 3, 1, SKIN); rect(x, 2, 1, 3, 1, PAL.wood[2]); box(x, 1, 5, 5, 5, BLUE)
    disc(x, 8, 4, 1, SKIN); rect(x, 7, 2, 3, 1, '#d7a64a'); box(x, 6, 6, 5, 5, RED)
  },
  buildings: (x) => { // cottage
    for (let k = 0; k < 5; k++) rect(x, 5 - k, 1 + k, 2 + 2 * k, 1, k % 2 ? RED : shade(RED, -0.15))
    box(x, 2, 6, 8, 5, '#efe0bf'); rect(x, 5, 8, 2, 3, PAL.wood[0]); rect(x, 3, 7, 1, 1, '#5d8fc4'); rect(x, 8, 7, 1, 1, '#5d8fc4')
  },
  build: (x) => { // hammer
    for (let k = 0; k < 6; k++) rect(x, 2 + k, 9 - k, 2, 2, PAL.wood[1])
    box(x, 5, 1, 6, 3, METAL); rect(x, 5, 1, 6, 1, '#d6d9de'); rect(x, 7, 4, 2, 1, METAL)
  },
  storage: (x) => { // crate
    box(x, 1, 2, 10, 9, PAL.wood[1]); rect(x, 1, 2, 10, 2, shade(PAL.wood[1], 0.25))
    for (let k = 0; k < 7; k++) { px(x, 2 + k, 4 + k * 0.85 | 0, PAL.wood[2]); px(x, 9 - k, 4 + k * 0.85 | 0, PAL.wood[2]) }
  },
  guild: (x) => { // shield with crossed swords
    box(x, 2, 1, 8, 7, BLUE); for (let k = 0; k < 3; k++) rect(x, 3 + k, 8 + k, 6 - 2 * k, 1, BLUE)
    rect(x, 2, 1, 8, 1, GOLD)
    for (let k = 0; k < 6; k++) { px(x, 3 + k, 3 + k, GOLD); px(x, 8 - k, 3 + k, GOLD) }
  },
  chronicle: (x) => { // scroll
    box(x, 2, 2, 8, 8, PARCH); rect(x, 1, 1, 10, 2, '#d6c08a'); rect(x, 1, 9, 10, 2, '#d6c08a')
    for (const y of [4, 6]) rect(x, 3, y, 6, 1, PAL.wood[2]); rect(x, 3, 8, 4, 1, PAL.wood[2])
  },
  community: (x) => { // speech bubble with a heart
    box(x, 1, 1, 10, 7, PARCH); rect(x, 3, 8, 2, 1, PARCH); px(x, 3, 9, PARCH)
    rect(x, 3, 3, 2, 2, RED); rect(x, 7, 3, 2, 2, RED); rect(x, 4, 4, 4, 2, RED); rect(x, 5, 6, 2, 1, RED)
  },
  settings: (x) => { // gear
    disc(x, 6, 6, 4, METAL)
    for (const [dx, dy] of [[0, -5], [0, 5], [-5, 0], [5, 0], [-4, -4], [4, -4], [-4, 4], [4, 4]]) rect(x, 5 + Math.sign(dx) * 4, 5 + Math.sign(dy) * 4, 2, 2, METAL)
    disc(x, 6, 6, 1, '#3a3d44'); px(x, 4, 4, '#d6d9de')
  },
  explore: (x) => { // boot
    box(x, 3, 1, 4, 7, PAL.wood[1]); box(x, 3, 7, 8, 3, PAL.wood[1]); rect(x, 3, 10, 8, 1, PAL.wood[2]); rect(x, 3, 2, 4, 1, shade(PAL.wood[1], 0.3))
  },
  map: (x) => { // folded map with a path and an X
    box(x, 1, 2, 10, 8, PARCH); rect(x, 4, 2, 1, 8, '#d6c08a'); rect(x, 7, 2, 1, 8, '#d6c08a')
    for (const [i, j] of [[2, 8], [3, 7], [4, 6], [5, 6], [6, 5], [7, 4]]) px(x, i, j, PAL.wood[2])
    px(x, 8, 3, RED); px(x, 9, 4, RED); px(x, 9, 3, RED); px(x, 8, 4, RED)
  },
  quests: (x) => { // quest scroll with golden wax seal & sword mark
    box(x, 2, 1, 8, 9, PARCH); rect(x, 1, 1, 10, 2, GOLD); rect(x, 1, 9, 10, 2, GOLD)
    rect(x, 3, 4, 6, 1, PAL.wood[2]); rect(x, 3, 6, 4, 1, PAL.wood[2])
    box(x, 7, 6, 3, 3, RED)
  },
  inventory: (x) => { // adventurer backpack with golden clasp
    box(x, 2, 3, 8, 8, PAL.wood[1]); rect(x, 3, 1, 6, 2, PAL.wood[2])
    rect(x, 2, 4, 8, 2, shade(PAL.wood[1], 0.25))
    rect(x, 5, 5, 2, 3, GOLD)
  },
}

const urls = new Map<IconName, string>()
export function iconUrl(name: IconName) {
  let u = urls.get(name)
  if (!u) {
    const [cv, x] = canvas(12, 12)
    PAINT[name](x)
    outline(x, 0, 0, 12, 12, K)
    u = cv.toDataURL()
    urls.set(name, u)
  }
  return u
}

export const PixelIcon = ({ name }: { name: IconName }) => (
  <img className="pixel-icon" src={iconUrl(name)} width={24} height={24} alt="" aria-hidden draggable={false} />
)
