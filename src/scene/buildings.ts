// 3D buildings: real walls, side walls, sloped roofs with thickness and overhang, gable ends, chimneys, foundations
// and steps, with pixel-art textures painted to each face's exact size. Every building stands on its collision box
// from game/map.ts (solidBoxes), so what you see is what blocks you.
import * as THREE from 'three'
import { solidBoxes, type BiomeRegion, type BuildingDef } from '../game/map'
import type { Box } from '../game/collision'
import { height } from '../game/terrain'
import { PAL, shade } from '../pixel/paint'
import { colorMat, matOf, plankTex, roofTex, stoneTex, stripeTex, tex, waterTex, worldUV, PPM } from './tex'
import { paintFacade, paintGable, type Face, type FacadeStyle } from './facade'

type FaceKey = 'px' | 'nx' | 'pz' | 'nz'
interface Kind { f: FacadeStyle; h: number; floors: number; roof: string; pitch: number; ridge: 'x' | 'z'; chimney?: boolean; door?: Face['door'] }
const K = (o: Partial<Kind> & { f: FacadeStyle }): Kind => ({ h: 3, floors: 1, roof: '#b8442e', pitch: 0.75, ridge: 'x', door: 'single', ...o })

const STYLES: Partial<Record<BuildingDef['kind'], Kind>> = {
  guild: K({ f: { wall: '#efe0bf', half: true, shutter: '#3e5c8a', flowers: true, banners: true }, h: 5.2, floors: 2, roof: '#c0473a', pitch: 0.7, door: undefined }),
  tavern: K({ f: { wall: '#e9d3a6', shutter: '#5f8a3a', flowers: true, sign: 'mug', barrels: true }, h: 4.8, floors: 2, roof: '#b8442e', pitch: 0.7, chimney: true }),
  bakery: K({ f: { wall: '#f2e3c6', shutter: '#9c3d3d', flowers: true, sign: 'bread' }, h: 3.2, roof: '#d9772f', pitch: 0.8, chimney: true, ridge: 'z' }),
  blacksmith: K({ f: { wall: '#8f877b', stone: true, sign: 'anvil' }, h: 3.4, roof: '#4a4a58', pitch: 0.6 }),
  construction: K({ f: { wall: '#c9a46a', planks: true, sign: 'log' }, h: 2.6, roof: '#6b4a2e', pitch: 0.5 }),
  lumber: K({ f: { wall: '#c9a46a', planks: true, sign: 'log' }, h: 2.8, roof: '#5f7a3a', pitch: 0.6 }),
  quarry: K({ f: { wall: '#a59f93', stone: true, sign: 'pick' }, h: 2.6, roof: '#6b6b70', pitch: 0.5 }),
  mine: K({ f: { wall: '#7d756b', stone: true, sign: 'pick' }, h: 2.6, roof: '#4a3a2e', pitch: 0.5 }),
  workshop: K({ f: { wall: '#e6d3ad', shutter: '#8a4b2a', flowers: true, sign: 'gear' }, h: 3.2, roof: '#3f6b5a', chimney: true }),
  alchemist: K({ f: { wall: '#e2d8ee', shutter: '#3f6b5a', flowers: true, sign: 'potion' }, h: 3.4, roof: '#5b3d8a', pitch: 0.9, ridge: 'z' }),
  farm: K({ f: { wall: '#a8432e', planks: true }, h: 3.6, roof: '#6b2f24', pitch: 0.8, ridge: 'z', door: 'barn' }),
}

