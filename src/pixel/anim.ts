// One animation state machine for every character (player and NPCs). It only reads movement/gameplay state and
// picks frames — it never writes positions.
import { SHEET, type Dir, type State } from './sheet.ts'

const ONE_SHOT: State[] = ['attack', 'hit', 'interact']

export class Animator {
  state: State = 'idle'
  dir: Dir = 'down'
  frame = 0
  private t = 0
  private shot: State | null = null // a one-shot playing over the movement state

  /** Facing from a world-space move direction (x east, z south). Small moves keep the old facing. */
  face(dx: number, dz: number) {
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return
    this.dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : dz > 0 ? 'down' : 'up'
  }
  /** Facing from a heading angle as the sim stores it (atan2(dx, dz)). */
  faceAngle(a: number) { this.face(Math.sin(a), Math.cos(a)) }

  /** Movement-driven base state: idle / walk / run / interact (looping) / death (holds). */
  set(next: State) {
    if (this.state === 'death') return // dead stays dead until revive()
    if (next === this.state) return // never restart the same clip every frame
    this.state = next; this.frame = 0; this.t = 0
  }
  /** Fire a one-shot (attack, hit, interact once). Returns to the movement state when done. */
  play(s: State) {
    if (this.state === 'death') return
    this.shot = s; this.frame = 0; this.t = 0
  }
  revive() { this.state = 'idle'; this.shot = null; this.frame = 0; this.t = 0 }

  /** Clip on screen right now. */
  get clip(): State { return this.shot ?? this.state }

  update(dt: number) {
    const clip = this.clip, meta = SHEET.states[clip]
    this.t += dt
    const step = 1 / meta.fps
    while (this.t >= step) {
      this.t -= step
      if (this.frame + 1 < meta.frames) this.frame++
      else if (meta.loop && !(this.shot && ONE_SHOT.includes(clip))) this.frame = 0
      else if (this.shot) { this.shot = null; this.frame = 0; break } // one-shot finished
      // non-looping base state (death): hold the last frame
    }
  }
}
