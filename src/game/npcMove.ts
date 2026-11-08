// Resident movement. Positions live in `sim` (game/sim.ts); renderers only read them.
import { NEIGHBORS, NODES, SOLIDS, WORLD_HALF, findPath, nearestNode } from './map.ts'
import { collides } from './collision.ts'
import { rng } from './scenery.ts'
import { lerpAngle, npcLive, player } from './live.ts'
import { useGame } from './store.ts'
import { standPoints, type Pt } from './spots.ts'
import { PROFESSIONS } from './professions.ts'
import { activityLabel, carrying, residents, sim } from './sim.ts'
import type { Resident } from './residents.mock.ts'

const SPEED: Partial<Record<Resident['personality'], number>> = { Lazy: 1.0, Hardworking: 1.7, Adventurous: 1.8, Shy: 1.2 }
const AVOID = 1.48 // generous side-by-side personal space (m) so sprites never overlap on narrow roads
const Z_ROOM = 1.58 // front-to-back spacing multiplier so characters never stack behind each other

type Mv = {
  path: string[]
  lastTarget: string | null | undefined
  wait: number
  facing: number
  ox: number
  oz: number
  r: () => number
  /** how far to the right of the road centerline this resident walks (m) */
  lane: number
  /** free-walk points (to a stand spot, or back out of one) that come before the road graph */
  queue: Pt[]
  back: Pt[]
  spotKey: string
  y: number
  /** how long we've been near the current waypoint without advancing (prevents traffic deadlocks) */
  stuckT: number
}

export interface NpcFrame { speed: number; mode: 'idle' | 'walk' | 'talk' | 'work'; facing: number; y: number; visible: boolean; carrying: boolean }

const movers = new Map<string, Mv>()
export const seedOf = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
export const forgetNpc = (id: string) => { movers.delete(id); delete npcLive[id] }