const OUTPOST_STYLES: Record<BiomeRegion, Kind[]> = {
  snow: [
    K({ f: { wall: '#dce8f2', half: true, shutter: '#2f5a82' }, h: 3.6, roof: '#366896', pitch: 0.95, chimney: true }),
    K({ f: { wall: '#b8cad8', stone: true, shutter: '#3c6e9c' }, h: 5.0, floors: 2, roof: '#2b5278', pitch: 0.85 }),
  ],
  ash: [
    K({ f: { wall: '#5c524e', stone: true, shutter: '#9c3628' }, h: 3.8, roof: '#7a2820', pitch: 0.65, chimney: true }),
    K({ f: { wall: '#4e4644', stone: true, sign: 'anvil' }, h: 4.4, floors: 2, roof: '#5c221c', pitch: 0.7, chimney: true }),
  ],
  sand: [
    K({ f: { wall: '#e8c88b', shutter: '#b85d28', banners: true }, h: 3.5, roof: '#c97a2b', pitch: 0.45 }),
    K({ f: { wall: '#dfb978', stone: true, shutter: '#3e6b8a' }, h: 3.8, roof: '#b86224', pitch: 0.5, ridge: 'z' }),
  ],
  lush: [
    K({ f: { wall: '#d8e2c4', half: true, shutter: '#2e6b3e', flowers: true }, h: 3.6, roof: '#2f6e3b', pitch: 0.85, chimney: true }),
    K({ f: { wall: '#c8d6b4', planks: true, shutter: '#3b7a4c', flowers: true }, h: 3.4, roof: '#3c8044', pitch: 0.9, ridge: 'z' }),
  ],
}
/** Four different cottages, not one model in four colours: height, storeys, roof direction and pitch, wall build. */
const HOUSES: Kind[] = [
  K({ f: { wall: '#efe0bf', shutter: '#3f6b8c', flowers: true }, h: 2.7, roof: '#b8442e', pitch: 0.85, chimney: true }), // low cottage
  K({ f: { wall: '#e6d3ad', shutter: '#9c3d3d', flowers: true }, h: 4.3, floors: 2, roof: '#3f6b8c', pitch: 0.75, ridge: 'z', chimney: true }), // two-storey, gable to the street
  K({ f: { wall: '#f2e3c6', half: true, shutter: '#8a4b2a', flowers: true }, h: 3.4, roof: '#5f8a3a', pitch: 0.65, chimney: true }), // stone-based
  K({ f: { wall: '#e9d3a6', shutter: '#3e5c8a', flowers: true }, h: 3, roof: '#d9772f', pitch: 1, ridge: 'z', chimney: true }), // steep-roofed
]
const idHash = (id: string) => [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)

/** Which wall the door is on: rot 0 → south (+z), π/2 → east (+x), -π/2 → west (-x), π → north (-z). */
export const doorFace = (rot: number): FaceKey => (Math.cos(rot) > 0.5 ? 'pz' : Math.cos(rot) < -0.5 ? 'nz' : Math.sin(rot) > 0 ? 'px' : 'nx')

export interface Built { group: THREE.Group; lights: THREE.Vector3[]; chimneys: THREE.Vector3[]; fire?: THREE.Vector3 }

const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, tile = 0) => {
  const g = new THREE.BoxGeometry(w, h, d)
  if (tile) worldUV(g, tile)
  const mesh = new THREE.Mesh(g, m)
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true
  return mesh
}

/** Walls of a w×H×d block, each face with its own painted texture; `door` puts the door on that face. */
function walls(k: Kind, w: number, d: number, H: number, door: FaceKey | null, seed: number, lights: THREE.Vector3[], at: THREE.Vector3) {
  const face = (key: FaceKey) => {
    const width = key === 'px' || key === 'nx' ? d : w
    const p = paintFacade(k.f, Math.round(width * PPM), Math.round(H * PPM), { floors: k.floors, door: key === door ? k.door : undefined }, seed)
    for (const [lx, ly] of p.lights) { // lantern positions back to 3D (face pixels → local metres)
      const u = lx / PPM - width / 2, y = H - ly / PPM
      lights.push(new THREE.Vector3(...(key === 'pz' ? [u, y, d / 2 + 0.15] : key === 'nz' ? [-u, y, -d / 2 - 0.15] : key === 'px' ? [d / 2 * 0 + w / 2 + 0.15, y, -u] : [-w / 2 - 0.15, y, u]) as [number, number, number]).add(at))
    }
    return matOf(tex(p.canvas))
  }
  const top = colorMat(shade(k.f.wall, -0.4))
  return box(w, H, d, [face('px'), face('nx'), top, top, face('pz'), face('nz')], at.x, at.y + H / 2, at.z)
}

