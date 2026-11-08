// The island beyond the town: one terrain mesh shaped by game/terrain.ts (mountains, rolling hills, winding river,
// natural lakes, coast) and coloured by biome and height, with a pixel speckle texture on top, plus water meshes for
// the winding river and lakes and wooden bridges across the river.
import * as THREE from 'three'
import { TOWN_HALF, WORLD_HALF } from '../game/map'
import { BRIDGES, CRATER, LAKES, MOUNTAINS, biome, coastDist, height, lakeNormDist, riverCenterX, riverHalfWidth } from '../game/terrain'
import { PAL, canvas, rect, rnd } from '../pixel/paint'
import { colorMat, matOf, plankTex, tex, worldUV } from './tex'

const C = (h: string) => new THREE.Color(h)
const COL = {
  grass: C('#6aac52'), grass2: C('#5c9c48'), lush: C('#3f8a3a'), lush2: C('#33752f'), snow: C('#eef3f8'), snow2: C('#d6e2ec'),
  sand: C('#e2c98a'), sand2: C('#d9b673'), ash: C('#5c524c'), ash2: C('#4a423e'), beach: C('#e8d79a'), wet: C('#c8b27a'),
  rock: C('#8a8d92'), iceRock: C('#9fb0c0'), sandstone: [C('#d9a35e'), C('#c98a4b'), C('#e2b878')], basalt: C('#3a3236'), rim: C('#7a3a2a'), mossRock: C('#7a7d6a'),
}

/** A light pixel speckle, multiplied by the vertex colours so every biome keeps the same pixel grain. */
function speckle() {
  const [cv, x] = canvas(32, 32), r = rnd(23)
  rect(x, 0, 0, 32, 32, '#f4f4f4')
  for (let k = 0; k < 120; k++) rect(x, Math.floor(r() * 31), Math.floor(r() * 31), 2, 1, r() < 0.6 ? '#dcdcdc' : '#ffffff')
  for (let k = 0; k < 30; k++) rect(x, Math.floor(r() * 32), Math.floor(r() * 32), 1, 1, '#c4c4c4')
  return tex(cv, true)
}

function colorAt(x: number, z: number, h: number, out: THREE.Color) {
  const n = (Math.sin(x * 0.9) * Math.cos(z * 0.8) + 1) / 2 > 0.6 // little two-tone patches
  const coast = coastDist(x, z)
  if (h < -0.15) return out.copy(COL.wet)
  if (coast < 8) return out.copy(COL.beach)
  const rDist = Math.abs(x - riverCenterX(z)), rHalf = riverHalfWidth(z)
  if (rDist < rHalf + 1.8) return out.copy(COL.beach)
  const lkD = lakeNormDist(x, z)
  if (lkD < 1.22) return out.copy(lkD < 1.0 ? COL.wet : COL.beach)

  const m = MOUNTAINS.find((q) => Math.hypot(x - q.x, z - q.z) < q.r)
  if (m && h > 1.8) {
    if (m.kind === 'ice') return out.copy(h > 10 ? (n ? COL.snow2 : COL.snow) : COL.iceRock)
    if (m.kind === 'sand') return out.copy(COL.sandstone[Math.floor(h / 2.5) % 3]) // layered sandstone
    if (m.kind === 'volcano') return out.copy(h > CRATER.y - 6 ? COL.rim : COL.basalt)
    return out.copy(h > 20 ? COL.mossRock : n ? COL.lush2 : COL.lush)
  }
  switch (biome(x, z)) {
    case 'snow': return out.copy(n ? COL.snow2 : COL.snow)
    case 'sand': return out.copy(n ? COL.sand2 : COL.sand)
    case 'ash': return out.copy(n ? COL.ash2 : COL.ash)
    case 'lush': return out.copy(n ? COL.lush2 : COL.lush)
    default: return out.copy(n ? COL.grass2 : COL.grass)
  }
}

/** Build a smooth winding ribbon mesh for the river from -WORLD_HALF to +WORLD_HALF. */
function buildWindingRiver(waterMat: THREE.Material) {
  const segs = 220, zSpan = (WORLD_HALF - 12) * 2
  const geo = new THREE.PlaneGeometry(1, zSpan, 1, segs).rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i)
    const side = pos.getX(i) < 0 ? -1 : 1
    const cx = riverCenterX(z), hw = riverHalfWidth(z)
    pos.setX(i, cx + side * hw)
    pos.setY(i, 0.025)
  }
  geo.computeVertexNormals()
  worldUV(geo, 2)
  const mesh = new THREE.Mesh(geo, waterMat)
  mesh.receiveShadow = true
  return mesh
}

