// Trees, rocks, lamps, decorations, farm fence, crops, sparse birds, and large 3D mountain monsters.
import * as THREE from 'three'
import { BUILDINGS, solidBoxes } from '../game/map'
import type { MountainMonster } from '../game/biomes'
import { LAMPS, ROCKS, TREES, type Decor } from '../game/scenery'
import { height } from '../game/terrain'
import { PAL } from '../pixel/paint'
import { barkTex, colorMat, flowerBedTex, leafTex, matOf, paperTex, plankTex, stoneTex, worldUV } from './tex'

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler()
const set = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s: number | [number, number, number], ry = 0) => {
  Q.setFromEuler(E.set(0, ry, 0)); S.set(...(typeof s === 'number' ? [s, s, s] as const : s)); P.set(x, y, z)
  im.setMatrixAt(i, M.compose(P, Q, S))
}
const inst = (g: THREE.BufferGeometry, m: THREE.Material, n: number) => { const im = new THREE.InstancedMesh(g, m, Math.max(1, n)); im.count = n; im.castShadow = true; im.receiveShadow = true; return im }

/** All trees across the island, with distinct species for each biome! `hide(i)` hides a felled tree. */
export function trees() {
  const oaks = TREES.map((t, i) => ({ t, i })).filter((o) => o.t.kind === 0)
  const pines = TREES.map((t, i) => ({ t, i })).filter((o) => o.t.kind === 1)
  const snowPines = TREES.map((t, i) => ({ t, i })).filter((o) => o.t.kind === 2)
  const cacti = TREES.map((t, i) => ({ t, i })).filter((o) => o.t.kind === 3)
  const ashTrees = TREES.map((t, i) => ({ t, i })).filter((o) => o.t.kind === 4)
  const lushTrees = TREES.map((t, i) => ({ t, i })).filter((o) => o.t.kind === 5)

  const trunkG = worldUV(new THREE.CylinderGeometry(0.2, 0.3, 1.8, 6), 1)
  const barkM = matOf(barkTex())
  const darkBarkM = colorMat('#2c2220')
  const cactusM = new THREE.MeshLambertMaterial({ color: '#4d9a46', flatShading: true })
  const cactusFlowerM = new THREE.MeshLambertMaterial({ color: '#f26440', flatShading: true })

  // 0. Meadow Oaks + 5. Lush Ancient Emerald Trees
  const oakTrunk = inst(trunkG, barkM, oaks.length)
  const lushTrunk = inst(trunkG, barkM, lushTrees.length)
  const crownG = new THREE.IcosahedronGeometry(1, 0)
  const leaves = new THREE.MeshLambertMaterial({ map: leafTex(PAL.leaf[0], PAL.leaf[1], PAL.leaf[2]), flatShading: true })
  const lushLeaves = new THREE.MeshLambertMaterial({ map: leafTex('#247a4d', '#319b64', '#48bd7e'), flatShading: true })
  const CLUMPS: [number, number, number, number][] = [[0, 2.5, 0, 1.25], [-0.75, 2.05, 0.3, 0.95], [0.75, 2.1, 0.2, 0.95], [0.1, 2.0, -0.7, 0.9], [0.05, 3.15, 0.05, 0.8]]
  const crowns = inst(crownG, leaves, oaks.length * CLUMPS.length)
  crowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, oaks.length * CLUMPS.length) * 3), 3)
  const lushCrowns = inst(crownG, lushLeaves, lushTrees.length * CLUMPS.length)
  lushCrowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, lushTrees.length * CLUMPS.length) * 3), 3)

  // 1. Evergreen Pines
  const pineTrunk = inst(trunkG, barkM, pines.length)
  const pineM = new THREE.MeshLambertMaterial({ map: leafTex(PAL.pine[0], PAL.pine[1], PAL.pine[2]), flatShading: true })
  const TIERS: [number, number, number][] = [[1.9, 1.45, 1.6], [2.8, 1.1, 1.4], [3.6, 0.75, 1.2]]
  const cones = inst(new THREE.ConeGeometry(1, 1, 7), pineM, pines.length * TIERS.length)

  // 2. Snow-Capped Frost Pines (Snow Biome)
  const snowTrunk = inst(trunkG, darkBarkM, snowPines.length)
  const snowPineM = new THREE.MeshLambertMaterial({ map: leafTex('#6b95b0', '#b8d4e8', '#eef6fc'), flatShading: true })
  const snowCones = inst(new THREE.ConeGeometry(1, 1, 7), snowPineM, snowPines.length * TIERS.length)
  snowCones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, snowPines.length * TIERS.length) * 3), 3)

  // 3. Desert Saguaro Cacti (Sand Biome)
  const cactusStemG = new THREE.CylinderGeometry(0.24, 0.28, 2.7, 7)
  const cactusArmG = new THREE.BoxGeometry(0.95, 0.26, 0.26)
  const cactusTopG = new THREE.DodecahedronGeometry(0.2, 0)
  const cactusStems = inst(cactusStemG, cactusM, cacti.length)
  const cactusArms = inst(cactusArmG, cactusM, cacti.length)
  const cactusFlowers = inst(cactusTopG, cactusFlowerM, cacti.length)

  // 4. Charred Volcano Ember Trees (Ash Biome)
  const ashTrunk = inst(trunkG, darkBarkM, ashTrees.length)
  const ashCrownM = new THREE.MeshLambertMaterial({ map: leafTex('#382826', '#5c3428', '#d95326'), flatShading: true })
  const ASH_CLUMPS: [number, number, number, number][] = [[0, 2.3, 0, 0.95], [-0.6, 1.95, 0.25, 0.72], [0.6, 2.0, -0.2, 0.72]]
  const ashCrowns = inst(crownG, ashCrownM, ashTrees.length * ASH_CLUMPS.length)
  ashCrowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, ashTrees.length * ASH_CLUMPS.length) * 3), 3)

  const col = new THREE.Color()
  const place = (hidden: (i: number) => boolean) => {
    // 0. Meadow Oaks
    oaks.forEach(({ t, i }, k) => {
      const s = hidden(i) ? 0 : t.s, gy = Math.max(0, height(t.x, t.z))
      set(oakTrunk, k, t.x, gy + 0.9 * s, t.z, s)
      CLUMPS.forEach(([dx, dy, dz, r], c) => {
        set(crowns, k * CLUMPS.length + c, t.x + dx * s, gy + dy * s, t.z + dz * s, r * s * (1 + ((i * 7 + c) % 5) * 0.04), i + c)
        crowns.setColorAt(k * CLUMPS.length + c, col.setHSL(0.27 + ((i % 7) - 3) * 0.008, 0.45, c === 4 ? 0.62 : 0.5))
      })
    })
    // 1. Evergreen Pines
    pines.forEach(({ t, i }, k) => {
      const s = hidden(i) ? 0 : t.s, gy = Math.max(0, height(t.x, t.z))
      set(pineTrunk, k, t.x, gy + 0.9 * s, t.z, [s * 0.8, s, s * 0.8])
      TIERS.forEach(([y, r, h], c) => set(cones, k * TIERS.length + c, t.x, gy + y * s, t.z, [r * s, h * s, r * s], i))
    })
    // 2. Snow-Capped Frost Pines
    snowPines.forEach(({ t, i }, k) => {
      const s = hidden(i) ? 0 : t.s, gy = Math.max(0, height(t.x, t.z))
      set(snowTrunk, k, t.x, gy + 0.9 * s, t.z, [s * 0.8, s, s * 0.8])
      TIERS.forEach(([y, r, h], c) => {
        set(snowCones, k * TIERS.length + c, t.x, gy + y * s, t.z, [r * s, h * s, r * s], i)
        snowCones.setColorAt(k * TIERS.length + c, col.set(c === 2 ? '#ffffff' : c === 1 ? '#e2eef8' : '#b2cce0'))
      })
    })
    // 3. Desert Saguaro Cacti
    cacti.forEach(({ t, i }, k) => {
      const s = hidden(i) ? 0 : t.s, gy = Math.max(0, height(t.x, t.z)), ry = (i * 1.7) % (Math.PI * 2)
      set(cactusStems, k, t.x, gy + 1.3 * s, t.z, s, ry)
      set(cactusArms, k, t.x, gy + 1.55 * s, t.z, s, ry)
      set(cactusFlowers, k, t.x, gy + 2.72 * s, t.z, s, ry)
    })
    // 4. Charred Volcano Ember Trees
    ashTrees.forEach(({ t, i }, k) => {
      const s = hidden(i) ? 0 : t.s, gy = Math.max(0, height(t.x, t.z))
      set(ashTrunk, k, t.x, gy + 0.9 * s, t.z, [s * 0.85, s, s * 0.85])
      ASH_CLUMPS.forEach(([dx, dy, dz, r], c) => {
        set(ashCrowns, k * ASH_CLUMPS.length + c, t.x + dx * s, gy + dy * s, t.z + dz * s, r * s, i + c)
        ashCrowns.setColorAt(k * ASH_CLUMPS.length + c, col.set(c === 0 ? '#e06236' : '#6e3f36'))
      })
    })
    // 5. Lush Ancient Emerald Canopy Trees
    lushTrees.forEach(({ t, i }, k) => {
      const s = hidden(i) ? 0 : t.s * 1.15, gy = Math.max(0, height(t.x, t.z))
      set(lushTrunk, k, t.x, gy + 0.9 * s, t.z, [s * 1.1, s, s * 1.1])
      CLUMPS.forEach(([dx, dy, dz, r], c) => {
        set(lushCrowns, k * CLUMPS.length + c, t.x + dx * s, gy + dy * s, t.z + dz * s, r * s * 1.08, i + c)
        lushCrowns.setColorAt(k * CLUMPS.length + c, col.setHSL(0.39 + ((i % 5) - 2) * 0.01, 0.55, c === 4 ? 0.58 : 0.46))
      })
    })

    for (const im of [
      oakTrunk, crowns, pineTrunk, cones,
      snowTrunk, snowCones, cactusStems, cactusArms, cactusFlowers,
      ashTrunk, ashCrowns, lushTrunk, lushCrowns,
    ]) {
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
    }
  }
  const g = new THREE.Group()
  g.add(
    oakTrunk, crowns, pineTrunk, cones,
    snowTrunk, snowCones, cactusStems, cactusArms, cactusFlowers,
    ashTrunk, ashCrowns, lushTrunk, lushCrowns,
  )
  return { group: g, place }
}