/** Gable roof over a w (along the ridge) × d block whose walls are H tall. Ridge along local x. */
function gableRoof(k: Kind, w: number, d: number, H: number, emblem = false) {
  const g = new THREE.Group(), oh = 0.45, t = 0.2, p = Math.atan(k.pitch)
  const S = d / 2 + oh, rise = (d / 2) * Math.tan(p), L = w + 2 * oh, sw = S / Math.cos(p)
  const rm = matOf(roofTex(k.roof))
  for (const side of [1, -1]) {
    const geo = worldUV(new THREE.BoxGeometry(L, t, sw), 2)
    const m = new THREE.Mesh(geo, [colorMat(shade(k.roof, -0.45)), colorMat(shade(k.roof, -0.45)), rm, colorMat(shade(k.roof, -0.5)), colorMat(shade(k.roof, -0.4)), colorMat(shade(k.roof, -0.4))])
    m.rotation.x = side * p
    m.position.set(0, H + rise - (S / 2) * Math.tan(p) + t / 2 / Math.cos(p), (side * S) / 2)
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
  }
  g.add(box(L, 0.16, 0.3, colorMat(shade(k.roof, -0.35)), 0, H + rise + 0.12, 0)) // ridge cap
  // gable ends
  const gc = paintGable(k.f, Math.round(d * PPM), Math.max(4, Math.round(rise * PPM)), emblem)
  const gm = matOf(tex(gc))
  for (const side of [1, -1]) {
    const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)])
    const geo = new THREE.ShapeGeometry(shape)
    const uv = geo.attributes.uv, pos = geo.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + d / 2) / d, pos.getY(i) / rise)
    const m = new THREE.Mesh(geo, gm)
    m.rotation.y = (side * Math.PI) / 2
    m.position.set((side * w) / 2 + side * 0.01, H, 0)
    m.receiveShadow = true
    g.add(m)
  }
  return g
}

function chimney(x: number, z: number, top: number) {
  const g = new THREE.Group(), h = top + 0.9
  g.add(box(0.8, h, 0.8, matOf(stoneTex('#9a8f84')), x, h / 2, z, 2))
  g.add(box(1, 0.2, 1, colorMat('#5c544c'), x, h + 0.1, z))
  return { g, smoke: new THREE.Vector3(x, h + 0.35, z) }
}

/** A complete gabled building on a w×d plan (local, centred) whose door is on face `door`. */
function house(k: Kind, w: number, d: number, door: FaceKey | null, seed: number, out: Built, emblem = false) {
  const g = new THREE.Group()
  g.add(box(w + 0.2, 0.3, d + 0.2, matOf(stoneTex()), 0, 0.15, 0, 2)) // foundation
  g.add(walls(k, w, d, k.h, door, seed, out.lights, new THREE.Vector3(0, 0, 0)))
  const roof = gableRoof(k, k.ridge === 'x' ? w : d, k.ridge === 'x' ? d : w, k.h, emblem)
  if (k.ridge === 'z') roof.rotation.y = Math.PI / 2
  g.add(roof)
  if (k.chimney) {
    const span = k.ridge === 'x' ? d : w, rise = (span / 2) * k.pitch
    const cx = k.ridge === 'x' ? w * 0.28 : -w * 0.22, cz = k.ridge === 'x' ? -d * 0.18 : d * 0.25
    const c = chimney(cx, cz, k.h + rise * 0.9)
    g.add(c.g); out.chimneys.push(c.smoke)
  }
  if (door) { // two stone steps in front of the door
    const [nx, nz] = door === 'pz' ? [0, 1] : door === 'nz' ? [0, -1] : door === 'px' ? [1, 0] : [-1, 0]
    const half = nz ? d / 2 : w / 2
    for (const [o, h, s] of [[0.25, 0.22, 1.7], [0.55, 0.11, 2.1]] as const) g.add(box(nz ? s : 0.3, h, nz ? 0.3 : s, matOf(stoneTex(PAL.stone[2])), nx * (half + o), h / 2, nz * (half + o), 2))
  }
  return g
}

