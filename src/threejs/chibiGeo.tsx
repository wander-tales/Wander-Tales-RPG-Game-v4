// Voxel building blocks for the coded chibi: shared geometries/materials, primitives placed in character
// space, and the bare body. Character space: metres, faces +z, the character's left is +x, feet at y = 0.
// Every piece is authored in REST-pose coordinates and hung on a bone (see PIVOT); the rig rotates bones.
// Style: every primitive below renders as a block (RoundedBoxGeometry with a tiny bevel), not a sphere/
// cylinder/cone — this file is the single place the whole cast (player, NPCs, every equipped item) gets
// its voxel look from, so every caller in chibiParts.tsx stays untouched.
import { createElement, Fragment, type ReactNode } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/** World units: the body is authored about 0.475 m tall at rest; in town a character is scaled up to this. */
export const GAME_SCALE = 3.6
export type Motion = 'idle' | 'walk' | 'work' | 'talk' | 'sit' | 'sitTalk'

export type V3 = [number, number, number]
export type Bone = 'pelvis' | 'spine' | 'head' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'thighL' | 'thighR' | 'shinL' | 'shinR'
/** Rotation pivot of each bone in rest pose. */
/** Rest joint positions (left side; the right side mirrors x). Chunky block proportions, same as Register's simple chibi. */
export const J = {
  shoulder: [0.34, 0.82, 0] as V3, elbow: [0.34, 0.65, 0] as V3, wrist: [0.34, 0.52, 0] as V3, hand: [0.34, 0.47, 0.005] as V3,
  hip: [0.12, 0.4, 0] as V3, knee: [0.12, 0.23, 0] as V3, ankle: [0.12, 0.085, 0] as V3, foot: [0.12, 0.05, 0.03] as V3,
}
const mx = ([x, y, z]: V3): V3 => [-x, y, z]
/** Rotation pivot of each bone in rest pose. */
export const PIVOT: Record<Bone, V3> = {
  pelvis: [0, 0.42, 0], spine: [0, 0.54, 0], head: [0, 0.88, 0],
  armL: J.shoulder, armR: mx(J.shoulder), foreL: J.elbow, foreR: mx(J.elbow),
  thighL: J.hip, thighR: mx(J.hip), shinL: J.knee, shinR: mx(J.knee),
}
export const PARENT: Record<Bone, Bone | null> = {
  pelvis: null, spine: 'pelvis', head: 'spine', armL: 'spine', armR: 'spine', foreL: 'armL', foreR: 'armR',
  thighL: 'pelvis', thighR: 'pelvis', shinL: 'thighL', shinR: 'thighR',
}
export const HEAD = { c: [0, 1.22, 0] as V3, r: 0.37, s: [1, 0.94, 0.95] as V3 }
/** Gap between a layer and the body, so layers never pass through each other. */
export const LAYER = { cloth: 0.018, over: 0.034, armor: 0.05, outer: 0.066 }
export const LIMB = { upper: 0.062, fore: 0.06, thigh: 0.085, shin: 0.08 }

// ---------- torso shape: half-width by height (depth = width × TORSO_Z) — one straight block ----------
const TORSO: [number, number][] = [[0.38, 0.25], [0.885, 0.25]]
export const TORSO_Z = 0.82
export function torsoR(y: number) {
  if (y <= TORSO[0][0]) return TORSO[0][1]
  for (let i = 1; i < TORSO.length; i++) {
    const [y1, r1] = TORSO[i], [y0, r0] = TORSO[i - 1]
    if (y <= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0)
  }
  return TORSO[TORSO.length - 1][1]
}
/** Front surface z of a torso layer at height y. */
export const frontZ = (y: number, d = 0) => (torsoR(y) + d) * TORSO_Z

// ---------- caches ----------
const geos = new Map<string, THREE.BufferGeometry>()
const geo = <T extends THREE.BufferGeometry>(key: string, make: () => T) => {
  let g = geos.get(key)
  if (!g) { g = make(); geos.set(key, g) }
  return g as T
}
const mats = new Map<string, THREE.MeshStandardMaterial>()
export type MatOpts = { rough?: number; metal?: number; double?: boolean; emissive?: string }
export function mat(color: string, o: MatOpts = {}) {
  const k = `${color}|${o.rough ?? 0.78}|${o.metal ?? 0}|${o.double ? 2 : 1}|${o.emissive ?? ''}`
  let m = mats.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0, flatShading: true, side: o.double ? THREE.DoubleSide : THREE.FrontSide })
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = 0.4 }
    mats.set(k, m)
  }
  return m
}
/** Material presets by look. */
export const metal = (c: string) => mat(c, { rough: 0.38, metal: 0.6 })
export const gem = (c: string) => mat(c, { rough: 0.2, metal: 0.1, emissive: c })
export const cloth = (c: string) => mat(c, { rough: 0.9, double: true })

