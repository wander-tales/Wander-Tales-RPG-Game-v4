// The town in 2.5D: Three.js, orthographic camera at a fixed 3/4 angle, real 3D buildings and trees with pixel-art
// textures, characters as pixel sprite sheets standing upright in the world (real depth testing, so they walk behind
// and in front of things). Presentation only: positions come from game/live.ts (player) and game/sim.ts (residents),
// collision from game/town.ts — this file never decides where anyone is.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { BUILDINGS, TOWN_HALF, WORLD_HALF } from '../game/map'
import { height } from '../game/terrain'
import { BIOME_NPCS, MOUNTAIN_MONSTERS, attackMonster, monsterLive, stepBiomeNpc, stepMonster, type BiomeNpc, type MountainMonster } from '../game/biomes'
import { decorNow, type Decor } from '../game/scenery'
import { checkPlacement, footprint, onTownChange, town } from '../game/town'
import { movePlayer } from '../game/playerMove'
import { ROOM, roomKindOf } from '../game/interior'
import { HALL_SPOTS, hallMembers, roomOccupants, type Place, type RoomMode } from '../game/roomPeople'
import { env, input, key, player } from '../game/live'
import { stepEnv } from '../game/weather'
import { seasonOf } from '../game/calendar'
import { thunder, updateAudio } from '../game/audio'
import { useGame } from '../game/store'
import { residents, sim } from '../game/sim'
import { memberOf } from '../game/guild'
import { forgetNpc, stepNpc } from '../game/npcMove'
import { stepSim } from '../game/simClock'
import { findNearby, interact } from '../game/interact'
import { confirmPlacement, rotatePlacement } from '../game/placement'
import { roleFor } from '../npc-generator/npcGenerator'
import { npcAppearance } from '../npc-generator/npcAppearance'
import { PLAYER_KEY, loadCharacter } from '../character-creator/appearance'
import { Animator } from '../pixel/anim'
import { SHEET, buildSheet, frameRect, type SpriteLook } from '../pixel/sheet'
import { CLASS_WEAPON, fromCreator, fromSimple } from '../pixel/look'
import { paintGlow, paintGround } from '../pixel/worldArt'
import { tex, waterTex, worldUV } from './tex'
import { buildBuilding } from './buildings'
import { birds, buildMonsterMesh, decor, farm, lamps, rocks, trees, type MonsterMeshHandle } from './nature'
import { buildRoom } from './rooms'
import { Weather } from './weather'
import { buildTerrain } from './terrain3d'

// camera: fixed 3/4 view straight from the front (south), ~34° down — like a classic top-down RPG
const YAW = 0, PITCH = 0.6, DIST = 700 // far back: the whole expanded island must fit between the near and far planes
const SUN_DIR = new THREE.Vector3(26, 46, 30).normalize().multiplyScalar(900)
const RIGHT = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW)), FWD = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW))
const toCam = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH))
/** world direction → screen (right, down), for picking which way a sprite faces */
const toScreen = (dx: number, dz: number): [number, number] => [dx * RIGHT.x + dz * RIGHT.z, -(dx * FWD.x + dz * FWD.z)]

const CAPES: Record<string, string> = { Warrior: '#b8392f', Mage: '#6a4a8c', Archer: '#3f7a3a', Rogue: '#2f2a35', Healer: '#eeeeee', Paladin: '#d9b45a' }
const GM_LOOK = fromSimple({ skin: '#f1c9a5', hair: '#4a2c1c', hairStyle: 'short', shirt: '#2f4f7f', pants: '#3a2e26', height: 1 }, '#b8392f', 'sword')

// ---------- characters: an upright textured quad per character, frame picked by the shared Animator ----------
const atlas = new WeakMap<HTMLCanvasElement, THREE.Texture>()
const SPRITE_H = (SHEET.frameH / 16) / Math.cos(PITCH) // stretched so the upright quad keeps the drawn proportions on screen
const quad = new THREE.PlaneGeometry(SHEET.frameW / 16, SPRITE_H).translate(0, SPRITE_H / 2 - (SHEET.frameH - SHEET.pivot.y) / 16, 0)
const shadowGeo = new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2).scale(1, 1, 0.55)
const shadowMat = new THREE.MeshBasicMaterial({ color: '#14220f', transparent: true, opacity: 0.35, depthWrite: false })

