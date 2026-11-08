// Character sprite sheets: metadata + a layered pixel painter.
// Each look gets one atlas: rows = state × direction, columns = frames. All layers (body, face, hair, clothing, armor,
// weapon, accessories) are painted into the SAME frame with the SAME pose, so they can never drift apart.
import { PAL, box, canvas, outline, px, rect, shade, type Ctx } from './paint.ts'

export type Dir = 'down' | 'left' | 'right' | 'up'
export type State = 'idle' | 'walk' | 'run' | 'interact' | 'attack' | 'hit' | 'death'

/** Sheet metadata. Renderers and the state machine read frame size / counts / speed from here — never hardcoded. */
export const SHEET = {
  frameW: 32, frameH: 38,
  pivot: { x: 16, y: 37 }, // feet, in frame pixels (6px headroom at top so tall hats/helmets never clip)
  dirs: ['down', 'left', 'right', 'up'] as Dir[],
  states: {
    idle: { frames: 2, fps: 2, loop: true },
    walk: { frames: 4, fps: 8, loop: true },
    run: { frames: 4, fps: 13, loop: true },
    interact: { frames: 2, fps: 4, loop: true },
    attack: { frames: 3, fps: 11, loop: false },
    hit: { frames: 2, fps: 9, loop: false },
    death: { frames: 4, fps: 6, loop: false },
  } satisfies Record<State, { frames: number; fps: number; loop: boolean }>,
  /** Draw order front-facing (down/left/right). Facing up, 'back' layers (cape, pack) are drawn last instead. */
  layers: ['back', 'legs', 'feet', 'torso', 'armor', 'apron', 'waist', 'neck', 'arms', 'head', 'face', 'hair', 'headwear', 'accessory', 'weapon'] as const,
}
export const STATE_ORDER = Object.keys(SHEET.states) as State[]
export const MAX_FRAMES = Math.max(...STATE_ORDER.map((s) => SHEET.states[s].frames))
export const frameRect = (state: State, dir: Dir, frame: number) => ({
  x: frame * SHEET.frameW, y: (STATE_ORDER.indexOf(state) * 4 + SHEET.dirs.indexOf(dir)) * SHEET.frameH, w: SHEET.frameW, h: SHEET.frameH,
})

export type HairStyle = 'short' | 'long' | 'ponytail' | 'twin' | 'braid' | 'messy' | 'curly' | 'spiky' | 'bald'
export type Hat = 'cap' | 'straw' | 'wizard' | 'hood' | 'helmet' | 'crown' | 'circlet' | 'feather' | 'baker'
export type Weapon = 'sword' | 'staff' | 'bow' | 'dagger' | 'hammer'
export type Extra = 'glasses' | 'horns' | 'headband' | 'scarf' | 'flower' | 'medallion' | 'earrings' | 'pouch' | 'charm'

/** Everything the painter needs. Built from the creator appearance or the simple register look (see look.ts). */
export interface SpriteLook {
  skin: string
  eyes?: string
  hair: string; hairStyle: HairStyle
  shirt: string; trim?: string; long?: boolean // robe/dress: covers the legs
  pants: string; shoes: string
  hat?: { kind: Hat; c: string; c2?: string }
  armor?: string; shoulders?: string; apron?: string; belt?: string; gloves?: string
  cape?: string; pack?: string
  extras?: { kind: Extra; c: string }[]
  weapon?: Weapon
}

// ---------- pose per frame ----------
interface Pose { b: number; lL: number; lR: number; step: number; aL: number; aR: number; reach: number; wpn: 'rest' | 'up' | 'swing' | 'down'; dx: number; flash: boolean; fall: number }
const P = (o: Partial<Pose>): Pose => ({ b: 0, lL: 0, lR: 0, step: 0, aL: 0, aR: 0, reach: 0, wpn: 'rest', dx: 0, flash: false, fall: 0, ...o })
function pose(state: State, f: number): Pose {
  switch (state) {
    case 'idle': return P({ b: f })
    case 'walk': return [P({ lL: 1, step: 1, aL: 1, aR: -1 }), P({ b: 1 }), P({ lR: 1, step: -1, aL: -1, aR: 1 }), P({ b: 1 })][f]
    case 'run': return [P({ lL: 2, step: 2, aL: 2, aR: -2, dx: 1 }), P({ b: 1, dx: 1 }), P({ lR: 2, step: -2, aL: -2, aR: 2, dx: 1 }), P({ b: 1, dx: 1 })][f]
    case 'interact': return P({ reach: f + 1 })
    case 'attack': return [P({ wpn: 'up', reach: 1 }), P({ wpn: 'swing', reach: 2, dx: 1 }), P({ wpn: 'down', reach: 1 })][f]
    case 'hit': return [P({ flash: true, dx: -1 }), P({ dx: -1 })][f]
    case 'death': return [P({ flash: true }), P({ fall: 4 }), P({ fall: 7 }), P({ fall: 99 })][f]
  }
}

