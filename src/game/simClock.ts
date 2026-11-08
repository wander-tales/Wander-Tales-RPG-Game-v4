// Runs the life simulation, calendar and quests in step with the game clock. Browser only (saves through the backend).
import { useGame } from './store.ts'
import { socialPass, tickSim } from './sim.ts'
import { checkQuests } from '../backend/sync.ts'
import { advanceCalendar } from './calendar.ts'

const clockState = { social: 0, last: null as number | null }
/** Runs the life simulation in step with the game clock. Call once per rendered frame. */
export function stepSim(rawDt: number) {
  const { time } = useGame.getState()
  // advance by exactly the game time that passed, so needs stay in step with the clock
  const dtMin = clockState.last === null ? 0 : Math.max(0, Math.min(time - clockState.last, 30))
  clockState.last = time
  const news = advanceCalendar(time)
  if (news.length) useGame.getState().notify(news.join(' · '))
  tickSim(dtMin, time)
  checkQuests(time)
  if ((clockState.social -= rawDt) <= 0) { clockState.social = 0.3; socialPass(time) }
}
