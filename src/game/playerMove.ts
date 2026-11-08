// Moves the Guild Master by (dx, dz) metres with collision, in town or inside a room. Shared by every renderer.
import { WORLD_HALF } from './map'
import { blockers } from './town'
import { circleHitsBox, slide } from './collision'
import { player } from './live'
import { useGame } from './store'
import { height, onBridge, walkable } from './terrain'
import { ROOM, ROOMS, leaveInterior, roomKindOf } from './interior'

export function movePlayer(dx: number, dz: number) {
  const s = useGame.getState()
  if (s.playerDeadUntil && Date.now() < s.playerDeadUntil) return
  const p = player.pos, interior = s.interior
  if (interior) { // room coordinates are local to its centre
    const [x, z] = slide(p.x - ROOM.cx, p.z - ROOM.cz, dx, dz, 0.4, ROOMS[roomKindOf(interior)!].boxes, 1e4)
    p.x = x + ROOM.cx; p.z = z + ROOM.cz; p.y = 0
    if (z > ROOM.hz - 0.1) leaveInterior() // walked out through the door
  } else {
    const boxes = blockers(), r = 0.45
    // Safety unstuck: if player ever ends up overlapping a building/fountain collider, push out to nearest edge
    for (const b of boxes) {
      if (circleHitsBox(p.x, p.z, r, b)) {
        const dLeft = Math.abs(p.x - (b.minX - r - 0.08))
        const dRight = Math.abs((b.maxX + r + 0.08) - p.x)
        const dTop = Math.abs(p.z - (b.minZ - r - 0.08))
        const dBot = Math.abs((b.maxZ + r + 0.08) - p.z)
        const min = Math.min(dLeft, dRight, dTop, dBot)
        if (min === dBot) p.z = b.maxZ + r + 0.08
        else if (min === dTop) p.z = b.minZ - r - 0.08
        else if (min === dRight) p.x = b.maxX + r + 0.08
        else p.x = b.minX - r - 0.08
      }
    }
    const prevX = p.x, prevZ = p.z
    const [x, z] = slide(p.x, p.z, dx, dz, r, boxes, WORLD_HALF)
    if (walkable(x, p.z)) p.x = x // rivers, lakes (except bridges), sea, and volcano crater stop you axis by axis
    if (walkable(p.x, z)) p.z = z
    p.y = onBridge(p.x, p.z) ? 0.28 : Math.max(0, height(p.x, p.z))
    const stepDist = Math.hypot(p.x - prevX, p.z - prevZ)
    if (stepDist > 0) {
      walkAccum += stepDist
      if (walkAccum >= 5) {
        const chunks = Math.floor(walkAccum)
        walkAccum -= chunks
        s.recordQuestProgress('explore_distance', chunks)
      }
    }
  }
}

let walkAccum = 0