/** Advance one resident by dt seconds along the walk graph toward whatever the simulation wants. */
export function stepNpc(res: Resident, rawDt: number): NpcFrame | null {
  const dt = Math.min(rawDt, 0.1) // same cap as the clock
  const s = sim[res.id]
  if (!s) return null // just left town
  let m = movers.get(res.id)
  if (!m) {
    const r = rng(seedOf(res.id) * 97 + 13)
    const idx = Math.max(0, residents.findIndex((x) => x.id === res.id))
    m = {
      path: [], lastTarget: undefined, wait: r() * 3, facing: 0,
      ox: ((idx % 4) - 1.5) * 0.65, oz: (Math.floor(idx / 4) - 1) * 0.75,
      r, queue: [], back: [], spotKey: '', y: 0,
      lane: 0.28 + (idx % 3) * 0.22,
      stuckT: 0,
    }
    movers.set(res.id, m)
  }
  const { timeScale, time, interior } = useGame.getState()
  if (m.lastTarget === undefined) { s.x = NODES[s.node][0] + m.ox; s.z = NODES[s.node][1] + m.oz } // first frame: snap to saved node

  // a building was removed under our feet: rejoin the road network
  if (!(s.node in NODES) || m.path.some((n) => !(n in NODES))) {
    if (!(s.node in NODES)) s.node = nearestNode(s.x, s.z)
    m.path = []
    m.lastTarget = null
    m.queue = []; m.back = []
  }
  // re-plan when the simulation picks a new destination (continue from the node we're heading to);
  // anyone standing at a spot first walks back out the way they came
  if (s.target !== m.lastTarget) {
    m.lastTarget = s.target
    const from = m.path[0] ?? s.node
    m.path = s.target ? (m.path.length ? [from, ...findPath(from, s.target)] : findPath(from, s.target)) : m.path.slice(0, 1)
    m.queue = m.back; m.back = []; m.spotKey = ''; m.stuckT = 0
  }
  if (!s.target && !m.path.length && !m.queue.length && !s.talkingTo && (m.wait -= dt) <= 0) {
    const n = NEIGHBORS[s.node]
    if (n && n.length) m.path = [n[Math.floor(m.r() * n.length)]]
    m.wait = 3 + m.r() * 6
    m.stuckT = 0
  }
  // reached the building: head for this resident's stand spot (workers at their station, shoppers at the counter)
  if (s.target && !m.path.length && s.node === s.target && !m.queue.length) {
    const pts = standPoints(res, s.target, s.activity, time)
    const key = pts ? pts[pts.length - 1].join() : ''
    if (key !== m.spotKey) {
      m.queue = m.spotKey && pts ? [pts[pts.length - 1]] : pts ?? [] // already inside: just move to the new spot
      if (!m.spotKey && pts) m.back = pts.slice(0, -1).reverse()
      m.spotKey = key
      m.stuckT = 0
    }
  }

  let speed = 0
  if ((m.queue.length || m.path.length) && !s.talkingTo) {
    // walking keeps pace with fast-forwarded time so residents still reach places on time
    speed = (SPEED[res.personality] ?? 1.45) * (s.needs.energy < 25 ? 0.7 : 1) * Math.max(1, timeScale / 2)
    const goal = (): [number, number] => {
      const q = m!.queue[0]
      if (q) return [q[0], q[1]]
      const a = NODES[s.node], b = NODES[m!.path[0]], len = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (len < 0.01) return [b[0] + m!.ox, b[1] + m!.oz]
      return [b[0] - ((b[1] - a[1]) / len) * m!.lane, b[1] + ((b[0] - a[0]) / len) * m!.lane]
    }
    // look ahead: someone in front going our way → keep single-file spacing; someone standing → step smoothly around
    let slow = 1, sideX = 0, sideZ = 0
    {
      const [gx, gz] = goal(), gl = Math.hypot(gx - s.x, gz - s.z)
      if (gl > 0.01) {
        const dx = (gx - s.x) / gl, dz = (gz - s.z) / gl
        for (const o of residents) {
          const so = sim[o.id]
          if (o.id === res.id || !so || so.indoors) continue
          const rx = so.x - s.x, rz = so.z - s.z, ahead = rx * dx + rz * dz, lat = -rx * dz + rz * dx
          if (ahead <= 0 || ahead > 2.4 || Math.abs(lat) > 1.05) continue
          const mo = movers.get(o.id)
          if (so.walking && mo && Math.sin(mo.facing) * dx + Math.cos(mo.facing) * dz > 0.5) {
            slow = Math.min(slow, Math.max(0.3, (ahead - 1.35) / 1.05))
          } else {
            const away = lat >= 0 ? -1 : 1, w = 1.1 - Math.abs(lat)
            sideX += -dz * away * w; sideZ += dx * away * w
          }
        }
      }
    }
    let step = speed * dt * slow
    if (sideX || sideZ) {
      const sl = Math.hypot(sideX, sideZ), k = Math.min(sl, 1) * speed * dt * 0.85 / sl
      const nx = s.x + sideX * k, nz = s.z + sideZ * k
      if (!collides(nx, nz, 0.42, SOLIDS, WORLD_HALF)) { s.x = nx; s.z = nz }
    }
    while (step > 0 && (m.queue.length || m.path.length)) {
      const q = m.queue[0]
      const [px, pz] = goal()
      const dd = Math.hypot(px - s.x, pz - s.z)
      if (dd > 0.01) m.facing = lerpAngle(m.facing, Math.atan2(px - s.x, pz - s.z), 1 - Math.exp(-dt * 8))

      // Advance road nodes smoothly before getting blocked by someone standing near the node
      const passRadius = q ? (m.queue.length > 1 ? 0.55 : 0.18) : m.path.length > 1 ? 1.15 : 0.65
      if (dd < 2.2) m.stuckT += dt; else m.stuckT = 0

      if (dd <= step || dd <= passRadius || m.stuckT > 1.1) {
        if (dd <= step) { s.x = px; s.z = pz; step -= dd } else step = 0
        m.stuckT = 0
        if (q) { m.y = q[2]; m.queue.shift() } else { s.node = m.path.shift()!; m.y = 0 }
      } else {
        s.x += ((px - s.x) / dd) * step
        s.z += ((pz - s.z) / dd) * step
        step = 0
      }
    }
  } else if (s.talkingTo) {
    const o = sim[s.talkingTo]
    if (o) m.facing = lerpAngle(m.facing, Math.atan2(o.x - s.x, o.z - s.z), 1 - Math.exp(-dt * 6))
  }

  // Keep out of each other's (and the Guild Master's) way without pushing anyone into building walls/chimneys
  if (!s.indoors) {
    const i = seedOf(res.id)
    let px = 0, pz = 0
    const push = (x: number, z: number, r: number) => {
      let dx = s.x - x, dz = (s.z - z) / Z_ROOM, d = Math.hypot(dx, dz)
      if (d >= r) return
      if (d < 1e-3) { dx = Math.sin(i); dz = Math.cos(i); d = 1 }
      px += (dx / d) * (r - d)
      pz += (dz / d) * (r - d) * Z_ROOM
    }
    for (const o of residents) {
      const so = sim[o.id]
      if (o.id === res.id || !so || so.indoors) continue
      push(so.x, so.z, so.talkingTo === res.id ? AVOID * 0.95 : speed || so.walking ? AVOID * 1.15 : AVOID)
    }
    if (!interior) push(player.pos.x, player.pos.z, 1.15)
    const k = Math.min(1, dt * (speed ? 7 : 5.5)), maxStep = Math.max(2.4, speed * 1.2) * dt, pm = Math.hypot(px, pz) * k
    const f = pm > maxStep ? maxStep / pm : k
    const nx = s.x + px * f, nz = s.z + pz * f
    if (!collides(nx, nz, 0.42, SOLIDS, WORLD_HALF)) {
      s.x = nx; s.z = nz
    } else if (!collides(nx, s.z, 0.42, SOLIDS, WORLD_HALF)) {
      s.x = nx
    } else if (!collides(s.x, nz, 0.42, SOLIDS, WORLD_HALF)) {
      s.z = nz
    }
  }
  s.walking = speed > 0
  s.arrived = !m.path.length && (!s.target || s.node === s.target)

  const recipe = !!PROFESSIONS[res.profession]?.recipe
  const busy = s.activity === 'work' && s.arrived && !m.queue.length && (recipe || s.workStatus.startsWith('Building '))
  npcLive[res.id] = { x: s.x, z: s.z, activity: activityLabel(s), visible: !s.indoors }
  return {
    speed, mode: speed ? 'walk' : s.talkingTo ? 'talk' : busy ? 'work' : 'idle',
    facing: m.facing, y: m.y, visible: !s.indoors && !interior, carrying: carrying(s),
  }
}