export function rocks() {
  const im = inst(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ map: stoneTex(), flatShading: true }), ROCKS.length)
  ROCKS.forEach((r, i) => set(im, i, r.x, Math.max(0, height(r.x, r.z)) + r.s * 0.2, r.z, [r.s * 1.2, r.s * 0.7, r.s], r.ry))
  return im
}

/** Street lamps: iron post, arm and a lantern whose glass glows at night (`lanterns` material). */
export function lamps() {
  const g = new THREE.Group(), iron = colorMat('#2f323a')
  const post = inst(new THREE.BoxGeometry(0.14, 2.6, 0.14), iron, LAMPS.length)
  const cap = inst(new THREE.BoxGeometry(0.42, 0.1, 0.42), iron, LAMPS.length)
  const glassM = new THREE.MeshLambertMaterial({ color: '#f4d35e', emissive: '#000000' })
  const glass = inst(new THREE.BoxGeometry(0.3, 0.36, 0.3), glassM, LAMPS.length)
  const foot = inst(new THREE.BoxGeometry(0.3, 0.2, 0.3), iron, LAMPS.length)
  LAMPS.forEach(([x, z], i) => { set(post, i, x, 1.3, z, 1); set(foot, i, x, 0.1, z, 1); set(glass, i, x, 2.78, z, 1); set(cap, i, x, 3.0, z, 1) })
  g.add(post, cap, glass, foot)
  return { group: g, glass: glassM, points: LAMPS.map(([x, z]) => new THREE.Vector3(x, 2.8, z)) }
}