// ---------- painter ----------
const DARK = '#141018'
function paintFrame(x: Ctx, L: SpriteLook, dir: Dir, p: Pose) {
  const side = dir === 'left' // 'right' is painted as left and mirrored
  const up = dir === 'up'
  const b = p.b + Math.min(p.fall, 8) // upper body drops while bobbing / falling
  const legs = p.fall < 3
  const sk = L.skin

  // back layers (seen behind the body unless facing up)
  const back = () => {
    if (L.cape) {
      if (up) { box(x, 10, 15 + b, 12, 13, L.cape); rect(x, 10, 15 + b, 12, 1, shade(L.cape, 0.3)) }
      else if (side) box(x, 18, 16 + b, 4, 11, shade(L.cape, -0.1))
      else { rect(x, 9, 17 + b, 2, 9, shade(L.cape, -0.15)); rect(x, 21, 17 + b, 2, 9, shade(L.cape, -0.15)) }
    }
    if (L.pack) {
      if (up) box(x, 11, 16 + b, 10, 8, L.pack)
      else if (side) box(x, 19, 16 + b, 4, 7, L.pack)
    }
  }
  if (!up) back()

  // legs + shoes
  if (legs) {
    if (side) {
      const s = p.step
      box(x, 13 + s, 24, 4, 5, shade(L.pants, -0.12)); box(x, 12 + s, 28, 5, 3, shade(L.shoes, -0.12)) // far leg
      box(x, 15 - s, 24, 4, 5, L.pants); box(x, 14 - s, 28, 5, 3, L.shoes) // near leg
    } else {
      box(x, 12, 24, 4, 5 - p.lL, L.pants); box(x, 12, 28 - p.lL, 4, 3, L.shoes)
      box(x, 16, 24, 4, 5 - p.lR, L.pants); box(x, 16, 28 - p.lR, 4, 3, L.shoes)
    }
  }

  // torso (+ long garment over the legs)
  const tx = side ? 12 : 11, tw = side ? 8 : 10
  box(x, tx, 16 + b, tw, 8, L.shirt)
  if (L.trim && !L.armor) {
    if (!up) rect(x, side ? tx + 2 : 15, 16 + b, 2, 7, L.trim)
    rect(x, tx, 23 + b, tw, 1, L.trim)
  }
  if (L.long && legs) box(x, tx - 1, 23 + b, tw + 2, 5 - Math.min(b, 1), shade(L.shirt, -0.06))
  if (L.armor) { box(x, tx, 16 + b, tw, 6, L.armor); rect(x, tx + 1, 17 + b, tw - 2, 1, shade(L.armor, 0.4)) }
  if (L.apron && !up) box(x, side ? 11 : 12, 19 + b, side ? 3 : 8, 7, L.apron)
  if (L.belt) { rect(x, tx, 22 + b, tw, 1, L.belt); if (!up && !side) px(x, 15, 22 + b, '#e7c35b') }

  // arms (skin hands, sleeves in shirt colour)
  const arm = (ax: number, swing: number, near: boolean) => {
    const raise = near ? p.reach : 0
    const y0 = 16 + b, len = 6 - Math.max(0, swing) - raise
    box(x, ax, y0, 3, len, near ? L.shirt : shade(L.shirt, -0.15))
    if (L.shoulders) box(x, ax - (side ? 0 : ax < 16 ? 1 : 0), y0 - 1, 4, 3, L.shoulders)
    rect(x, ax, y0 + len, 3, 2, L.gloves ?? sk)
  }
  if (side) { arm(14 + p.step, p.aL, false); arm(15 - p.step - (p.reach ? p.reach + 1 : 0), p.aR, true) }
  else { arm(8, up ? p.aR : p.aL, !up); arm(21, up ? p.aL : p.aR, true) }

  // neck & waist_side items
  for (const e of L.extras ?? []) {
    if (e.kind === 'scarf') { rect(x, tx, 16 + b, tw, 2, e.c); if (!up) rect(x, side ? 18 : 18, 18 + b, 2, 3, shade(e.c, -0.15)) }
    if (e.kind === 'medallion' && !up && !side) { px(x, 15, 18 + b, e.c); px(x, 16, 18 + b, e.c); px(x, 15, 19 + b, shade(e.c, -0.3)); px(x, 16, 19 + b, shade(e.c, -0.3)) }
    if (e.kind === 'pouch' && !up) box(x, side ? 14 : 19, 22 + b, 3, 3, e.c)
    if (e.kind === 'charm' && !up) { px(x, side ? 15 : 11, 22 + b, '#d6d9de'); rect(x, side ? 15 : 11, 23 + b, 2, 2, e.c) }
  }

  // head: a big block, 14×13 front / 12×13 profile
  const hx = side ? 10 : 9, hw = side ? 12 : 14, hy = 3 + b
  box(x, hx, hy, hw, 13, sk)
  // face
  if (!up) {
    const eyeCol = L.eyes ?? DARK
    const eye = (ex: number) => { rect(x, ex, hy + 6, 2, 3, eyeCol); px(x, ex, hy + 6, shade(eyeCol, -0.35)) }
    if (side) { eye(11); px(x, 10, hy + 10, shade(sk, -0.2)); rect(x, 13, hy + 10, 2, 1, '#f3a3a0') }
    else { eye(12); eye(18); rect(x, 10, hy + 10, 2, 1, '#f3a3a0'); rect(x, 20, hy + 10, 2, 1, '#f3a3a0'); rect(x, 15, hy + 10, 2, 1, shade(sk, -0.35)) }
  }
  hair(x, L, dir, hx, hw, hy)
  headwear(x, L, dir, hx, hw, hy)
  for (const e of L.extras ?? []) {
    if (e.kind === 'glasses' && !up) { const g = (gx: number) => { rect(x, gx - 1, hy + 5, 4, 1, e.c); rect(x, gx - 1, hy + 9, 4, 1, e.c); rect(x, gx - 1, hy + 5, 1, 5, e.c); rect(x, gx + 2, hy + 5, 1, 5, e.c) }; if (side) g(11); else { g(12); g(18); rect(x, 15, hy + 6, 2, 1, e.c) } }
    if (e.kind === 'horns') { const h = (hx2: number) => { rect(x, hx2, hy - 3, 2, 3, e.c); px(x, hx2 + (hx2 < 16 ? 0 : 1), hy - 4, shade(e.c, 0.3)) }; if (side) h(15); else { h(10); h(20) } }
    if (e.kind === 'headband') rect(x, hx, hy + 3, hw, 2, e.c)
    if (e.kind === 'flower' && !up) { px(x, side ? 19 : 21, hy + 2, e.c); px(x, side ? 20 : 22, hy + 3, e.c); px(x, side ? 18 : 20, hy + 3, e.c); px(x, side ? 19 : 21, hy + 3, '#f4d35e') }
    if (e.kind === 'earrings' && !up) { if (side) px(x, 16, hy + 11, e.c); else { px(x, 8, hy + 10, e.c); px(x, 23, hy + 10, e.c) } }
  }

  if (up) back()
  weapon(x, L, dir, p, b)
}