/** Build one building's 3D model, placed in world space. `progress` 0..1 while under construction. */
export function buildBuilding(b: BuildingDef, progress?: number): Built {
  const out: Built = { group: new THREE.Group(), lights: [], chimneys: [] }
  const groundY = Math.max(0, height(b.x, b.z))
  if (b.kind === 'square') { out.group.add(fountain()); out.group.position.set(b.x, groundY, b.z); return out }
  if (b.kind === 'dock') return dock(b, out)
  if (b.kind === 'market') return market(b, out)
  if (b.kind === 'dungeon') return buildDungeon(b, out, groundY)
  const bx: Box = b.kind === 'farm' ? solidBoxes(b)[5] : solidBoxes(b)[0]
  const w = bx.maxX - bx.minX, d = bx.maxZ - bx.minZ, seed = idHash(b.id)
  out.group.position.set((bx.minX + bx.maxX) / 2, groundY, (bx.minZ + bx.maxZ) / 2)
  const outpostList = b.biomeRegion ? OUTPOST_STYLES[b.biomeRegion] : undefined
  const k = b.kind === 'house'
    ? HOUSES[seed % HOUSES.length]
    : b.kind === 'outpost' && outpostList
      ? outpostList[seed % outpostList.length]
      : STYLES[b.kind] ?? HOUSES[0]
  const door = doorFace(b.rot)
  if (progress !== undefined) { out.group.add(scaffold(w, d, k.h, progress)); return out }

  if (b.kind === 'guild') { // great hall + an entrance tower in front with its own spire
    const hallD = d - 1.2
    const hall = house(k, w, hallD, null, seed, out)
    hall.position.z = -0.6
    out.group.add(hall)
    const tk: Kind = { ...k, f: { ...k.f, banners: false, half: true }, h: k.h + 2.2, floors: 3, door: 'double' }
    const tw = 3.8, td = 3.4, tz = d / 2 - td / 2
    const tower = new THREE.Group()
    tower.add(walls(tk, tw, td, tk.h, 'pz', seed, out.lights, new THREE.Vector3(0, 0, tz)))
    const spire = new THREE.Mesh(new THREE.ConeGeometry(tw * 0.82, 3.2, 4), matOf(roofTex(k.roof)))
    spire.rotation.y = Math.PI / 4; spire.position.set(0, tk.h + 1.6, tz); spire.castShadow = true
    tower.add(spire, box(0.1, 1.4, 0.1, colorMat('#2a2d34'), 0, tk.h + 3.9, tz), box(0.7, 0.45, 0.04, colorMat('#c0473a'), 0.38, tk.h + 4.3, tz))
    for (const [o, h, s] of [[0.25, 0.22, 2.6], [0.55, 0.11, 3.2]] as const) tower.add(box(s, h, 0.3, matOf(stoneTex(PAL.stone[2])), 0, h / 2, d / 2 + o, 2))
    out.group.add(tower)
    // flower gardens either side of the entrance
    for (const sx of [-1, 1]) out.group.add(box(2.6, 0.18, 0.7, matOf(tex(flowerBed())), sx * (tw / 2 + 1.7), 0.09, d / 2 + 0.45))
    return out
  }
  if (b.kind === 'blacksmith') { // stone workshop + an open forge under a lean-to on the door side
    const [ax, sign] = door === 'px' || door === 'nx' ? ['x', door === 'px' ? 1 : -1] as const : ['z', door === 'pz' ? 1 : -1] as const
    const strip = 2
    const mw = ax === 'x' ? w - strip : w, md = ax === 'z' ? d - strip : d
    const shop = house(k, mw, md, door, seed, out)
    if (ax === 'x') shop.position.x = -sign * strip / 2; else shop.position.z = -sign * strip / 2
    out.group.add(shop)
    const fx = ax === 'x' ? sign * (w / 2 - strip / 2) : 0, fz = ax === 'z' ? sign * (d / 2 - strip / 2) : 0
    const along = ax === 'x' ? d : w
    // lean-to roof on posts
    const lean = box(ax === 'x' ? strip + 0.4 : along * 0.7, 0.15, ax === 'x' ? along * 0.7 : strip + 0.4, matOf(roofTex(k.roof)), fx, 2.5, fz, 2)
    if (ax === 'x') lean.rotation.z = -sign * 0.3; else lean.rotation.x = sign * 0.3
    out.group.add(lean)
    for (const s of [-1, 1]) out.group.add(box(0.16, 2.4, 0.16, matOf(plankTex(PAL.wood[2], true)), ax === 'x' ? fx + sign * 0.8 : s * along * 0.32, 1.2, ax === 'z' ? fz + sign * 0.8 : s * along * 0.32))
    // forge with glowing coals + big chimney, and an anvil
    const fo = new THREE.Vector3(ax === 'x' ? fx : -along * 0.18, 0, ax === 'z' ? fz : -along * 0.18)
    out.group.add(box(1.3, 1, 1.1, matOf(stoneTex('#6b6560')), fo.x, 0.5, fo.z, 2))
    out.group.add(box(0.9, 0.1, 0.7, colorMat('#f29a4a', '#d0581a'), fo.x, 1.03, fo.z))
    const ch = chimney(fo.x, fo.z, k.h + 2.2); out.group.add(ch.g); out.chimneys.push(ch.smoke)
    out.fire = fo.clone().add(new THREE.Vector3(0, 1.2, 0)).add(out.group.position)
    const an = new THREE.Vector3(ax === 'x' ? fx : along * 0.15, 0, ax === 'z' ? fz : along * 0.15)
    out.group.add(box(0.45, 0.5, 0.45, matOf(plankTex(PAL.wood[0])), an.x, 0.25, an.z), box(0.75, 0.22, 0.3, colorMat('#3a3d44'), an.x, 0.6, an.z))
    return out
  }

  out.group.add(house(k, w, d, door, seed, out, false))
  if (b.kind === 'tavern') { // balcony on the upper floor of the door side
    const along = door === 'px' || door === 'nx' ? d : w, n = door === 'px' ? [1, 0] : door === 'nx' ? [-1, 0] : door === 'pz' ? [0, 1] : [0, -1]
    const half = n[0] ? w / 2 : d / 2, bw = along * 0.62, y = k.h / 2 + 0.1
    const slab = box(n[0] ? 1 : bw, 0.15, n[0] ? bw : 1, matOf(plankTex()), n[0] * (half + 0.5), y, n[1] * (half + 0.5), 2)
    out.group.add(slab)
    for (let i = 0; i <= 6; i++) { const t = -bw / 2 + (bw * i) / 6; out.group.add(box(0.08, 0.7, 0.08, colorMat(PAL.wood[2]), n[0] ? n[0] * (half + 0.95) : t, y + 0.42, n[1] ? n[1] * (half + 0.95) : t)) }
    out.group.add(box(n[0] ? 0.1 : bw, 0.1, n[0] ? bw : 0.1, colorMat(PAL.wood[1]), n[0] * (half + 0.95), y + 0.8, n[1] * (half + 0.95)))
    for (let i = -1; i <= 1; i += 2) out.group.add(box(0.5, 0.45, 0.5, matOf(tex(flowerBed())), n[0] ? n[0] * (half + 0.5) : i * bw * 0.35, y + 0.3, n[1] ? n[1] * (half + 0.5) : i * bw * 0.35))
  }
  if (b.kind === 'bakery' || b.kind === 'workshop') { // striped awning over the door-side windows
    const along = door === 'px' || door === 'nx' ? d : w, n = door === 'px' ? [1, 0] : door === 'nx' ? [-1, 0] : door === 'pz' ? [0, 1] : [0, -1]
    const half = n[0] ? w / 2 : d / 2
    const aw = box(n[0] ? 1 : along * 0.8, 0.06, n[0] ? along * 0.8 : 1, matOf(stripeTex(b.kind === 'bakery' ? '#e7b33a' : '#3f6b5a', '#f2e3c6')), n[0] * (half + 0.45), 2.45, n[1] * (half + 0.45), 0.5)
    if (n[0]) aw.rotation.z = -n[0] * 0.4; else aw.rotation.x = n[1] * 0.4
    out.group.add(aw)
  }
  return out
}