const q = (n: number) => Math.round(n * 1000)
/** Every block in the character shares this tiny edge bevel — just enough to catch light like a soft voxel, not round it off. */
const BEVEL = 0.01
function boxGeo(key: string, full: V3, bevel = BEVEL) {
  return geo(`vox${key}${full.map(q).join('|')}`, () => new RoundedBoxGeometry(Math.max(full[0], 0.004), Math.max(full[1], 0.004), Math.max(full[2], 0.004), 2, Math.min(bevel, Math.min(...full) / 2 - 0.0005)))
}

// ---------- primitives (all positions in rest-pose character space); every one renders a block ----------
type M = THREE.Material
/** Group children without React key warnings. */
export const G = (...children: ReactNode[]) => createElement(Fragment, null, ...children)

/** A block. `s` is the OLD ellipsoid-radius convention (half-size), kept so every caller is unchanged. */
export const Ell = (p: V3, s: V3 | number, m: M, r?: V3) => {
  const sv: V3 = typeof s === 'number' ? [s, s, s] : s
  return <mesh geometry={boxGeo('e', [sv[0] * 2, sv[1] * 2, sv[2] * 2])} material={m} position={p} rotation={r} castShadow receiveShadow />
}

const up = new THREE.Vector3(0, 1, 0)
const orient = (a: V3, b: V3) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = d.length()
  const quat = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize())
  return { len, quat, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as V3 }
}
/** A block limb from a to b (square cross-section, side = 2r). */
export function Seg(a: V3, b: V3, r: number, m: M) {
  const { len, quat, mid } = orient(a, b)
  return <mesh geometry={boxGeo('s', [r * 2, len, r * 2])} material={m} position={mid} quaternion={quat} castShadow receiveShadow />
}
/** Two stacked blocks from a to b (wide near a, narrow near b) — a chunky stepped taper reads as voxel, a smooth cone doesn't. */
export function Tube(a: V3, b: V3, ra: number, rb: number, m: M, _open = false) {
  const { len, quat } = orient(a, b)
  const half = len / 2
  const q1: V3 = [a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25, a[2] + (b[2] - a[2]) * 0.25]
  const q2: V3 = [a[0] + (b[0] - a[0]) * 0.75, a[1] + (b[1] - a[1]) * 0.75, a[2] + (b[2] - a[2]) * 0.75]
  return (
    <group>
      <mesh geometry={boxGeo('t1', [ra * 2, half, ra * 2])} material={m} position={q1} quaternion={quat} castShadow receiveShadow />
      <mesh geometry={boxGeo('t2', [rb * 2, half, rb * 2])} material={m} position={q2} quaternion={quat} castShadow receiveShadow />
    </group>
  )
}
/** A square band (belts, collars, bracelets) in place of a smooth ring. `arc` < half a turn renders as one short bar (a lip, a highlight). */
export function Ring(p: V3, R: number, t: number, m: M, r?: V3, sz = 1, arc = Math.PI * 2) {
  // bars lie in the XY plane like a torus, so callers' torus-style rotations (default: lay flat) still hold
  const bar = (rz: number, off: V3, key: string) => (
    <mesh key={key} geometry={boxGeo('rb', [R * 2 + t * 2, t * 2, t * 2])} material={m} position={off} rotation={[0, 0, rz]} castShadow receiveShadow />
  )
  const bars = [bar(0, [0, R, 0], 't')]
  if (arc > Math.PI * 1.5) bars.push(bar(0, [0, -R, 0], 'b'), bar(Math.PI / 2, [R, 0, 0], 'r'), bar(Math.PI / 2, [-R, 0, 0], 'l'))
  return <group position={p} rotation={r ?? [Math.PI / 2, 0, 0]} scale={[1, sz, 1]}>{bars}</group>
}
/** A block (the `radius` a caller passes is ignored — every block shares the same small voxel bevel). */
export function RBox(p: V3, s: V3, m: M, r?: V3, _radius = 0.02) {
  return <mesh geometry={boxGeo('r', s)} material={m} position={p} rotation={r} castShadow receiveShadow />
}
/** A pyramid (4-sided cone) — `seg` defaults to 4 so this reads as a block spike, not a smooth cone. */
export function Cone(p: V3, r: number, h: number, m: M, rot?: V3, seg = 4) {
  const g = geo(`cone${q(r)}|${q(h)}|${seg}`, () => new THREE.ConeGeometry(r, h, seg))
  return <mesh geometry={g} material={m} position={p} rotation={rot} castShadow receiveShadow />
}
/** A flat square tile in place of a disc. */
export function Disc(p: V3, r: number, h: number, m: M, rot?: V3) {
  return <mesh geometry={boxGeo('d', [r * 2, h, r * 2])} material={m} position={p} rotation={rot} castShadow receiveShadow />
}

