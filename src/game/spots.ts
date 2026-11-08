// Where residents stand once they reach a building: workers at their station (farmers out in the field,
// market staff behind the counters), shoppers in front of the counters, other visitors spread out
// in front of the door. Building-local coordinates (front of a building = local +z). Pure logic.
import { BUILDINGS, SOLIDS, WORLD_HALF, type BuildingDef } from './map.ts'
import { collides } from './collision.ts'
import { hash } from './dialogue.ts'
import { RESIDENTS, type Resident } from './residents.mock.ts'

/** [x, z, y] in world space. */
export type Pt = [number, number, number]

/** Model width/depth in building space (the footprint is stored in world axes). */
export const localSize = (b: BuildingDef) => (Math.abs(Math.sin(b.rot)) > 0.5 ? { W: b.d, D: b.w } : { W: b.w, D: b.d })

/** Building-local point → world (same rotation the model group uses). */
export function toWorld(b: BuildingDef, lx: number, lz: number, y = 0): Pt {
  const c = Math.cos(b.rot), s = Math.sin(b.rot)
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c, y]
}

const unit = (n: number) => (n % 1000) / 1000 - 0.5 // -0.5..0.5

/** Pre-computed well-spaced gathering spots on the open Town Square cobbles (clear of road bottlenecks & fountain). */
const PLAZA_SPOTS: [number, number][] = [
  [-3.2, -3.2], [3.2, -3.2], [3.2, 3.2], [-3.2, 3.2],
  [-5.8, -2.6], [5.8, -2.6], [5.8, 2.6], [-5.8, 2.6],
  [-2.6, -5.8], [2.6, -5.8], [2.6, 5.8], [-2.6, 5.8],
  [-6.4, -5.2], [6.4, -5.2], [6.4, 5.2], [-6.4, 5.2],
]

/** Waypoints from the door to where this resident stands (last = the spot), or null to stay at the door. */
export function standPoints(res: Resident, at: string | null, activity: string, t: number): Pt[] | null {
  if (!at) return null
  const idx = Math.max(0, RESIDENTS.findIndex((r) => r.id === res.id))
  const h = hash(res.id)

  // Town Square nodes (sN, sNE, sE, sSE, sS, sSW, sW, sNW): spread out across the open plaza cobbles,
  // never bunching up on the narrow road exits (like sW -> wJ by the Bakery).
  if (at.startsWith('s') && at !== 'smith') {
    const slot = (idx + Math.floor(t / 120)) % PLAZA_SPOTS.length
    const [px, pz] = PLAZA_SPOTS[slot]
    return [[px, pz, 0]]
  }

  const b = BUILDINGS.find((x) => x.door === at)
  if (!b) return null
  const { W, D } = localSize(b)
  const working = activity === 'work' && res.work === b.id
  const L = (lx: number, lz: number, y = 0) => toWorld(b, lx, lz, y)
  switch (b.kind) {
    case 'market': {
      // staff take a stall each (in hiring order); shoppers pick one at random
      const staff = RESIDENTS.filter((r) => r.work === b.id).findIndex((r) => r.id === res.id)
      const stall = working && staff >= 0 ? staff % 3 : idx % 3
      const x = (stall - 1) * (W / 3) + (working ? 0 : ((idx % 3) - 1) * 0.75)
      // staff walk round the open side of the hall to get behind the counters
      if (working) return [L(W / 2 + 0.9, D / 2 - 0.5), L(W / 2 + 0.9, -0.7), L(x, -0.7)]
      return activity === 'shop' ? [L(x, 1.85 + (idx % 2) * 0.65)] : null
    }
    case 'farm': {
      if (!working) return null
      const pw = W - 7.5, pd = D - 3.5, px = -W / 2 + 1 + pw / 2, k = hash(res.id, Math.floor(t / 90)) // a new patch every 1½ hours
      return [L(0, D / 2 + 0.3), L(0, D / 2 - 1), L(px + unit(k) * (pw - 1.2), 0.6 + unit(k >>> 10) * (pd - 1.2))]
    }
    case 'dock': return working ? [L(0, D / 2 - 0.4, 0.34), L(W / 2 - 0.6, -D / 2 + 1, 0.34)] : null
    case 'lumber': return working ? [L(W * 0.25 - 0.75, D * 0.32 + 0.2)] : null
    case 'quarry': return working ? [L(-W / 2 + 2.4, D / 2 - 0.3)] : null
    case 'mine': return working ? [L(1.3, D / 2 - 0.5)] : null
    case 'construction': return working ? [L(-W / 2 + 2 + unit(h) * 1.5, D / 2 - 0.2)] : null
    case 'workshop': return working ? [L(-(W - 2.2) / 2 - 0.3, 1.8)] : null
    case 'alchemist': return working ? [L((W - 0.8) / 2 + 0.5, (D - 1) / 2 + 0.2)] : null
    default: {
      if (working) return null
      // Visitors fan out over well-spaced spots in front of the door, indexed by resident index so no two share a slot
      for (let k = 0; k < 12; k++) {
        const slot = (idx * 5 + k) % 12
        const col = (slot % 4) - 1.5
        const row = Math.floor(slot / 4)
        const p = L(col * 1.65, D / 2 + 1.5 + row * 1.55)
        if (!collides(p[0], p[1], 0.55, SOLIDS, WORLD_HALF)) return [p]
      }
      return null
    }
  }
}