/** The farm fence (posts + two rails along each fence collision box) and rows of crops inside. */
export function farm() {
  const g = new THREE.Group(), wood = matOf(plankTex(PAL.wood[1]))
  for (const b of BUILDINGS.filter((q) => q.kind === 'farm')) {
    const boxes = solidBoxes(b).slice(0, 5)
    for (const f of boxes) {
      const long = f.maxX - f.minX > f.maxZ - f.minZ, len = long ? f.maxX - f.minX : f.maxZ - f.minZ, cx = (f.minX + f.maxX) / 2, cz = (f.minZ + f.maxZ) / 2
      for (const y of [0.45, 0.85]) { const r = new THREE.Mesh(new THREE.BoxGeometry(long ? len : 0.08, 0.1, long ? 0.08 : len), wood); r.position.set(cx, y, cz); r.castShadow = true; g.add(r) }
      const n = Math.max(2, Math.round(len / 1.5))
      for (let i = 0; i <= n; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), wood); const t = -len / 2 + (len * i) / n; p.position.set(long ? cx + t : cx, 0.55, long ? cz : cz + t); p.castShadow = true; g.add(p) }
    }
    // crops: little leafy cones in rows over the field (not over the barn)
    const barn = solidBoxes(b)[5], x0 = b.x - b.w / 2 + 0.8, x1 = b.x + b.w / 2 - 0.8, z0 = b.z - b.d / 2 + 0.8, z1 = b.z + b.d / 2 - 0.8
    const spots: [number, number][] = []
    for (let z = z0; z < z1; z += 1) for (let x = x0; x < x1; x += 0.7) if (!(x > barn.minX - 0.5 && x < barn.maxX + 0.5 && z > barn.minZ - 0.5 && z < barn.maxZ + 0.5) && Math.abs(x - b.x) > 1.3) spots.push([x, z])
    const crop = inst(new THREE.ConeGeometry(0.22, 0.6, 5), new THREE.MeshLambertMaterial({ color: '#7fb04a', flatShading: true }), spots.length)
    spots.forEach(([x, z], i) => set(crop, i, x, 0.3, z, 1 + ((i * 7) % 5) * 0.08, i))
    g.add(crop)
  }
  return g
}