class CharView {
  root = new THREE.Group()
  anim = new Animator()
  mat: THREE.MeshBasicMaterial
  crate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: '#a77a4c' }))
  private sheet!: HTMLCanvasElement
  private t!: THREE.Texture
  constructor(look: SpriteLook) {
    this.mat = new THREE.MeshBasicMaterial({ alphaTest: 0.5 })
    const q = new THREE.Mesh(quad, this.mat); q.rotation.y = YAW; q.castShadow = false
    const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.position.y = 0.03
    this.crate.position.y = 2.25; this.crate.visible = false
    this.root.add(sh, q, this.crate)
    this.setLook(look)
  }
  setLook(look: SpriteLook) {
    this.sheet = buildSheet(look)
    let base = atlas.get(this.sheet)
    if (!base) { base = tex(this.sheet); atlas.set(this.sheet, base) }
    this.t?.dispose()
    this.t = base.clone() // shares the uploaded image; only repeat/offset differ per character
    this.t.repeat.set(SHEET.frameW / this.sheet.width, SHEET.frameH / this.sheet.height)
    this.mat.map = this.t; this.mat.needsUpdate = true
  }
  draw(x: number, z: number, y = 0) {
    const r = frameRect(this.anim.clip, this.anim.dir, this.anim.frame)
    this.t.offset.set(r.x / this.sheet.width, 1 - (r.y + r.h) / this.sheet.height)
    this.root.position.set(x, y, z)
  }
  dispose() { this.t?.dispose(); this.mat.dispose() }
}

export function TownScene() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => run(host.current!), [])
  return <div ref={host} className="town-scene"><div className="scene-labels" /></div>
}