let bedCanvas: HTMLCanvasElement | null = null
function flowerBed() { // a planted bed seen from above: leaves and blossoms
  if (bedCanvas) return bedCanvas
  bedCanvas = document.createElement('canvas'); bedCanvas.width = 32; bedCanvas.height = 32
  const x = bedCanvas.getContext('2d')!
  x.fillStyle = PAL.leaf[0]; x.fillRect(0, 0, 32, 32)
  let s = 5
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let k = 0; k < 50; k++) { x.fillStyle = PAL.leaf[r() < 0.5 ? 1 : 2]; x.fillRect(Math.floor(r() * 31), Math.floor(r() * 31), 2, 2) }
  for (let k = 0; k < 24; k++) { x.fillStyle = PAL.flower[Math.floor(r() * PAL.flower.length)]; x.fillRect(Math.floor(r() * 30), Math.floor(r() * 30), 2, 2) }
  return bedCanvas
}

function scaffold(w: number, d: number, H: number, p: number) {
  const g = new THREE.Group(), built = Math.max(0.3, H * Math.min(1, p) * 0.85)
  g.add(box(w + 0.2, 0.3, d + 0.2, matOf(stoneTex()), 0, 0.15, 0, 2))
  g.add(box(w - 0.2, built, d - 0.2, matOf(plankTex('#c9a46a', true)), 0, built / 2, 0, 2))
  const pole = matOf(plankTex(PAL.wood[2], true))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.14, H + 0.6, 0.14, pole, sx * (w / 2 + 0.2), (H + 0.6) / 2, sz * (d / 2 + 0.2)))
  for (const y of [1.2, 2.4]) if (y < H) { g.add(box(w + 0.6, 0.1, 0.4, matOf(plankTex()), 0, y, d / 2 + 0.3)); g.add(box(0.4, 0.1, d + 0.6, matOf(plankTex()), w / 2 + 0.3, y, 0)) }
  return g
}