/** One decoration (bench, well, cart, notice board, planter, bush, stump, barrels, crates, sacks). */
export function decor(d: Decor, seed: number) {
  const g = new THREE.Group(), wood = matOf(plankTex()), dark = colorMat(PAL.wood[2])
  const add = (geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, rx = 0, rz = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, 0, rz); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh }
  const B = (w: number, h: number, dd: number) => worldUV(new THREE.BoxGeometry(w, h, dd), 2)
  const leaves = new THREE.MeshLambertMaterial({ map: leafTex(PAL.leaf[0], PAL.leaf[1], PAL.leaf[2]), flatShading: true })
  switch (d.kind) {
    case 'bench': { // built facing +z, then turned by d.rot
      const L = Math.max(d.w, d.d)
      add(B(L, 0.08, 0.42), wood, 0, 0.45, 0); add(B(L, 0.36, 0.06), wood, 0, 0.72, -0.2)
      for (const sx of [-1, 1]) add(B(0.08, 0.45, 0.4), dark, sx * (L / 2 - 0.12), 0.22, 0)
      break
    }
    case 'well': {
      const ring = add(worldUV(new THREE.CylinderGeometry(0.75, 0.8, 0.75, 10, 1, true), 2), new THREE.MeshLambertMaterial({ map: stoneTex(), side: THREE.DoubleSide }), 0, 0.37, 0)
      ring.castShadow = true
      add(new THREE.CircleGeometry(0.72, 10), colorMat('#1d3a5a'), 0, 0.5, 0, -Math.PI / 2)
      for (const sx of [-1, 1]) add(B(0.12, 1.8, 0.12), dark, sx * 0.7, 0.9, 0)
      for (const s of [-1, 1]) { const r = add(B(1.9, 0.08, 0.75), new THREE.MeshLambertMaterial({ color: '#9c3d3d' }), 0, 1.95, s * 0.27); r.rotation.x = s * 0.6 }
      add(B(1.4, 0.08, 0.08), dark, 0, 1.6, 0); add(B(0.25, 0.25, 0.25), wood, 0, 1.1, 0)
      break
    }
    case 'cart':
      add(B(d.w - 0.3, 0.35, d.d), wood, 0, 0.6, 0)
      for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 8), dark, sx * 0.55, 0.38, d.d / 2 + 0.06, Math.PI / 2)
      for (let i = 0; i < 5; i++) add(new THREE.IcosahedronGeometry(0.18, 0), colorMat(['#e8b04a', '#7fb04a', '#c94f4f'][i % 3]), -0.6 + i * 0.3, 0.9, (i % 2) * 0.2 - 0.1)
      add(B(0.9, 0.06, 0.06), dark, d.w / 2, 0.6, 0)
      break
    case 'board':
      for (const sx of [-1, 1]) add(B(0.1, 1.8, 0.1), dark, sx * (d.w / 2 - 0.1), 0.9, 0)
      add(new THREE.BoxGeometry(d.w, 0.8, 0.08), [dark, dark, dark, dark, matOf(paperTex()), dark], 0, 1.25, 0)
      break
    case 'planter':
      add(B(d.w, 0.4, d.d), wood, 0, 0.2, 0)
      add(new THREE.BoxGeometry(d.w - 0.1, 0.22, d.d - 0.1), [leaves, leaves, matOf(flowerBedTex()), leaves, leaves, leaves], 0, 0.48, 0)
      break
    case 'bush': {
      const s = 0.55 + (seed % 5) * 0.06
      add(new THREE.IcosahedronGeometry(s, 0), leaves, 0, s * 0.7, 0).scale.set(1.15, 0.85, 1)
      if (seed % 2) add(new THREE.IcosahedronGeometry(s * 0.7, 0), leaves, s * 0.5, s * 0.55, s * 0.2)
      break
    }
    case 'stump':
      add(worldUV(new THREE.CylinderGeometry(0.3, 0.36, 0.4, 7), 1), matOf(barkTex()), 0, 0.2, 0)
      add(new THREE.CircleGeometry(0.29, 7), colorMat('#c9a46a'), 0, 0.41, 0, -Math.PI / 2)
      break
    case 'barrels': for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 8), wood, sx * 0.3, 0.4, 0); add(new THREE.CylinderGeometry(0.29, 0.29, 0.05, 8), colorMat('#3a3d44'), sx * 0.3, 0.6, 0) } break
    case 'crates': add(B(0.55, 0.55, 0.55), matOf(plankTex(PAL.wood[0])), -0.3, 0.27, 0); add(B(0.5, 0.5, 0.5), matOf(plankTex(PAL.wood[0])), 0.3, 0.25, 0.05); add(B(0.45, 0.45, 0.45), matOf(plankTex(PAL.wood[0])), -0.25, 0.77, 0) ; break
    case 'sacks': for (let i = 0; i < 3; i++) add(new THREE.IcosahedronGeometry(0.26, 0), colorMat(i % 2 ? '#e8dcc8' : '#d6c49a'), -0.3 + i * 0.3, 0.22, (i % 2) * 0.15).scale.set(1, 1.2, 1); break
  }
  g.position.set(d.x, Math.max(0, height(d.x, d.z)), d.z)
  g.rotation.y = d.rot
  return g
}