function run(host: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  host.prepend(renderer.domElement)
  const labelsEl = host.querySelector('.scene-labels') as HTMLDivElement

  const scene = new THREE.Scene()
  const SKY = new THREE.Color('#bfe3f2'), NIGHT = new THREE.Color('#141a35'), ROOMBG = new THREE.Color('#1c130d')
  scene.background = SKY.clone()
  scene.fog = new THREE.Fog(SKY.clone(), 700, 1000)
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 2400)
  const hemi = new THREE.HemisphereLight('#fff6e0', '#6f9a58', 1.6)
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 2200 })
  sun.shadow.bias = -0.0008
  scene.add(hemi, sun, sun.target)

  // ---- ground, winding river, natural lakes, sea ----
  const groundMat = new THREE.MeshLambertMaterial()
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(TOWN_HALF * 2, TOWN_HALF * 2).rotateX(-Math.PI / 2), groundMat) // the town's detailed ground
  ground.receiveShadow = true; ground.position.y = 0.01
  const water = waterTex().clone(); water.needsUpdate = true
  // the sea round the island, a little below the land
  const sea = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(3600, 3600).rotateX(-Math.PI / 2), 3), new THREE.MeshLambertMaterial({ map: water, color: '#9fc4e6' }))
  sea.position.y = -0.25
  const terrain = buildTerrain(water)
  const outdoors = new THREE.Group()
  outdoors.add(terrain.group, ground, sea)
  scene.add(outdoors)

  // ---- trees, rocks, lamps, farm, flying birds ----
  const forest = trees(); outdoors.add(forest.group, rocks(), farm())
  const skyBirds = birds(); outdoors.add(skyBirds.group)
  const lamp = lamps(); outdoors.add(lamp.group)
  const glowTex = tex(paintGlow())
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
  const glow = (p: THREE.Vector3, s = 2.6) => { const sp = new THREE.Sprite(glowMat); sp.position.copy(p); sp.scale.set(s, s, 1); return sp }
  const lampGlows = new THREE.Group(); lamp.points.forEach((p) => lampGlows.add(glow(p))); outdoors.add(lampGlows)
  const lavaGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: '#ff7a2a' }))
  lavaGlow.position.copy(terrain.crater).add(new THREE.Vector3(0, 3, 0)); lavaGlow.scale.set(26, 26, 1); outdoors.add(lavaGlow)

  // ---- buildings + decorations (rebuilt when the town changes) ----
  const built = new THREE.Group(), decorG = new THREE.Group(), buildingGlows = new THREE.Group()
  outdoors.add(built, decorG, buildingGlows)
  let chimneys: THREE.Vector3[] = [], groundKey = '', decorKey: Decor[] = []
  const free = (g: THREE.Object3D) => g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose() })
  const paintTown = () => {
    const key = BUILDINGS.map((b) => b.id).join()
    if (key !== groundKey) { groundKey = key; groundMat.map?.dispose(); groundMat.map = tex(paintGround()); groundMat.needsUpdate = true }
    for (const c of [...built.children]) { free(c); built.remove(c) }
    buildingGlows.clear(); chimneys = []
    for (const b of BUILDINGS) {
      const job = town.b[b.id]?.job
      const out = buildBuilding(b, job?.type === 'build' ? job.progress / job.needed : undefined)
      built.add(out.group); chimneys.push(...out.chimneys.map((c) => c.clone().add(out.group.position)))
      for (const l of out.lights) buildingGlows.add(glow(l.clone().add(out.group.position), 1.4))
      if (out.fire) buildingGlows.add(glow(out.fire, 3.4))
    }
    const dec = decorNow()
    if (dec !== decorKey) {
      decorKey = dec
      for (const c of [...decorG.children]) { free(c); decorG.remove(c) }
      dec.forEach((d, i) => decorG.add(decor(d, i * 13 + 5)))
    }
    forest.place((i) => town.cleared.has(i))
  }
  paintTown()
  const offTown = onTownChange(paintTown)
  let lastRev = useGame.getState().rev

  // ---- room (interior) ----
  let roomId: string | null = null, room: ReturnType<typeof buildRoom> | null = null
  const roomGlows = new THREE.Group(); scene.add(roomGlows)
  const occupants = new Map<string, { at: Place; mode: RoomMode }>()
  let occT = 0
  const showRoom = (id: string | null) => {
    roomId = id; occupants.clear(); occT = 0
    if (room) { free(room.group); scene.remove(room.group); room = null }
    roomGlows.clear()
    outdoors.visible = !id
    const kind = id && roomKindOf(id)
    if (!kind) return
    room = buildRoom(kind); scene.add(room.group)
    room.fires.forEach((p) => roomGlows.add(glow(p, 3)))
  }

  // ---- characters ----
  const chars = new THREE.Group(); scene.add(chars)
  const me = new CharView(GM_LOOK); chars.add(me.root)
  const refreshMyLook = () => {
    const wpn = CLASS_WEAPON[useGame.getState().playerClass] ?? 'sword'
    me.setLook({ ...GM_LOOK, weapon: wpn })
    loadCharacter(PLAYER_KEY).then((s) => s && me.setLook(fromCreator(s.appearance, wpn))).catch(() => {})
  }
  refreshMyLook()
  const label = (cls: string) => { const el = document.createElement('div'); el.className = cls; el.style.display = 'none'; labelsEl.appendChild(el); return el }
  const myName = label('nameplate gm')
  const npcs = new Map<string, { v: CharView; bubble: HTMLDivElement; name: HTMLDivElement }>()
  const ensureNpc = (id: string) => {
    let n = npcs.get(id)
    if (n) return n
    const res = residents.find((r) => r.id === id)!
    const cls = memberOf(id)?.cls, weapon = cls ? CLASS_WEAPON[cls] : undefined
    const v = new CharView(fromSimple(res.appearance, CAPES[cls ?? ''], weapon))
    npcAppearance(id, roleFor(cls ?? res.profession)).then((a) => v.setLook(fromCreator(a, weapon))).catch(() => {})
    chars.add(v.root)
    const name = label('nameplate'); name.textContent = res.name
    n = { v, bubble: label('bubble'), name }; npcs.set(id, n)
    return n
  }

  // Biome NPCs (residents of the 4 outer biomes — NOT counted as village residents)
  const biomeNpcs = new Map<string, { v: CharView; bubble: HTMLDivElement; name: HTMLDivElement }>()
  const ensureBiomeNpc = (bnpc: BiomeNpc) => {
    let n = biomeNpcs.get(bnpc.id)
    if (n) return n
    const weapon = CLASS_WEAPON[bnpc.cls]
    const v = new CharView(fromSimple(bnpc.appearance, CAPES[bnpc.cls], weapon))
    npcAppearance(bnpc.id, roleFor(bnpc.cls)).then((a) => v.setLook(fromCreator(a, weapon))).catch(() => {})
    chars.add(v.root)
    const name = label('nameplate'); name.textContent = `${bnpc.name} (${bnpc.title})`
    n = { v, bubble: label('bubble'), name }; biomeNpcs.set(bnpc.id, n)
    return n
  }

  // Mountain Monsters (large 3D monsters on each mountain biome, far from the main village)
  const monsters = new Map<string, { m: MonsterMeshHandle; name: HTMLDivElement }>()
  const ensureMonster = (mon: MountainMonster) => {
    let entry = monsters.get(mon.id)
    if (entry) return entry
    const m = buildMonsterMesh(mon)
    chars.add(m.root)
    const name = label('nameplate'); name.textContent = `👹 ${mon.name} Lv.${mon.level}`
    entry = { m, name }; monsters.set(mon.id, entry)
    return entry
  }

  // ---- selection ring, placement ghost, weather ----
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd36b', depthWrite: false }))
  ring.position.y = 0.04; scene.add(ring)
  const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false })
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.3, 1), ghostMat), ghostDoor = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), ghostMat)
  scene.add(ghost, ghostDoor)
  const weather = new Weather(); scene.add(weather.group)

  // ---- camera + input ----
  const cam = { target: new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z), zoom: 1.6 /* start a little way out: the town reads as a village, not a close-up */ }
  const ppm = () => cam.zoom * 16 // screen pixels per metre
  const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3()
  const toWorld = (sx: number, sy: number) => {
    const r = renderer.domElement.getBoundingClientRect()
    groundPlane.constant = -(roomId ? 0 : player.pos.y)
    ray.setFromCamera(new THREE.Vector2(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1), camera)
    return ray.ray.intersectPlane(groundPlane, hit) ? [hit.x, hit.z] as const : null
  }
  const proj = new THREE.Vector3()
  const toScreenPx = (p: THREE.Vector3) => { proj.copy(p).project(camera); return [(proj.x + 1) / 2 * host.clientWidth, (1 - proj.y) / 2 * host.clientHeight] as const }

  const canvas = renderer.domElement
  let drag: { id: number; x: number; y: number; t: THREE.Vector3; moved: boolean } | null = null
  const activeTouches = new Map<number, { x: number; y: number }>()
  let pinchStartDist = 0
  let pinchStartZoom = cam.zoom

  /** zoomed all the way out, the whole island (plus a strip of sea) fits on screen */
  const minZoom = () => Math.min(host.clientWidth / (WORLD_HALF * 2 + 30), host.clientHeight / ((WORLD_HALF * 2 + 30) * Math.sin(PITCH))) / 16

  const onDown = (e: PointerEvent) => {
    if (e.target !== canvas) return
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (activeTouches.size === 2) {
      const pts = [...activeTouches.values()]
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      pinchStartZoom = cam.zoom
      drag = null
      return
    }
    if (activeTouches.size === 1) {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: cam.target.clone(), moved: false }
    }
  }
  const onMove = (e: PointerEvent) => {
    if (activeTouches.has(e.pointerId)) {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (activeTouches.size >= 2) {
      const pts = [...activeTouches.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (pinchStartDist > 12 && dist > 12) {
        cam.zoom = Math.max(minZoom(), Math.min(6, pinchStartZoom * (dist / pinchStartDist)))
      }
      drag = null
      return
    }
    const p = useGame.getState().placing
    if (p) { const w = toWorld(e.clientX, e.clientY); if (w) { const x = Math.round(w[0]), z = Math.round(w[1]); if (p.x !== x || p.z !== z) useGame.setState({ placing: { ...p, x, z } }) } }
    if (!drag || e.pointerId !== drag.id) return
    // Do not hijack camera into free-look while the player is actively moving with joystick/keys
    const isMovingKeys = Math.hypot(
      key('KeyD') + key('ArrowRight') - key('KeyA') - key('ArrowLeft') + input.joy.x,
      key('KeyW') + key('ArrowUp') - key('KeyS') - key('ArrowDown') + input.joy.y,
    ) > 0.08
    if (isMovingKeys) { drag = null; return }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    if (Math.hypot(dx, dy) > 6) drag.moved = true
    if (drag.moved && !p) { // drag pans the map (free look)
      cam.target.copy(drag.t).addScaledVector(RIGHT, -dx / ppm()).addScaledVector(FWD, dy / (ppm() * Math.sin(PITCH)))
      cam.target.y = roomId ? 0 : Math.max(0, height(cam.target.x, cam.target.z))
      useGame.setState({ mode: 'iso', focus: null })
    }
  }
  const onCancel = (e: PointerEvent) => {
    activeTouches.delete(e.pointerId)
    if (activeTouches.size < 2) pinchStartDist = 0
    if (drag?.id === e.pointerId) drag = null
  }
  const onUp = (e: PointerEvent) => {
    const wasPinching = activeTouches.size >= 2 || pinchStartDist > 0
    activeTouches.delete(e.pointerId)
    if (activeTouches.size < 2) pinchStartDist = 0
    if (wasPinching) { drag = null; return }
    if (drag && e.pointerId !== drag.id) return
    const wasDrag = drag?.moved; drag = null
    if (wasDrag || e.target !== canvas) return
    const s = useGame.getState()
    if (s.placing) {
      const c = s.placing.x !== null && s.placing.z !== null ? checkPlacement(s.placing.kind, s.placing.x, s.placing.z, s.placing.rot) : null
      if (c?.ok) confirmPlacement(); else if (c) s.notify(c.reason)
      return
    }
    // residents, biome NPCs, and mountain monsters first (their sprite/mesh area on screen), then buildings under the pointer
    const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top
    for (const [id, n] of npcs) {
      if (!n.v.root.visible) continue
      const [fx, fy] = toScreenPx(n.v.root.position)
      if (Math.abs(sx - fx) < 0.6 * ppm() && sy < fy + 4 && sy > fy - 1.9 * ppm()) return s.select({ type: 'resident', id })
    }
    for (const [id, n] of biomeNpcs) {
      if (!n.v.root.visible) continue
      const [fx, fy] = toScreenPx(n.v.root.position)
      if (Math.abs(sx - fx) < 0.65 * ppm() && sy < fy + 4 && sy > fy - 2.0 * ppm()) return s.select({ type: 'biomeNpc', id })
    }
    for (const [id, entry] of monsters) {
      if (!entry.m.root.visible) continue
      const [fx, fy] = toScreenPx(entry.m.root.position)
      if (Math.abs(sx - fx) < 1.35 * ppm() && sy < fy + 10 && sy > fy - 3.6 * ppm()) return s.select({ type: 'monster', id })
    }
    const w = toWorld(e.clientX, e.clientY)
    const b = w && BUILDINGS.find((q) => w[0] > q.x - q.w / 2 && w[0] < q.x + q.w / 2 && w[1] > q.z - q.d / 2 && w[1] < q.z + q.d / 2 + 1)
    s.select(b ? { type: 'building', id: b.id } : null)
  }
  const onWheel = (e: WheelEvent) => { e.preventDefault(); cam.zoom = Math.max(minZoom(), Math.min(6, cam.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) }
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const s = useGame.getState()
    if (s.placing) { if (e.code === 'KeyR') rotatePlacement(); if (e.code === 'Escape') useGame.setState({ placing: null }); return }
    if (e.code === 'KeyE') interact()
    if (e.code === 'KeyV') s.toggleMode()
    if (e.code === 'Space' && s.screen === 'playing') {
      e.preventDefault()
      me.anim.play('attack')
      if (s.nearby?.type === 'monster') attackMonster(s.nearby.id)
    }
  }
  canvas.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onCancel)
  canvas.addEventListener('wheel', onWheel, { passive: false }); addEventListener('keydown', onKey)

  const resize = () => { renderer.setSize(host.clientWidth, host.clientHeight) }
  resize(); addEventListener('resize', resize)

  let scan = 0, flash = 0, last = performance.now(), raf = 0
  const sky = new THREE.Color(), lampEmissive = new THREE.Color()
  const loop = () => {
    raf = requestAnimationFrame(loop)
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.1); last = now
    const s = useGame.getState()
    if (s.rev !== lastRev) { lastRev = s.rev; paintTown(); refreshMyLook() }
    if (s.screen === 'playing') {
      s.tick(dt)
      s.checkPlayerRespawn(() => {
        player.pos.set(2, 0, 9)
        cam.target.set(2, 0, 9)
      })
      stepSim(dt)
    }
    stepEnv(dt, s.time)
    updateAudio(dt)
    if (s.interior !== roomId) showRoom(s.interior)
    if (!roomId) skyBirds.update(dt)

    // --- player (authoritative position: player.pos; collision: town.blockers / room boxes) ---
    const isDead = !!(s.playerDeadUntil && Date.now() < s.playerDeadUntil)
    const right = key('KeyD') + key('ArrowRight') - key('KeyA') - key('ArrowLeft') + input.joy.x
    const up = key('KeyW') + key('ArrowUp') - key('KeyS') - key('ArrowDown') + input.joy.y
    const len = Math.hypot(right, up)
    let moving = false, run = false
    if (s.screen === 'playing' && !isDead && !s.placing && len > 0.08) {
      if (s.mode !== 'third') useGame.setState({ mode: 'third', focus: null })
      run = !!(key('ShiftLeft') || key('ShiftRight') || input.sprint)
      const speed = (run ? 7.5 : 4) * Math.min(1, len)
      const dx = (RIGHT.x * right + FWD.x * up) / len, dz = (RIGHT.z * right + FWD.z * up) / len
      const ox = player.pos.x, oz = player.pos.z
      movePlayer(dx * speed * dt, dz * speed * dt)
      moving = Math.hypot(player.pos.x - ox, player.pos.z - oz) > 1e-4
      me.anim.face(right, -up)
      player.facing = Math.atan2(dx, dz)
    }
    me.root.visible = !isDead
    me.anim.set(moving ? (run ? 'run' : 'walk') : 'idle')
    me.anim.update(dt)
    me.draw(player.pos.x, player.pos.z, roomId ? 0 : player.pos.y)
    if ((scan -= dt) <= 0) { scan = 0.2; s.setNearby(s.screen === 'playing' && !isDead ? findNearby() : null) }

    // --- residents ---
    if (roomId && (occT -= dt) <= 0) {
      occT = 0.5; occupants.clear()
      const kind = roomKindOf(roomId)!
      for (const o of roomOccupants(kind, roomId)) occupants.set(o.r.id, { at: o.at, mode: o.mode })
      if (kind === 'guild') hallMembers().forEach((m, i) => occupants.set(m.residentId, { at: HALL_SPOTS[i], mode: 'idle' }))
    }
    const alive = new Set<string>()
    for (const res of residents) {
      const f = stepNpc(res, dt), so = sim[res.id]
      if (!f || !so) continue
      alive.add(res.id)
      const n = ensureNpc(res.id), inside = occupants.get(res.id)
      if (inside) {
        n.v.root.visible = true
        n.v.anim.face(...toScreen(Math.sin(inside.at[2]), Math.cos(inside.at[2])))
        n.v.anim.set(inside.mode === 'idle' || inside.mode === 'sit' ? 'idle' : 'interact')
        n.v.anim.update(dt); n.v.crate.visible = false
        n.v.draw(ROOM.cx + inside.at[0], ROOM.cz + inside.at[1])
        n.bubble.textContent = ''
        continue
      }
      n.v.root.visible = f.visible
      n.v.anim.face(...toScreen(Math.sin(f.facing), Math.cos(f.facing)))
      n.v.anim.set(f.mode === 'walk' ? (f.speed > 3 ? 'run' : 'walk') : f.mode === 'idle' ? 'idle' : 'interact')
      n.v.anim.update(dt)
      n.v.crate.visible = f.carrying
      n.v.draw(so.x, so.z, f.y)
      const text = !f.visible ? '' : so.talkingTo ? '💬' : so.bubble && so.bubbleUntil > performance.now() ? so.bubble : ''
      if (n.bubble.textContent !== text) n.bubble.textContent = text
    }
    for (const [id, n] of npcs) if (!alive.has(id)) { chars.remove(n.v.root); n.v.dispose(); n.bubble.remove(); n.name.remove(); npcs.delete(id); forgetNpc(id) }

    // --- biome NPCs (outdoors in the 4 outer biomes) ---
    for (const bnpc of BIOME_NPCS) {
      const n = ensureBiomeNpc(bnpc)
      if (roomId) {
        n.v.root.visible = false
        n.bubble.textContent = ''
        continue
      }
      const st = stepBiomeNpc(bnpc, dt)
      n.v.root.visible = true
      n.v.anim.face(...toScreen(Math.sin(st.facing), Math.cos(st.facing)))
      n.v.anim.set(st.mode === 'walk' ? 'walk' : 'idle')
      n.v.anim.update(dt)
      n.v.draw(st.x, st.z, st.y)
      const text = st.bubble && st.bubbleUntil > now ? st.bubble : ''
      if (n.bubble.textContent !== text) n.bubble.textContent = text
    }

    // --- monsters across all biomes (spread out, auto-attacking when player approaches) ---
    for (const mon of MOUNTAIN_MONSTERS) {
      const entry = ensureMonster(mon)
      if (roomId) {
        entry.m.root.visible = false
        continue
      }
      const st = stepMonster(mon, dt)
      if (st.deadUntil > now) {
        entry.m.root.visible = false
        continue
      }
      entry.m.root.visible = true
      entry.m.root.position.set(st.x, st.y, st.z)
      entry.m.root.rotation.y = st.facing
      entry.m.animate(now / 1000, st.walking, st.hitUntil > now, st.attackUntil > now)
    }

    // --- camera: follow the Guild Master (including full hill/mountain elevation y), or a focus point / free look ---
    if (s.mode === 'iso' && s.focus) {
      const fy = roomId ? 0 : Math.max(0, height(s.focus[0], s.focus[1]))
      cam.target.lerp(new THREE.Vector3(s.focus[0], fy, s.focus[1]), Math.min(1, dt * 6))
    } else if (s.mode === 'third') {
      const py = roomId ? 0 : player.pos.y
      cam.target.lerp(new THREE.Vector3(player.pos.x, py, player.pos.z), Math.min(1, dt * 12))
    }
    if (roomId) { cam.target.x = THREE.MathUtils.clamp(cam.target.x, ROOM.cx - 6, ROOM.cx + 6); cam.target.z = THREE.MathUtils.clamp(cam.target.z, ROOM.cz - 4, ROOM.cz + 6); cam.target.y = 0 }
    else { cam.target.x = THREE.MathUtils.clamp(cam.target.x, -WORLD_HALF, WORLD_HALF); cam.target.z = THREE.MathUtils.clamp(cam.target.z, -WORLD_HALF, WORLD_HALF) }
    cam.zoom = Math.max(cam.zoom, minZoom())
    const W = host.clientWidth, H = host.clientHeight, hw = W / 2 / ppm(), hh = H / 2 / ppm()
    Object.assign(camera, { left: -hw, right: hw, top: hh, bottom: -hh }); camera.updateProjectionMatrix()
    camera.position.copy(cam.target).addScaledVector(toCam, DIST); camera.lookAt(cam.target)
    // shadows cover what's on screen (finer up close, coarser zoomed out)
    const ext = Math.min(320, Math.max(30, Math.max(hw, hh / Math.sin(PITCH)) * 1.15))
    if (sun.shadow.camera.right !== ext) { Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext }); sun.shadow.camera.updateProjectionMatrix() }
    sun.position.copy(cam.target).add(SUN_DIR); sun.target.position.copy(cam.target)

    // --- labels (DOM, crisp) ---
    const place = (el: HTMLDivElement, p: THREE.Vector3, show: boolean) => {
      el.style.display = show ? '' : 'none'
      if (show) { const [x, y] = toScreenPx(p); el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)` }
    }
    const head = new THREE.Vector3()
    const near = cam.zoom >= 1.2 // zoomed far out, name tags would just be clutter
    const py = roomId ? 0 : player.pos.y
    place(myName, head.set(player.pos.x, py + 2.75, player.pos.z), near && s.screen === 'playing' && !isDead)
    const defaultLabel = s.userRole === 'gm' ? 'Guild Master' : s.playerClass
    const targetLabel = s.playerName && (s.userRole === 'gm' || s.playerName !== 'Guild Master') ? s.playerName : defaultLabel
    if (myName.textContent !== targetLabel) myName.textContent = targetLabel
    const sel = s.selection
    for (const [id, n] of npcs) {
      const p = n.v.root.position, vis = n.v.root.visible && near, showName = vis && (sel?.id === id || occupants.has(id))
      place(n.name, head.set(p.x, p.y + 2.75, p.z), showName)
      place(n.bubble, head.set(p.x, p.y + (showName ? 3.3 : 2.75), p.z), vis && !!n.bubble.textContent)
    }
    for (const [id, n] of biomeNpcs) {
      const p = n.v.root.position, vis = n.v.root.visible && near
      const distPlayer = Math.hypot(p.x - player.pos.x, p.z - player.pos.z)
      const showName = vis && (sel?.id === id || distPlayer < 16)
      place(n.name, head.set(p.x, p.y + 2.75, p.z), showName)
      place(n.bubble, head.set(p.x, p.y + (showName ? 3.3 : 2.75), p.z), vis && !!n.bubble.textContent)
    }
    for (const mon of MOUNTAIN_MONSTERS) {
      const entry = monsters.get(mon.id)
      if (!entry) continue
      const p = entry.m.root.position, vis = entry.m.root.visible && near
      const distPlayer = Math.hypot(p.x - player.pos.x, p.z - player.pos.z)
      const st = monsterLive[mon.id]
      const showName = vis && (sel?.id === mon.id || distPlayer < 22)
      const labelTxt = st ? `👹 ${mon.name} Lv.${mon.level} (${st.hp}/${mon.maxHp} HP)` : `👹 ${mon.name} Lv.${mon.level}`
      if (entry.name.textContent !== labelTxt) entry.name.textContent = labelTxt
      const hOffset = (mon.species === 'slime' ? 1.55 : mon.species === 'goblin' || mon.species === 'dire_wolf' ? 2.05 : 2.7) * mon.scale
      place(entry.name, head.set(p.x, p.y + hOffset, p.z), showName)
    }
    const selNpc = sel?.type === 'resident' ? npcs.get(sel.id) : sel?.type === 'biomeNpc' ? biomeNpcs.get(sel.id) : undefined
    const selMon = sel?.type === 'monster' ? monsters.get(sel.id) : undefined
    ring.visible = !!(selNpc?.v.root.visible || selMon?.m.root.visible)
    if (selNpc) {
      ring.scale.set(1, 1, 1)
      ring.position.set(selNpc.v.root.position.x, selNpc.v.root.position.y + 0.04, selNpc.v.root.position.z)
    } else if (selMon) {
      ring.scale.set(2.4, 2.4, 2.4)
      ring.position.set(selMon.m.root.position.x, selMon.m.root.position.y + 0.05, selMon.m.root.position.z)
    }

    // --- placement ghost ---
    const p = s.placing
    ghost.visible = ghostDoor.visible = !!(p && p.x !== null && p.z !== null)
    if (p && p.x !== null && p.z !== null) {
      const { w, d } = footprint(p.kind, p.rot), c = checkPlacement(p.kind, p.x, p.z, p.rot)
      ghostMat.color.set(c.ok ? '#5fd17a' : '#e05a4f')
      ghost.scale.set(w, 1, d); ghost.position.set(p.x, 0.15, p.z)
      ghostDoor.position.set(c.door[0], 0.06, c.door[1])
    }

    // --- light: day / night / weather (bright and warm by day) ---
    const n = env.night, inside = !!roomId
    sky.copy(SKY).lerp(NIGHT, n).lerp(new THREE.Color('#9aa3ad'), env.cloud * 0.45 * (1 - n))
    ;(scene.background as THREE.Color).copy(inside ? ROOMBG : sky)
    const fog = scene.fog as THREE.Fog
    fog.color.copy(sky); fog.near = inside ? 5000 : DIST - 40 + (1 - env.fog) * 1100; fog.far = fog.near + 120 + (1 - env.fog) * 1100
    hemi.intensity = inside ? 1.5 : (0.35 + 1.25 * (1 - n)) * (1 - 0.25 * env.cloud) + flash * 3
    hemi.color.set(n > 0.5 && !inside ? '#8ea4d8' : '#fff6e0')
    sun.intensity = inside ? 0.6 : 2.2 * (1 - n) * (1 - 0.6 * env.cloud)
    if (!inside && env.rain > 0.9 && Math.random() < dt * 0.12) { flash = 1; thunder() }
    flash = Math.max(0, flash - dt * 3)
    lamp.glass.emissive.copy(lampEmissive.set('#f4c050').multiplyScalar(n))
    lampGlows.visible = buildingGlows.visible = n > 0.25
    for (const g of [...lampGlows.children, ...buildingGlows.children] as THREE.Sprite[]) g.material.opacity = n
    for (const g of roomGlows.children as THREE.Sprite[]) g.material.opacity = 0.6 + Math.random() * 0.25
    // characters are unlit sprites: dim them with the light so they sit in the scene
    const lit = inside ? 1 : 0.45 + 0.55 * (1 - n) * (1 - 0.2 * env.cloud)
    for (const v of [...[...npcs.values()].map((q) => q.v), ...[...biomeNpcs.values()].map((q) => q.v)]) v.mat.color.setScalar(lit)
    if (s.playerHitUntil > now) me.mat.color.set('#ff5555')
    else me.mat.color.setScalar(lit)
    // ground follows the season, a touch darker when wet
    const season = seasonOf(s.time)
    groundMat.color.set(season === 'autumn' ? '#f2d8a8' : season === 'winter' ? '#e2e8f0' : '#ffffff').multiplyScalar(env.wet > 0.5 ? 0.88 : 1).lerp(new THREE.Color('#ffffff'), env.snowCover * 0.25)
    water.offset.x = (now / 9000) % 1; water.offset.y = (now / 14000) % 1
    weather.update(dt, cam.target, Math.min(90, Math.max(22, hw, hh / Math.sin(PITCH))), { inside, chimneys: [...chimneys, terrain.crater, terrain.crater], spring: season === 'spring', summer: season === 'summer', day: n < 0.3 })

    renderer.render(scene, camera)
  }
  loop()

  return () => {
    cancelAnimationFrame(raf); offTown()
    canvas.removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onCancel)
    canvas.removeEventListener('wheel', onWheel); removeEventListener('keydown', onKey); removeEventListener('resize', resize)
    for (const id of npcs.keys()) forgetNpc(id)
    for (const n of biomeNpcs.values()) { n.v.dispose(); n.bubble.remove(); n.name.remove() }
    for (const entry of monsters.values()) { entry.name.remove() }
    renderer.dispose(); canvas.remove()
  }
}
