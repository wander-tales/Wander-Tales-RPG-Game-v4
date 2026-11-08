// Weather + ambient particles in 3D: rain streaks with splashes, snow, falling leaves/petals, fireflies, chimney smoke.
// Reads the eased `env` values (game/weather.ts). Square screen-space points, so every particle is a crisp pixel block.
import * as THREE from 'three'
import { env } from '../game/live'

interface Opts { inside: boolean; chimneys: THREE.Vector3[]; spring: boolean; summer: boolean; day: boolean }

/** A pool of points with per-point velocity and age. */
class Pool {
  readonly pts: THREE.Points
  pos: Float32Array; vel: Float32Array; age: Float32Array; life: Float32Array; col: Float32Array
  constructor(public n: number, size: number, colors: string[], blending: THREE.Blending = THREE.NormalBlending) {
    const g = new THREE.BufferGeometry()
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.age = new Float32Array(n).fill(1e9); this.life = new Float32Array(n); this.col = new Float32Array(n * 3)
    const c = new THREE.Color()
    for (let i = 0; i < n; i++) { c.set(colors[i % colors.length]); this.col.set([c.r, c.g, c.b], i * 3); this.pos[i * 3 + 1] = -999 }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, blending, depthWrite: blending === THREE.NormalBlending, transparent: blending !== THREE.NormalBlending }))
    this.pts.frustumCulled = false
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number) {
    for (let i = 0; i < this.n; i++) if (this.age[i] >= this.life[i]) { this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.age[i] = 0; this.life[i] = life; return }
  }
  live() { let k = 0; for (let i = 0; i < this.n; i++) if (this.age[i] < this.life[i]) k++; return k }
  step(dt: number, wob = 0, t = 0) {
    for (let i = 0; i < this.n; i++) {
      if ((this.age[i] += dt) >= this.life[i]) { this.pos[i * 3 + 1] = -999; continue }
      this.pos[i * 3] += (this.vel[i * 3] + (wob ? Math.sin(t * 2 + i) * wob : 0)) * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + (wob ? Math.cos(t * 1.7 + i) * wob : 0)) * dt
      if (this.pos[i * 3 + 1] < 0) this.age[i] = this.life[i]
    }
    this.pts.geometry.attributes.position.needsUpdate = true
  }
}

export class Weather {
  readonly group = new THREE.Group()
  private rain = new Pool(500, 2, ['#a8cbe8', '#cfe4f4'])
  private snow = new Pool(400, 3, ['#ffffff', '#eef4ff'])
  private leaves = new Pool(160, 3, ['#d9822b', '#b8442e', '#e7b33a', '#8a5a2a'])
  private petals = new Pool(140, 3, ['#f6a5c0', '#ffd1e0', '#ffffff'])
  private flies = new Pool(60, 3, ['#f6f08a'], THREE.AdditiveBlending)
  private smoke = new Pool(160, 5, ['#d6d1c8', '#c4bfb6'])
  private smokeT = 0
  constructor() { for (const p of [this.rain, this.snow, this.leaves, this.petals, this.flies, this.smoke]) this.group.add(p.pts) }

  /** `R`: particles live in a box this far around the camera target (grows when zoomed out) */
  update(dt: number, c: THREE.Vector3, R: number, o: Opts) {
    const t = performance.now() / 1000, out = !o.inside
    const thin = Math.min(1, 30 / R) // zoomed far out, fewer flecks — they'd only read as noise
    const fill = (p: Pool, want: number, make: () => void) => { for (let k = Math.round(want * thin) - p.live(); k > 0; k--) make() }
    const rx = () => c.x + (Math.random() * 2 - 1) * R, rz = () => c.z + (Math.random() * 2 - 1) * R
    if (out) {
      fill(this.rain, env.rain * 480, () => this.rain.spawn(rx(), 8 + Math.random() * 8, rz(), -2, -26, -1, 1.2))
      fill(this.snow, env.snow * 380, () => this.snow.spawn(rx(), 6 + Math.random() * 10, rz(), 0, -1.6 - Math.random(), 0, 12))
      fill(this.leaves, env.leaves * 140, () => this.leaves.spawn(rx(), 3 + Math.random() * 6, rz(), 0.6, -0.8, 0.3, 10))
      fill(this.petals, env.petals * 130, () => this.petals.spawn(rx(), 3 + Math.random() * 6, rz(), 0.7, -0.6, 0.2, 10))
      if ((o.spring || o.summer) && env.night > 0.6 && env.rain < 0.1) fill(this.flies, 50, () => this.flies.spawn(rx(), 0.4 + Math.random() * 1.6, rz(), 0, 0, 0, 5 + Math.random() * 5))
      if ((this.smokeT -= dt) <= 0) { this.smokeT = 0.25 + env.rain * 0.5; for (const ch of o.chimneys) if (Math.abs(ch.x - c.x) < R * 1.5 && Math.abs(ch.z - c.z) < R * 1.5) this.smoke.spawn(ch.x, ch.y, ch.z, 0.25, 0.9, -0.1, 3.5) }
    }
    this.rain.step(dt); this.snow.step(dt, 0.6, t); this.leaves.step(dt, 1.2, t); this.petals.step(dt, 1, t); this.smoke.step(dt, 0.15, t); this.flies.step(dt, 0.5, t)
    ;(this.flies.pts.material as THREE.PointsMaterial).opacity = Math.sin(t * 3) > -0.3 ? 1 : 0.2
    this.group.visible = out
  }
}