function fountain() {
  const g = new THREE.Group(), stone = matOf(stoneTex(PAL.stone[2])), wm = matOf(waterTex())
  const cyl = (r: number, h: number, y: number, m: THREE.Material, seg = 12) => { const mesh = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(r, r, h, seg), 2), m); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh }
  cyl(1.95, 0.55, 0.275, stone, 14)
  cyl(1.7, 0.05, 0.5, wm, 14).userData.water = true
  cyl(0.32, 1.5, 0.75, stone, 8)
  cyl(0.85, 0.22, 1.5, stone, 10)
  cyl(0.72, 0.04, 1.62, wm, 10).userData.water = true
  cyl(0.14, 0.5, 1.85, stone, 6)
  return g
}

function dock(b: BuildingDef, out: Built) {
  out.group.position.set(b.x, 0, b.z)
  out.group.add(box(b.w, 0.18, b.d, matOf(plankTex(PAL.wood[1], Math.abs(Math.sin(b.rot)) < 0.5)), 0, 0.06, 0, 2))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.group.add(box(0.22, 1, 0.22, colorMat(PAL.wood[2]), sx * (b.w / 2 - 0.2), -0.3, sz * (b.d / 2 - 0.2)))
  out.group.add(box(0.7, 0.6, 0.6, matOf(plankTex(PAL.wood[0])), b.w / 2 - 0.9, 0.45, -b.d / 2 + 0.7))
  return out
}