/** Sparse, natural 3D birds flying across the sky (only 2 widely spaced birds over the main village). */
export function birds() {
  const group = new THREE.Group()
  const CENTERS: [number, number, number, string, string, number][] = [
    // [cx, cz, radius, bodyColor, wingColor, count]
    [0, 0, 68, '#4a7cc2', '#345e9e', 2],         // Only 2 widely-spaced birds over the main village
    [-102, -96, 36, '#f4f6f8', '#cfd8e2', 2],    // Danau Cermin gulls
    [-274, -10, 44, '#eef4fa', '#b8cde0', 2],    // West snow owls
    [281, 10, 44, '#c84b31', '#5a2620', 2],      // East volcano hawks
    [-6, 284, 44, '#d99b38', '#8c5820', 2],      // South desert falcons
    [-6, -278, 44, '#48a860', '#2b753e', 3],     // North lush songbirds
  ]

  interface BirdItem {
    root: THREE.Group
    wingL: THREE.Group
    wingR: THREE.Group
    cx: number
    cz: number
    rx: number
    rz: number
    baseY: number
    speed: number
    phase: number
    flapSpeed: number
    fig8: boolean
  }

  const list: BirdItem[] = []
  const bodyGeo = new THREE.BoxGeometry(0.22, 0.16, 0.48)
  const headGeo = new THREE.BoxGeometry(0.18, 0.16, 0.2)
  const beakGeo = new THREE.ConeGeometry(0.06, 0.16, 4).rotateX(Math.PI / 2)
  const tailGeo = new THREE.BoxGeometry(0.26, 0.05, 0.22)
  const wingGeo = new THREE.BoxGeometry(0.52, 0.04, 0.26)
  const beakMat = colorMat('#f0a830')

  for (let c = 0; c < CENTERS.length; c++) {
    const [cx, cz, rad, col1, col2, count] = CENTERS[c]
    const bMat = colorMat(col1), wMat = colorMat(col2)
    for (let k = 0; k < count; k++) {
      const root = new THREE.Group()
      const body = new THREE.Mesh(bodyGeo, bMat); body.castShadow = true
      const head = new THREE.Mesh(headGeo, bMat); head.position.set(0, 0.08, 0.26)
      const beak = new THREE.Mesh(beakGeo, beakMat); beak.position.set(0, 0.07, 0.41)
      const tail = new THREE.Mesh(tailGeo, wMat); tail.position.set(0, 0.03, -0.3); tail.rotation.x = 0.2

      const wingL = new THREE.Group(); wingL.position.set(-0.1, 0.05, 0.02)
      const wMeshL = new THREE.Mesh(wingGeo, wMat); wMeshL.position.set(-0.26, 0, 0); wMeshL.castShadow = true
      wingL.add(wMeshL)

      const wingR = new THREE.Group(); wingR.position.set(0.1, 0.05, 0.02)
      const wMeshR = new THREE.Mesh(wingGeo, wMat); wMeshR.position.set(0.26, 0, 0); wMeshR.castShadow = true
      wingR.add(wMeshR)

      root.add(body, head, beak, tail, wingL, wingR)
      const s = 0.9 + ((c + k) % 3) * 0.1
      root.scale.setScalar(s)
      group.add(root)

      list.push({
        root, wingL, wingR,
        cx: cx + (k - 0.5) * 18,
        cz: cz + (k - 0.5) * 14,
        rx: rad * (0.85 + k * 0.22),
        rz: rad * (0.75 + k * 0.2),
        baseY: 12 + (k % 3) * 2.5,
        speed: (0.14 + (k % 2) * 0.04) * (k % 2 === 0 ? 1 : -1),
        phase: k * Math.PI + c * 1.1,
        flapSpeed: 7.5 + (k % 3) * 1.2,
        fig8: k % 2 === 1,
      })
    }
  }

  let elapsed = 0
  const update = (dt: number) => {
    elapsed += dt
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      const a = elapsed * b.speed + b.phase
      const x = b.cx + Math.cos(a) * b.rx
      const z = b.cz + (b.fig8 ? Math.sin(a * 2) * (b.rz * 0.65) : Math.sin(a) * b.rz)
      const vx = -Math.sin(a) * b.rx * b.speed
      const vz = b.fig8 ? Math.cos(a * 2) * 2 * (b.rz * 0.65) * b.speed : Math.cos(a) * b.rz * b.speed
      const groundY = Math.max(0, height(x, z))
      const y = groundY + b.baseY + Math.sin(elapsed * 1.4 + b.phase) * 1.1

      b.root.position.set(x, y, z)
      b.root.rotation.y = Math.atan2(vx, vz)
      b.root.rotation.z = -Math.sin(a) * 0.16

      const glide = Math.sin(elapsed * 1.1 + b.phase) > 0.55
      const flap = glide ? 0.1 : Math.sin(elapsed * b.flapSpeed + b.phase * 3) * 0.58
      b.wingL.rotation.z = -flap
      b.wingR.rotation.z = flap
    }
  }

  return { group, update }
}