function hair(x: Ctx, L: SpriteLook, dir: Dir, hx: number, hw: number, hy: number) {
  if (L.hairStyle === 'bald') return
  const c = L.hair, lo = shade(c, -0.22), hi = shade(c, 0.25)
  const side = dir === 'left', up = dir === 'up'
  const covered = L.hat && ['hood', 'helmet'].includes(L.hat.kind)
  if (covered && !up) return
  // cap over the top
  box(x, hx - 1, hy - 1, hw + 2, 5, c); rect(x, hx, hy - 1, hw, 1, hi)
  if (up) { box(x, hx - 1, hy - 1, hw + 2, 12, c); rect(x, hx, hy + 10, hw, 1, lo) }
  else if (side) { box(x, hx + 6, hy + 2, 7, 8, c); rect(x, hx, hy + 4, 3, 1, c) } // back of the head + fringe
  else { rect(x, hx - 1, hy + 4, 2, 6, c); rect(x, hx + hw - 1, hy + 4, 2, 6, c); for (let i = 0; i < hw; i += 3) rect(x, hx + i, hy + 4, 2, 1, lo) } // side locks + fringe
  const s = L.hairStyle
  if (s === 'long') { if (up) box(x, hx, hy + 10, hw, 8, c); else if (side) box(x, hx + 8, hy + 9, 5, 9, c); else { rect(x, hx - 1, hy + 9, 2, 8, c); rect(x, hx + hw - 1, hy + 9, 2, 8, c) } }
  if (s === 'ponytail') { if (up) box(x, 15, hy + 10, 3, 9, c); else if (side) box(x, hx + 12, hy + 4, 3, 9, c) }
  if (s === 'braid') { const bx = up ? 15 : side ? hx + 11 : -1; if (bx > 0) for (let i = 0; i < 4; i++) box(x, bx, hy + 10 + i * 2, 3, 2, i % 2 ? lo : c) }
  if (s === 'twin') { box(x, hx - 3, hy + 2, 3, 6, c); if (!side) box(x, hx + hw, hy + 2, 3, 6, c) }
  if (s === 'spiky') for (const sx of side ? [hx + 2, hx + 6, hx + 10] : [hx + 1, hx + 5, hx + 9, hx + 12]) { rect(x, sx, hy - 3, 2, 2, c); px(x, sx, hy - 4, hi) }
  if (s === 'curly') for (let i = 0; i < hw + 2; i += 2) px(x, hx - 1 + i, hy - 2, c)
  if (s === 'messy') { rect(x, hx + 2, hy - 2, 2, 1, c); rect(x, hx + hw - 4, hy - 2, 2, 1, c); if (!up && !side) rect(x, hx + 4, hy + 5, 2, 1, c) }
}