/** Market row: a stall per ~3 m with counter, posts, sloped striped awning and crates of goods. */
function market(b: BuildingDef, out: Built) {
  const bx = solidBoxes(b)[0], w = bx.maxX - bx.minX, d = bx.maxZ - bx.minZ
  out.group.position.set((bx.minX + bx.maxX) / 2, 0, (bx.minZ + bx.maxZ) / 2)
  const front = Math.cos(b.rot) < -0.5 ? -1 : 1 // shoppers stand on the open side
  const n = Math.max(2, Math.round(w / 3)), sw = w / n
  const stripes: [string, string][] = [['#c94f4f', '#f2e3c6'], ['#3e5c8a', '#f2e3c6'], ['#d6a03c', '#f2e3c6']]
  const goods = ['#e8b04a', '#c94f4f', '#7fb04a', '#9a7be0', '#d9772f']
  for (let k = 0; k < n; k++) {
    const sx = -w / 2 + sw * (k + 0.5)
    out.group.add(box(sw - 0.3, 0.9, 0.8, matOf(plankTex()), sx, 0.45, front * (d / 2 - 0.5), 2)) // counter
    for (let i = 0; i < 4; i++) out.group.add(box(0.36, 0.22, 0.32, colorMat(goods[(k * 2 + i) % goods.length]), sx - sw / 2 + 0.45 + i * (sw - 0.9) / 3, 1.0, front * (d / 2 - 0.5)))
    for (const px of [-1, 1]) for (const pz of [-1, 1]) out.group.add(box(0.1, 2.4, 0.1, colorMat(PAL.wood[2]), sx + px * (sw / 2 - 0.2), 1.2, pz * (d / 2 - 0.2)))
    const aw = box(sw - 0.1, 0.06, d + 0.4, matOf(stripeTex(...stripes[k % 3])), sx, 2.55, 0, 0.5)
    aw.rotation.x = front * 0.22
    out.group.add(aw)
    out.group.add(box(0.6, 0.5, 0.6, matOf(plankTex(PAL.wood[0])), sx + sw * 0.25, 0.25, -front * (d / 2 - 0.6), 2)) // stock crate behind
  }
  return out
}