/** A fixed vertical grid every Shell() snaps to, so two different clothing layers' blocks always share the same seams (like brick courses). */
const STEP = 0.07

/**
 * A layer that follows the torso between heights y0..y1, `d` outside the body — a stack of blocks snapped
 * to the shared STEP grid, each sized to the torso's width at that height. Below the hips it can flare out
 * like a skirt. `phi` (a GLB-era partial-circle param) is approximated as a single front-facing patch.
 */
export function Shell(y0: number, y1: number, d: number, m: M, o: { flare?: number; phi?: [number, number]; flareFrom?: number } = {}) {
  const flare = o.flare ?? 0, from = o.flareFrom ?? 0.44
  const widthAt = (yc: number) => torsoR(Math.max(yc, from)) + d + (yc < from ? (from - yc) * flare : 0)
  if (o.phi) {
    const yc = (y0 + y1) / 2, rr = widthAt(yc)
    return <mesh geometry={boxGeo('shp', [rr * 1.5, y1 - y0, 0.045])} material={m} position={[0, yc, rr * TORSO_Z * 0.95]} castShadow receiveShadow />
  }
  const boxes: ReactNode[] = []
  for (let y = Math.floor(y0 / STEP) * STEP; y < y1 - 1e-6; y += STEP) {
    const ya = Math.max(y, y0), yb = Math.min(y + STEP, y1)
    if (yb - ya < 1e-4) continue
    const yc = (ya + yb) / 2, rr = widthAt(yc)
    boxes.push(<mesh key={y} geometry={boxGeo('sh', [rr * 2, yb - ya + 0.006, rr * 2 * TORSO_Z])} material={m} position={[0, yc, 0]} castShadow receiveShadow />)
  }
  return <group>{boxes}</group>
}

/** Point on the head's box surface in direction (x, y, z) (normalised), pushed `out` metres outward. */
export function onHead(x: number, y: number, z: number, out = 0): V3 {
  const l = Math.hypot(x, y, z) || 1
  const [sx, sy, sz] = HEAD.s, r = HEAD.r + out
  return [HEAD.c[0] + (x / l) * r * sx, HEAD.c[1] + (y / l) * r * sy, HEAD.c[2] + (z / l) * r * sz]
}
/** Rotation that turns +z to face outward from the head centre at (x, y, z). */
export const faceOut = (x: number, y: number, z: number): V3 => [-Math.atan2(y, Math.hypot(x, z)), Math.atan2(x, z), 0]

/** A block hairstyle/hat layer over part of the head: `thetaMax` (0..PI/2) is how far down it reaches, `tilt` tips it back. */
export function HeadCap(out: number, thetaMax: number, tilt: number, m: M, _phi: [number, number] = [0, Math.PI * 2], scale: V3 = [1, 1, 1]) {
  const r = HEAD.r + out, coverage = Math.min(0.95, thetaMax / (Math.PI * 1.6))
  const full: V3 = [2 * r * HEAD.s[0] * scale[0], 2 * r * HEAD.s[1] * scale[1] * coverage, 2 * r * HEAD.s[2] * scale[2]]
  const yTop = HEAD.c[1] + HEAD.r * HEAD.s[1]
  return <mesh geometry={boxGeo('hc', full)} material={m} position={[HEAD.c[0], yTop - full[1] / 2, HEAD.c[2]]} rotation={[-tilt, 0, 0]} castShadow receiveShadow />
}

/** A stepped block crown (hat tops, helmets, pauldrons) — two shrinking blocks stacked, in place of a smooth dome. */
export function Dome(p: V3, s: V3, m: M, r?: V3) {
  return (
    <group position={p} rotation={r}>
      <mesh geometry={boxGeo('doA', [s[0] * 1.9, s[1] * 0.85, s[2] * 1.9])} material={m} position={[0, s[1] * 0.28, 0]} castShadow receiveShadow />
      <mesh geometry={boxGeo('doB', [s[0] * 1.25, s[1] * 0.95, s[2] * 1.25])} material={m} position={[0, s[1] * 0.78, 0]} castShadow receiveShadow />
    </group>
  )
}
/**
 * A stack of flat slabs tapering from rTop (collar) to rBot (hem), hanging down `h` — capes, trailing hair.
 * `arcHalf`/`center` (a GLB-era curvature param) are dropped: a voxel cape reads as a flat panel, not a curved cone slice.
 */