/** Build organic lake water meshes + shoreline rocks/reeds for each natural lake. */
function buildLakes(waterMat: THREE.Material) {
  const g = new THREE.Group()
  for (const lk of LAKES) {
    const segs = 40
    const geo = new THREE.CircleGeometry(1, segs).rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    for (let i = 1; i < pos.count; i++) {
      const ux = pos.getX(i), uz = pos.getZ(i)
      const a = Math.atan2(uz, ux)
      const wob = 1 - (Math.sin(a * 5 + lk.x * 0.1) * 0.08 + Math.cos(a * 3 - lk.z * 0.1) * 0.06)
      pos.setX(i, ux * lk.rx * wob)
      pos.setZ(i, uz * lk.rz * wob)
    }
    geo.computeVertexNormals()
    worldUV(geo, 2)
    const mesh = new THREE.Mesh(geo, waterMat)
    mesh.position.set(lk.x, 0.02, lk.z)
    mesh.receiveShadow = true
    g.add(mesh)
  }
  return g
}

/** Build 3D wooden bridges across the river so the player can cross cleanly into the eastern biomes. */
function buildBridges() {
  const g = new THREE.Group()
  const plank = matOf(plankTex(PAL.wood[1], false))
  const postMat = colorMat(PAL.wood[2])
  const railMat = matOf(plankTex(PAL.wood[0], true))

  for (const b of BRIDGES) {
    const cx = riverCenterX(b.z), span = riverHalfWidth(b.z) * 2 + 3.4, w = b.w
    const bg = new THREE.Group()
    bg.position.set(cx, 0, b.z)

    // Bridge deck planks + side curbs
    const deck = new THREE.Mesh(worldUV(new THREE.BoxGeometry(span, 0.18, w), 2), plank)
    deck.position.y = 0.22; deck.castShadow = true; deck.receiveShadow = true
    bg.add(deck)

    // Approaches (ramps on left & right ends)
    for (const sx of [-1, 1]) {
      const ramp = new THREE.Mesh(worldUV(new THREE.BoxGeometry(1.4, 0.14, w), 2), plank)
      ramp.position.set(sx * (span / 2 + 0.55), 0.11, 0)
      ramp.rotation.z = -sx * 0.16
      ramp.receiveShadow = true
      bg.add(ramp)
    }

    // Support pilings & side railings
    const posts = 4
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(span, 0.1, 0.12), railMat)
      rail.position.set(0, 0.92, sz * (w / 2 - 0.12))
      rail.castShadow = true
      bg.add(rail)
      for (let i = 0; i <= posts; i++) {
        const px = -span / 2 + (span * i) / posts
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.25, 0.18), postMat)
        p.position.set(px, 0.42, sz * (w / 2 - 0.12))
        p.castShadow = true
        bg.add(p)
      }
    }
    g.add(bg)
  }
  return g
}

export function buildTerrain(waterTexMap?: THREE.Texture) {
  const size = WORLD_HALF * 2 + 40, seg = 360
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2)
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    let h = height(x, z)
    if (Math.abs(x) < TOWN_HALF - 1 && Math.abs(z) < TOWN_HALF - 1) h = -0.05 // under the town's own ground
    p.setY(i, h)
    colorAt(x, z, h, c)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  worldUV(geo, 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: speckle() }))
  mesh.receiveShadow = true; mesh.castShadow = true

  // lava pool in the volcano's crater, glowing day and night
  const lava = new THREE.Mesh(new THREE.CircleGeometry(CRATER.r * 0.8, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff6a1a' }))
  lava.position.set(CRATER.x, CRATER.y - 3.6, CRATER.z)

  const g = new THREE.Group()
  g.add(mesh, lava, buildBridges())
  if (waterTexMap) {
    const waterMat = new THREE.MeshLambertMaterial({ map: waterTexMap })
    g.add(buildWindingRiver(waterMat), buildLakes(waterMat))
  }
  return { group: g, lava: lava.material as THREE.MeshBasicMaterial, crater: new THREE.Vector3(CRATER.x, CRATER.y - 2, CRATER.z) }
}