/** Monumental 3D Dungeon gate & sanctuary tailored to each of the 4 biomes. */
function buildDungeon(b: BuildingDef, out: Built, groundY: number): Built {
  out.group.position.set(b.x, groundY, b.z)
  const inner = new THREE.Group()
  inner.rotation.y = b.rot
  out.group.add(inner)

  const biome = b.biomeRegion ?? 'lush'
  const stoneColor =
    biome === 'snow' ? '#9cb8d2' :
    biome === 'ash' ? '#3d3538' :
    biome === 'sand' ? '#d9aa63' : '#6c7c68'
  const accentColor =
    biome === 'snow' ? '#58d8ff' :
    biome === 'ash' ? '#ff5e1f' :
    biome === 'sand' ? '#f5b82e' : '#3ee07a'
  const darkStone = matOf(stoneTex(shade(stoneColor, -0.25)))
  const mainStone = matOf(stoneTex(stoneColor))
  const glowMat = new THREE.MeshBasicMaterial({ color: accentColor })

  // 1. Stepped monumental foundation platform
  inner.add(box(b.w, 0.45, b.d, darkStone, 0, 0.225, 0, 2))
  inner.add(box(b.w - 1.2, 0.45, b.d - 1.2, mainStone, 0, 0.675, 0, 2))

  // Front entrance steps (+z in local space)
  for (let s = 0; s < 3; s++) {
    inner.add(box(3.8 - s * 0.3, 0.28, 0.6, darkStone, 0, 0.14 + s * 0.26, b.d / 2 + 0.4 - s * 0.35, 2))
  }

  // 2. Biome-specific primary superstructure
  if (biome === 'sand') {
    // Stepped Sunken Pyramid tiers
    for (let t = 0; t < 4; t++) {
      const sz = b.w - 1.8 - t * 1.65
      inner.add(box(sz, 1.15, sz, mainStone, 0, 1.45 + t * 1.1, -0.4, 2))
    }
    // Golden capstone
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 4), colorMat('#e8b438'))
    cap.rotation.y = Math.PI / 4; cap.position.set(0, 6.2, -0.4); cap.castShadow = true
    inner.add(cap)
  } else if (biome === 'snow') {
    // Glacial fortress keep + jagged crystal spires
    inner.add(box(b.w - 2.4, 3.8, b.d - 2.8, mainStone, 0, 2.8, -0.5, 2))
    const spireMat = new THREE.MeshLambertMaterial({ color: '#a8e4ff', emissive: '#1b4d6e', flatShading: true })
    for (const [sx, sz, h, r, tilt] of [
      [-2.8, -1.2, 5.2, 1.1, -0.18],
      [2.8, -1.2, 5.2, 1.1, 0.18],
      [0, -1.6, 6.6, 1.4, 0],
      [-1.8, 1.2, 3.8, 0.85, -0.22],
      [1.8, 1.2, 3.8, 0.85, 0.22],
    ] as const) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), spireMat)
      sp.position.set(sx, 1.2 + h / 2, sz); sp.rotation.z = tilt; sp.castShadow = true
      inner.add(sp)
    }
  } else if (biome === 'ash') {
    // Obsidian Bastion + twin volcanic horns + lava core
    inner.add(box(b.w - 2.2, 4.4, b.d - 2.6, darkStone, 0, 3.1, -0.5, 2))
    inner.add(box(b.w - 3.4, 1.4, b.d - 3.6, mainStone, 0, 5.8, -0.5, 2))
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.6, 5), darkStone)
      horn.position.set(sx * 3.1, 5.8, -0.4); horn.rotation.z = -sx * 0.25; horn.castShadow = true
      inner.add(horn)
    }
  } else {
    // Ancient Overgrown Temple Ruins + fluted columns + mossy canopy
    inner.add(box(b.w - 2.4, 3.6, b.d - 2.8, mainStone, 0, 2.7, -0.6, 2))
    const mossMat = colorMat('#357a3e')
    inner.add(box(b.w - 1.8, 0.65, b.d - 2.2, mossMat, 0, 4.7, -0.6))
    for (const sx of [-3.2, 3.2]) {
      for (const sz of [-2.4, 2.2]) {
        const col = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(0.48, 0.55, 3.8, 8), 2), darkStone)
        col.position.set(sx, 2.8, sz); col.castShadow = true
        inner.add(col)
      }
    }
  }

  // 3. Grand Portal Archway & Glowing Magical Core on the front (+z) face
  const pz = b.d / 2 - 1.15
  for (const sx of [-1.45, 1.45]) {
    inner.add(box(0.85, 3.4, 0.95, darkStone, sx, 2.6, pz, 2))
  }
  inner.add(box(3.9, 0.85, 1.1, darkStone, 0, 4.45, pz, 2))
  // Glowing portal plane
  inner.add(box(2.05, 3.0, 0.35, glowMat, 0, 2.4, pz - 0.1))

  // 4. Twin Braziers flanking the stairs
  for (const sx of [-2.6, 2.6]) {
    inner.add(box(0.7, 1.4, 0.7, darkStone, sx, 1.5, b.d / 2 - 0.3, 2))
    inner.add(box(0.5, 0.25, 0.5, glowMat, sx, 2.28, b.d / 2 - 0.3))
  }

  // World-space glow & smoke points
  const c = Math.cos(b.rot), s = Math.sin(b.rot)
  const toW = (lx: number, ly: number, lz: number) =>
    new THREE.Vector3(b.x + lx * c + lz * s, groundY + ly, b.z - lx * s + lz * c)
  out.lights.push(toW(-2.6, 2.5, b.d / 2 - 0.3), toW(2.6, 2.5, b.d / 2 - 0.3))
  out.fire = toW(0, 2.5, pz + 0.2)
  if (biome === 'ash') out.chimneys.push(toW(0, 6.8, -0.5))

  return out
}