export function Sheet(p: V3, rTop: number, rBot: number, h: number, _arcHalf: number, m: M, _inner: M, sz = 1, rot?: V3, _center = -Math.PI / 2) {
  const n = Math.max(3, Math.round(h / 0.11))
  const slabs: ReactNode[] = []
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, rr = rTop + (rBot - rTop) * t
    slabs.push(<mesh key={i} geometry={boxGeo('sl', [rr * 2, h / n + 0.006, 0.05])} material={m} position={[0, h / 2 - h * t, 0]} castShadow receiveShadow />)
  }
  return <group position={p} rotation={rot} scale={[1, 1, sz]}>{slabs}</group>
}

/** A thick block hair cap over the top of the head with a low fringe — reused by every hairstyle. */
export function hairCap(c: string, out = 0.075) {
  const m = cloth(c)
  return G(
    HeadCap(out, Math.PI * 0.6, 0.08, m),
    HeadCap(out + 0.012, Math.PI * 0.32, -0.25, m, [0, Math.PI * 2], [1, 0.9, 1]), // low fringe over the forehead, puffier than the cap
  )
}

/** Mirror a left-side piece onto the right side. */
export const Mirror = (n: ReactNode) => <group scale={[-1, 1, 1]}>{n}</group>
export const mirrorV = ([x, y, z]: V3): V3 => [-x, y, z]

/** The one pixel-eye shape every chibi face uses (Register's simple preview and the full in-town body share it). */
// the head is a box, so face marks sit flat on its front face (onHead() aims at a round head and sinks them in)
const faceZ = () => HEAD.c[2] + HEAD.r * HEAD.s[2]
export function pixelEye(x: number) {
  return Ell([x * 0.45, HEAD.c[1] - 0.03, faceZ()], [0.085, 0.095, 0.012], mat('#000000', { rough: 0.5 }))
}
/** The small blush mark under each eye — also shared with Register's simple preview. */
export function blushMark(x: number) {
  return Ell([0.25 * Math.sign(x || 1), HEAD.c[1] - 0.15, faceZ()], [0.05, 0.026, 0.008], mat('#f3a3a0', { rough: 0.85 }))
}

// ---------- the bare body ----------
export function body(skin: string): Partial<Record<Bone, ReactNode[]>> {
  const s = mat(skin, { rough: 0.7 })
  const shorts = mat('#5a4a3c', { rough: 0.9 })
  const arm = G(Ell(J.shoulder, 0.066, s), Seg(J.shoulder, J.elbow, LIMB.upper, s))
  const fore = G(Seg(J.elbow, J.wrist, LIMB.fore, s), Ell(J.hand, [0.07, 0.078, 0.064], s))
  const thigh = Seg(J.hip, J.knee, LIMB.thigh, s)
  const shin = G(Seg(J.knee, J.ankle, LIMB.shin, s), Ell(J.foot, [0.07, 0.056, 0.11], s))
  return {
    pelvis: [Ell([0, 0.45, 0], [0.25, 0.1, 0.2], shorts), Shell(0.4, 0.56, 0.002, shorts), Ell(J.hip, 0.08, shorts), Ell(mirrorV(J.hip), 0.08, shorts)],
    spine: [Shell(0.5, 0.885, 0, s), Tube([0, 0.84, 0], [0, 0.93, 0], 0.058, 0.055, s)],
    // plain block face — same minimal look as Register's "Become a Resident" preview: eyes + blush, no brow/nose/mouth clutter
    head: [
      Ell(HEAD.c, [HEAD.r * HEAD.s[0], HEAD.r * HEAD.s[1], HEAD.r * HEAD.s[2]], s),
      pixelEye(0.34), pixelEye(-0.34), blushMark(0.34), blushMark(-0.34),
      Ell([0.355, 1.17, -0.01], [0.045, 0.066, 0.05], s), Ell([-0.355, 1.17, -0.01], [0.045, 0.066, 0.05], s),
    ],
    armL: [arm], armR: [Mirror(arm)], foreL: [fore], foreR: [Mirror(fore)],
    thighL: [thigh], thighR: [Mirror(thigh)], shinL: [shin], shinR: [Mirror(shin)],
  }
}
