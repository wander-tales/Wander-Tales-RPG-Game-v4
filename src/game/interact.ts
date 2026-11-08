// "Talk / use" for the Guild Master: what is close enough, and what pressing E does. Shared by every renderer.
import { BUILDINGS, buildingBox } from './map'
import { BIOME_NPCS, MOUNTAIN_MONSTERS, attackMonster, biomeNpcLive, monsterLive, talkWithBiomeNpc } from './biomes'
import { circleHitsBox } from './collision'
import { npcLive, player } from './live'
import { dayOf, useGame, type Selection } from './store'
import { talkWithGM } from './sim'
import { enterInterior, isSpot, roomKindOf, spotNearPlayer, useSpot } from './interior'

export function findNearby(): Selection {
  if (useGame.getState().interior) { const id = spotNearPlayer(); return id ? { type: 'building', id } : null }
  const { x, z } = player.pos
  let best: Selection = null, bestD = 3.2
  for (const mon of MOUNTAIN_MONSTERS) {
    const st = monsterLive[mon.id]
    if (!st || st.deadUntil > performance.now()) continue
    const d = Math.hypot(st.x - x, st.z - z)
    if (d < bestD + 1.0) { best = { type: 'monster', id: mon.id }; bestD = d }
  }
  if (best) return best
  bestD = 2.6
  for (const [id, n] of Object.entries(npcLive)) {
    const d = Math.hypot(n.x - x, n.z - z)
    if (n.visible && d < bestD) { best = { type: 'resident', id }; bestD = d }
  }
  for (const npc of BIOME_NPCS) {
    const st = biomeNpcLive[npc.id]
    if (!st) continue
    const d = Math.hypot(st.x - x, st.z - z)
    if (d < bestD) { best = { type: 'biomeNpc', id: npc.id }; bestD = d }
  }
  if (best) return best
  const hit = BUILDINGS.find((b) => circleHitsBox(x, z, 2.5, buildingBox(b)))
  return hit ? { type: 'building', id: hit.id } : null
}

export function interact() {
  const s = useGame.getState()
  if (!s.nearby) return
  if (isSpot(s.nearby.id)) return useSpot(s.nearby.id)
  if (s.nearby.type === 'monster') {
    attackMonster(s.nearby.id)
    return
  }
  if (s.nearby.type === 'resident') {
    talkWithGM(s.nearby.id, dayOf(s.time))
    s.gainXp(15)
    s.recordQuestProgress('talk_npc', 1)
    s.select(s.nearby)
    return
  }
  if (s.nearby.type === 'biomeNpc') {
    talkWithBiomeNpc(s.nearby.id)
    return
  }
  if (roomKindOf(s.nearby.id)) return enterInterior(s.nearby.id) // the door leads inside
  s.select(s.nearby)
}