function headwear(x: Ctx, L: SpriteLook, dir: Dir, hx: number, hw: number, hy: number) {
  const h = L.hat
  if (!h) return
  const c = h.c, c2 = h.c2 ?? shade(c, -0.3), side = dir === 'left', up = dir === 'up'
  const cx = hx + hw / 2
  switch (h.kind) {
    case 'cap': box(x, hx - 1, hy - 2, hw + 2, 5, c); if (!up) rect(x, side ? hx - 3 : hx, hy + 2, side ? 5 : hw, 1, c2); break
    case 'straw': box(x, hx - 4, hy + 1, hw + 8, 2, c); box(x, hx + 1, hy - 3, hw - 2, 5, c); rect(x, hx + 1, hy, hw - 2, 1, c2); break
    case 'wizard': box(x, hx - 3, hy + 1, hw + 6, 2, c); box(x, hx + 2, hy - 2, hw - 4, 4, c); box(x, cx - 3, hy - 4, 6, 3, c); rect(x, cx - 1, hy - 5, 3, 2, c); rect(x, hx + 2, hy, hw - 4, 1, c2); break
    case 'hood': box(x, hx - 1, hy - 2, hw + 2, up ? 15 : 7, c); if (!up) { rect(x, hx - 1, hy + 4, 3, 9, c); if (!side) rect(x, hx + hw - 2, hy + 4, 3, 9, c); else box(x, hx + 7, hy + 4, 6, 9, c) } break
    case 'helmet': box(x, hx - 1, hy - 2, hw + 2, up ? 12 : 6, c); rect(x, hx - 1, hy + 3, hw + 2, 1, c2); if (!up) { rect(x, hx - 1, hy + 4, 2, 6, c); if (!side) rect(x, hx + hw - 1, hy + 4, 2, 6, c); else box(x, hx + 8, hy + 4, 5, 7, c) } break
    case 'crown': box(x, hx + 2, hy - 1, hw - 4, 3, c); for (let i = hx + 2; i < hx + hw - 2; i += 3) px(x, i, hy - 2, c); if (!up && !side) px(x, cx, hy, c2); break
    case 'circlet': rect(x, hx - 1, hy + 2, hw + 2, 1, c); if (!up) px(x, side ? hx + 1 : cx, hy + 2, c2); break
    case 'feather': box(x, hx - 3, hy + 1, hw + 6, 2, c); box(x, hx + 1, hy - 3, hw - 2, 5, c); rect(x, hx + hw - 3, hy - 6, 2, 5, c2); px(x, hx + hw - 2, hy - 7, shade(c2, 0.3)); break
    case 'baker': box(x, hx + 1, hy - 5, hw - 2, 7, c); rect(x, hx + 1, hy + 1, hw - 2, 1, c2); break
  }
}

