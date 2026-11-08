// Live weather values: eases `env` (game/live.ts) toward what the calendar says. Renderer-independent.
import { seasonOf, weatherAt, type Weather } from './calendar'
import { env } from './live'
import { hourOf } from './store'

const CLOUD: Record<Weather, number> = { clear: 0, cloudy: 0.55, rain: 0.8, storm: 1, snow: 0.7, fog: 0.6 }
const ease = (rate: number, dt: number) => 1 - Math.exp(-dt * rate)
const smooth = (x: number, a: number, b: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** Sun height for game minute t: 0 at sunrise (6:00) and sunset (18:00), 1 at noon, negative at night. */
export const sunHeight = (t: number) => Math.sin(((hourOf(t) - 6) / 12) * Math.PI)
/** 0 = full day, 1 = deep night. */
export const nightAt = (t: number) => 1 - smooth(sunHeight(t), -0.12, 0.3)

/** Call once per frame (real seconds). */
export function stepEnv(dt: number, t: number) {
  const w = weatherAt(t), s = seasonOf(t), k = ease(0.6, dt), slow = ease(0.2, dt)
  env.night = nightAt(t)
  env.cloud += (CLOUD[w] - env.cloud) * k
  env.rain += ((w === 'rain' ? 0.65 : w === 'storm' ? 1 : 0) - env.rain) * k
  env.snow += ((w === 'snow' ? 1 : 0) - env.snow) * k
  env.fog += ((w === 'fog' ? 1 : 0) - env.fog) * k
  env.wet += ((w === 'rain' || w === 'storm' ? 1 : w === 'snow' ? 0.4 : 0) - env.wet) * slow
  env.snowCover += ((s === 'winter' ? (w === 'snow' ? 1 : 0.8) : 0) - env.snowCover) * slow
  env.leaves += ((s === 'autumn' ? (w === 'rain' || w === 'storm' ? 0.3 : 0.7) : 0) - env.leaves) * k
  env.petals += ((s === 'spring' && w !== 'rain' && w !== 'storm' ? 0.6 : 0) - env.petals) * k
}
