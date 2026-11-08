// Who is inside a room right now and where: staff on shift at their station, tavern patrons on the benches (standing
// once every seat is taken), residents at home, guild members waiting in the hall. Fixed spots per room, not the
// simulation's real position.
import { getBuilding } from './map'
import { residents, sim } from './sim'
import { guild } from './guild'
import type { RoomId } from './interior'
import type { Resident } from './residents.mock'
import type { GuildMember } from '../backend/types'

export type Place = [number, number, number] // local x, z, facing (radians, atan2(dx, dz))
export type RoomMode = 'idle' | 'work' | 'talk' | 'sit' | 'sitTalk'

const onShift = (r: Resident, buildingId: string) => r.work === buildingId && sim[r.id].activity === 'work' && sim[r.id].arrived
const TABLES: [number, number][] = [[-2.4, -1.4], [2.4, -1.4], [-2.4, 2.8], [2.4, 2.8]]
// two per bench, a bench either side of each table, facing the table
export const SEATS: Place[] = TABLES.flatMap(([tx, tz]) => [-1, 1].flatMap((side) => [-0.22, 0.22].map((dz): Place => [tx + side * 0.9, tz + dz, -side * Math.PI / 2])))
const STANDING: Place[] = [[-4.6, -3.3, 0.9], [-4.4, -2.1, 1.3], [0, -4.4, 0], [4.6, -3.4, -0.6], [0, 0.8, Math.PI], [4.4, 1.2, -1.2], [-4.6, 0.9, 1.6], [0, 4.6, Math.PI]]
const STAFF: Partial<Record<RoomId, { spots: Place[]; mode: RoomMode }>> = {
  tavern: { spots: [[-5.4, -5.0, Math.PI / 2], [-5.4, -6.2, Math.PI / 2]], mode: 'idle' },
  bakery: { spots: [[-4, 0.8, Math.PI], [-5.75, -3.9, Math.PI]], mode: 'work' },
  blacksmith: { spots: [[-0.3, -3.6, Math.PI], [4.3, -4.75, Math.PI / 2]], mode: 'work' },
  guild: { spots: [[-4.3, -6.0, Math.PI / 2], [1.3, -6.0, -Math.PI / 2]], mode: 'idle' },
}
const BEDSIDE: Place[] = [[-7.3, -2.2, Math.PI], [-6.5, -2.2, Math.PI], [-5.7, -2.2, Math.PI]]
export const HALL_SPOTS: Place[] = [[2.8, -3.0, -0.6], [-3.6, 1.2, 0.7], [3.2, 2.8, 2.6]]

export function roomOccupants(kind: RoomId, buildingId: string): { r: Resident; at: Place; mode: RoomMode }[] {
  const out: { r: Resident; at: Place; mode: RoomMode }[] = []
  const staff = STAFF[kind]
  if (staff) residents.filter((r) => sim[r.id] && onShift(r, buildingId)).slice(0, staff.spots.length).forEach((r, i) => out.push({ r, at: staff.spots[i], mode: staff.mode }))
  if (kind === 'tavern') {
    const door = getBuilding(buildingId)!.door
    const patrons = residents.filter((r) => { const s = sim[r.id]; return s && s.indoors && s.target === door && (s.activity === 'eat' || s.activity === 'socialize') })
    patrons.slice(0, SEATS.length + STANDING.length).forEach((r, i) => {
      const seated = i < SEATS.length
      // whoever has company across the table chats, the rest eat quietly
      out.push({ r, at: seated ? SEATS[i] : STANDING[i - SEATS.length], mode: seated ? (i % 4 < 2 && patrons.length > 1 ? 'sitTalk' : 'sit') : patrons.length > 1 ? 'talk' : 'idle' })
    })
  }
  if (kind === 'house') residents.filter((r) => r.home === buildingId && sim[r.id]?.indoors && sim[r.id].activity !== 'work').slice(0, BEDSIDE.length).forEach((r, i) => out.push({ r, at: BEDSIDE[i], mode: 'idle' }))
  return out
}

/** Guild members who are home (not on a quest) wait in the hall. */
export const hallMembers = (): GuildMember[] => guild.members.filter((m) => !guild.active.some((a) => a.members.includes(m.id))).slice(0, HALL_SPOTS.length)