function weapon(x: Ctx, L: SpriteLook, dir: Dir, p: Pose, b: number) {
  const w = L.weapon
  if (!w || p.fall > 6) return
  const side = dir === 'left', up = dir === 'up'
  // hand position (near hand)
  const hx = side ? 14 - p.step - (p.reach ? p.reach + 1 : 0) : 22, hy = 22 + b - p.reach
  const blade = w === 'staff' ? '#7a5434' : w === 'hammer' ? '#7a5434' : w === 'bow' ? '#8a5a33' : '#d6d9de'
  const len = w === 'staff' ? 14 : w === 'dagger' ? 4 : w === 'bow' ? 11 : 8
  if (up && p.wpn === 'rest') { rect(x, 9, 11 + b, 1, len, shade(blade, -0.2)); return } // on the back
  if (p.wpn === 'swing') { // swung forward, horizontal
    const dx = side ? -1 : 1, sx = side ? hx - len : hx + 2
    rect(x, sx, hy, len, 1, blade); rect(x, side ? hx - 1 : hx + 1, hy - 1, 1, 3, '#e7c35b')
    if (w === 'hammer') box(x, side ? sx - 2 : sx + len - 1, hy - 2, 3, 4, '#9aa0a8')
    void dx; return
  }
  const top = p.wpn === 'up' ? hy - len - 6 : p.wpn === 'down' ? hy - 2 : hy - len + 1
  rect(x, hx + 1, top, 1, len, blade); if (w !== 'staff' && w !== 'bow' && w !== 'hammer') rect(x, hx + 1, top, 1, 1, '#ffffff')
  if (w === 'sword' || w === 'dagger') rect(x, hx, top + len - 1, 3, 1, '#e7c35b')
  if (w === 'staff') { px(x, hx + 1, top - 1, '#5fb3d6'); px(x, hx, top, '#5fb3d6'); px(x, hx + 2, top, '#5fb3d6') }
  if (w === 'hammer') box(x, hx - 1, top - 1, 4, 3, '#9aa0a8')
  if (w === 'bow') { rect(x, hx + 2, top, 1, len, '#eeeeee'); px(x, hx + 1, top - 1, blade); px(x, hx + 1, top + len, blade) }
}

// ---------- atlas ----------
const HEADROOM = 6
const cache = new Map<string, HTMLCanvasElement>()
/** One atlas per distinct look, painted once and shared by everyone who looks the same. */
export function buildSheet(L: SpriteLook): HTMLCanvasElement {
  const key = JSON.stringify(L)
  const hit = cache.get(key)
  if (hit) return hit
  const W = SHEET.frameW, H = SHEET.frameH
  const [atlas, a] = canvas(W * MAX_FRAMES, H * STATE_ORDER.length * 4)
  const [tmp, t] = canvas(W, H)
  for (const state of STATE_ORDER) for (const dir of SHEET.dirs) for (let f = 0; f < SHEET.states[state].frames; f++) {
    const p = pose(state, f)
    t.clearRect(0, 0, W, H)
    t.save()
    t.translate(0, HEADROOM)
    paintFrame(t, L, dir === 'right' ? 'left' : dir, p)
    t.restore()
    outline(t, 0, 0, W, H)
    if (p.flash) { t.globalCompositeOperation = 'source-atop'; t.fillStyle = 'rgba(255,255,255,0.7)'; t.fillRect(0, 0, W, H); t.globalCompositeOperation = 'source-over' }
    const r = frameRect(state, dir, f)
    a.save()
    if (p.fall > 50) { // lying down: the standing frame turned 90° (pixel-exact), resting on the ground
      paintLying(a, L, r.x, r.y, dir)
    } else if (dir === 'right') { a.translate(r.x + W, r.y); a.scale(-1, 1); a.drawImage(tmp, -p.dx, 0) }
    else a.drawImage(tmp, r.x + (dir === 'left' ? -p.dx : p.dx), r.y)
    a.restore()
  }
  cache.set(key, atlas)
  return atlas
}

function paintLying(a: Ctx, L: SpriteLook, X: number, Y: number, dir: Dir) {
  const [tmp, t] = canvas(32, 32)
  paintFrame(t, { ...L, weapon: undefined }, 'down', P({}))
  outline(t, 0, 0, 32, 32)
  // frame point (u, v) → cell (X + 32 − v, Y + 13 + u): head toward one side, body resting on the cell's bottom
  if (dir === 'right') { a.translate(X, Y + 7 + HEADROOM); a.scale(-1, 1) } else a.translate(X + 32, Y + 7 + HEADROOM)
  a.rotate(Math.PI / 2)
  a.drawImage(tmp, 0, 0)
}

void PAL