export interface MonsterMeshHandle {
  root: THREE.Group
  body: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  animate: (time: number, walking: boolean, hitFlash: boolean, attacking?: boolean) => void
}

/**
 * Build a 3D voxel/pixel-styled Monster mesh matched to its species and biome.
 * Supports low-level Slime, Goblin, and Dire Wolf as well as giant Mountain Monsters.
 */
export function buildMonsterMesh(mon: MountainMonster): MonsterMeshHandle {
  const root = new THREE.Group()
  const body = new THREE.Group()
  const armL = new THREE.Group()
  const armR = new THREE.Group()
  root.add(body)

  const palettes: Record<MountainMonster['species'], { main: string; sec: string; accent: string; eye: string }> = {
    slime:          mon.biome === 'snow'
      ? { main: '#55b8f0', sec: '#2e8bc0', accent: '#a8e6ff', eye: '#142838' }
      : mon.biome === 'sand'
        ? { main: '#f0b840', sec: '#c88c24', accent: '#ffe694', eye: '#2e1c0c' }
        : { main: '#4cd660', sec: '#2ea042', accent: '#9effa8', eye: '#142e18' },
    goblin:         mon.biome === 'ash'
      ? { main: '#6e524a', sec: '#3d2822', accent: '#e05a2b', eye: '#ffba26' }
      : mon.biome === 'sand'
        ? { main: '#829442', sec: '#6b4c28', accent: '#d99b26', eye: '#ffe042' }
        : { main: '#4f9c42', sec: '#5c4028', accent: '#b8392f', eye: '#ffeb3b' },
    dire_wolf:      mon.biome === 'snow'
      ? { main: '#d8e4f0', sec: '#8aa2b8', accent: '#48c8ff', eye: '#38e8ff' }
      : { main: '#4a4642', sec: '#2b2826', accent: '#8c6239', eye: '#ff5238' },
    yeti:           { main: '#eef4fa', sec: '#9ec2dc', accent: '#5a8cb3', eye: '#38e8ff' },
    ice_golem:      { main: '#7bb8de', sec: '#bde4fa', accent: '#3d769e', eye: '#52ffff' },
    magma_brute:    { main: '#33292a', sec: '#59342e', accent: '#ff5e1f', eye: '#ffba26' },
    pyro_drake:     { main: '#a82e24', sec: '#3d2624', accent: '#ff7b24', eye: '#ffe042' },
    sand_colossus:  { main: '#d6a862', sec: '#b07d3e', accent: '#f5c842', eye: '#ffae19' },
    scorpion:       { main: '#c48334', sec: '#6e4219', accent: '#f0c246', eye: '#ff3b2f' },
    moss_treant:    { main: '#5c4028', sec: '#2d7a46', accent: '#52c46e', eye: '#7aff9e' },
    forest_stalker: { main: '#2f5e3d', sec: '#4e3824', accent: '#78d65c', eye: '#b8ff47' },
  }
  const pal = palettes[mon.species]
  const mainMat = new THREE.MeshLambertMaterial({
    color: pal.main,
    flatShading: true,
    transparent: mon.species === 'slime',
    opacity: mon.species === 'slime' ? 0.88 : 1,
  })
  const secMat = new THREE.MeshLambertMaterial({ color: pal.sec, flatShading: true })
  const accMat = new THREE.MeshBasicMaterial({ color: pal.accent })
  const eyeMat = new THREE.MeshBasicMaterial({ color: pal.eye })

  // Ground shadow under the monster
  const sh = new THREE.Mesh(
    new THREE.CircleGeometry(mon.species === 'slime' ? 0.78 : 0.92, 14).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#14220f', transparent: true, opacity: 0.42, depthWrite: false }),
  )
  sh.position.y = 0.04
  root.add(sh)

  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  if (mon.species === 'slime') {
    // Chunky multi-layered gelatinous voxel Slime with inner glowing core & eyes
    box(1.18, 0.28, 1.18, secMat, 0, 0.16, 0)         // Base puddle rim
    box(1.06, 0.82, 1.06, mainMat, 0, 0.56, 0)        // Outer jelly body
    box(0.82, 0.22, 0.82, mainMat, 0, 1.02, 0)        // Top dome cap
    box(0.42, 0.42, 0.42, accMat, 0, 0.54, -0.04)     // Floating inner slime core
    // Expressive pixel eyes + little highlight
    box(0.16, 0.18, 0.08, eyeMat, -0.22, 0.64, 0.54)
    box(0.16, 0.18, 0.08, eyeMat, 0.22, 0.64, 0.54)
    box(0.22, 0.08, 0.08, eyeMat, 0, 0.42, 0.54)      // Mouth
    body.add(armL, armR)
  } else if (mon.species === 'goblin') {
    // Pointy-eared Voxel Goblin with leather vest, belt, and spiked war club
    box(0.28, 0.52, 0.3, secMat, -0.22, 0.26, 0)      // Left leg
    box(0.28, 0.52, 0.3, secMat, 0.22, 0.26, 0)       // Right leg
    box(0.76, 0.72, 0.52, mainMat, 0, 0.86, 0)        // Torso
    box(0.8, 0.52, 0.56, secMat, 0, 0.84, 0)          // Leather vest
    box(0.82, 0.14, 0.58, accMat, 0, 0.56, 0)         // Belt

    armL.position.set(-0.52, 1.08, 0)
    armR.position.set(0.52, 1.08, 0)
    box(0.24, 0.62, 0.26, mainMat, 0, -0.24, 0.04, armL)
    box(0.24, 0.62, 0.26, mainMat, 0, -0.24, 0.04, armR)
    // Heavy wooden club in right hand
    box(0.16, 0.22, 0.88, secMat, 0, -0.52, 0.42, armR)
    box(0.28, 0.28, 0.42, secMat, 0, -0.52, 0.72, armR)
    body.add(armL, armR)

    // Large goblin head, long nose, glowing yellow/red eyes, and wide pointy ears
    box(0.68, 0.58, 0.62, mainMat, 0, 1.5, 0.06)
    box(0.14, 0.16, 0.22, mainMat, 0, 1.46, 0.42)     // Goblin nose
    box(0.14, 0.12, 0.08, eyeMat, -0.18, 1.56, 0.38)
    box(0.14, 0.12, 0.08, eyeMat, 0.18, 1.56, 0.38)
    // Long sideways pointy goblin ears
    box(0.42, 0.16, 0.14, mainMat, -0.52, 1.54, 0.04).rotation.z = 0.22
    box(0.42, 0.16, 0.14, mainMat, 0.52, 1.54, 0.04).rotation.z = -0.22
    // Bandana / crest
    box(0.72, 0.14, 0.66, accMat, 0, 1.76, 0.06)
  } else if (mon.species === 'dire_wolf') {
    // Ferocious Dire Wolf beast
    box(0.24, 0.56, 0.26, secMat, -0.32, 0.28, 0.42)
    box(0.24, 0.56, 0.26, secMat, 0.32, 0.28, 0.42)
    box(0.26, 0.56, 0.28, secMat, -0.32, 0.28, -0.44)
    box(0.26, 0.56, 0.28, secMat, 0.32, 0.28, -0.44)
    box(0.82, 0.68, 1.28, mainMat, 0, 0.82, 0)        // Wolf body
    box(0.92, 0.76, 0.58, secMat, 0, 0.92, 0.36)      // Thick mane
    box(0.62, 0.56, 0.62, mainMat, 0, 1.18, 0.68)     // Wolf head
    box(0.36, 0.28, 0.44, secMat, 0, 1.08, 1.08)      // Snout
    box(0.12, 0.1, 0.08, eyeMat, -0.18, 1.26, 0.99)
    box(0.12, 0.1, 0.08, eyeMat, 0.18, 1.26, 0.99)
    box(0.16, 0.26, 0.14, secMat, -0.22, 1.52, 0.62)  // Left ear
    box(0.16, 0.26, 0.14, secMat, 0.22, 1.52, 0.62)   // Right ear
    box(0.24, 0.24, 0.68, secMat, 0, 0.88, -0.84).rotation.x = -0.35 // Tail
    body.add(armL, armR)
  } else {
    // Giant Mountain Monster (Yeti, Ice Golem, Magma Brute, Pyro Drake, Sand Colossus, Scorpion, Moss Treant, Forest Stalker)
    box(0.42, 0.75, 0.44, secMat, -0.34, 0.38, 0)
    box(0.42, 0.75, 0.44, secMat, 0.34, 0.38, 0)

    // Massive torso & chest core
    box(1.18, 1.05, 0.76, mainMat, 0, 1.2, 0)
    box(0.65, 0.48, 0.8, accMat, 0, 1.24, 0.02)

    // Broad shoulder pauldrons
    box(0.44, 0.42, 0.56, secMat, -0.78, 1.56, 0)
    box(0.44, 0.42, 0.56, secMat, 0.78, 1.56, 0)

    // Articulated giant arms
    armL.position.set(-0.82, 1.45, 0)
    armR.position.set(0.82, 1.45, 0)
    box(0.36, 0.92, 0.38, mainMat, 0, -0.38, 0.06, armL)
    box(0.42, 0.38, 0.44, secMat, 0, -0.82, 0.1, armL)
    box(0.36, 0.92, 0.38, mainMat, 0, -0.38, 0.06, armR)
    box(0.42, 0.38, 0.44, secMat, 0, -0.82, 0.1, armR)
    body.add(armL, armR)

    // Monster head + glowing eyes
    box(0.76, 0.64, 0.68, mainMat, 0, 2.02, 0.06)
    box(0.16, 0.12, 0.08, eyeMat, -0.18, 2.06, 0.41)
    box(0.16, 0.12, 0.08, eyeMat, 0.18, 2.06, 0.41)

    const coneGeo = new THREE.ConeGeometry(0.16, 0.62, 5)
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(coneGeo, secMat)
      horn.position.set(sx * 0.36, 2.48, 0.04)
      horn.rotation.z = -sx * 0.35
      horn.castShadow = true
      body.add(horn)
    }

    if (mon.species === 'pyro_drake') {
      const wingL = box(0.95, 0.65, 0.1, accMat, -0.75, 1.55, -0.42)
      wingL.rotation.y = 0.35
      const wingR = box(0.95, 0.65, 0.1, accMat, 0.75, 1.55, -0.42)
      wingR.rotation.y = -0.35
    } else if (mon.species === 'scorpion') {
      box(0.28, 0.95, 0.28, secMat, 0, 1.85, -0.55)
      box(0.32, 0.32, 0.55, accMat, 0, 2.42, -0.25)
    } else if (mon.species === 'moss_treant') {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 0), secMat)
      crown.position.set(0, 2.65, 0)
      crown.castShadow = true
      body.add(crown)
    }
  }

  root.scale.setScalar(mon.scale)

  const animate = (time: number, walking: boolean, hitFlash: boolean, attacking = false) => {
    if (mon.species === 'slime') {
      const jump = walking ? Math.abs(Math.sin(time * 7.5)) * 0.32 : Math.abs(Math.sin(time * 3.2)) * 0.1
      body.position.y = jump
      const squash = attacking ? 1.28 : 1 + Math.sin(time * (walking ? 7.5 : 3.2)) * 0.12
      body.scale.set(squash, 1 / squash, squash)
      body.position.z = attacking ? 0.35 : 0
    } else {
      const bob = walking ? Math.abs(Math.sin(time * 6.5)) * 0.14 : Math.sin(time * 2.4) * 0.06
      body.position.y = bob
      body.position.z = attacking ? 0.32 : 0
      const swing = attacking ? -1.15 : walking ? Math.sin(time * 6.5) * 0.55 : Math.sin(time * 2.2) * 0.15
      armL.rotation.x = swing
      armR.rotation.x = attacking ? -1.25 : -swing
    }
    mainMat.emissive.set(hitFlash ? '#ff3b2f' : '#000000')
    secMat.emissive.set(hitFlash ? '#ff3b2f' : '#000000')
  }

  return { root, body, armL, armR, animate }
}
