// Building interiors in 3D, from the same room layout as the collision (game/interior.ts ROOMS). Furniture boxes reuse
// the pixel art from pixel/roomArt.ts: its top view on the box top, its front view on the box front.
import * as THREE from 'three'
import { ROOM, ROOMS, type RoomId } from '../game/interior'
import { FIRES, FLOOR, HEIGHT, SHELL_COUNT, WALL, paintFurniture } from '../pixel/roomArt'
import { colorMat, matOf, paperTex, plankTex, stoneTex, tex, worldUV, PPM } from './tex'
import { paintFacade } from './facade'
import { shade } from '../pixel/paint'

export function buildRoom(kind: RoomId) {
  const g = new THREE.Group(), fires: THREE.Vector3[] = []
  g.position.set(ROOM.cx, 0, ROOM.cz)
  const [f0, , pat] = FLOOR[kind]
  const floorTex = pat === 'stone' ? stoneTex(f0) : plankTex(f0)
  const floor = new THREE.Mesh(worldUV(new THREE.BoxGeometry(16, 0.2, 14), 2), matOf(floorTex))
  floor.position.y = -0.1; floor.receiveShadow = true; g.add(floor)
  const H = 3.2, wallStyle = { wall: WALL[kind], stone: kind === 'blacksmith', shutter: '#5f8a3a' }
  const wall = (w: number, h: number, x: number, z: number, ry: number, windows = true) => {
    const p = paintFacade(wallStyle, Math.round(w * PPM), Math.round(h * PPM), { floors: 1, windows }, 3)
    const top = colorMat(shade(WALL[kind], -0.45))
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), [top, top, top, top, matOf(tex(p.canvas)), top])
    m.position.set(x, h / 2, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m)
  }
  wall(16.6, H, 0, -7.15, 0) // back
  wall(14, H, -8.15, 0, Math.PI / 2) // left (faces +x)
  wall(14, H, 8.15, 0, -Math.PI / 2) // right
  for (const sx of [-1, 1]) wall(6.85, 0.7, sx * 4.725, 7.15, Math.PI, false) // low front wall, door gap in the middle
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1), colorMat('#b8392f')); mat.rotation.x = -Math.PI / 2; mat.position.set(0, 0.02, 6.6); g.add(mat)
  if (kind === 'guild') { const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.08), [colorMat('#5b3a22'), colorMat('#5b3a22'), colorMat('#5b3a22'), colorMat('#5b3a22'), matOf(paperTex()), colorMat('#5b3a22')]); board.position.set(-1.5, 2.1, -6.95); g.add(board) }

  // furniture: one box per collision box, textured with the 2D piece (top → box top, front → box front)
  const boxes = ROOMS[kind].boxes.slice(SHELL_COUNT)
  paintFurniture(kind).forEach((piece, i) => {
    const b = boxes[i], w = b.maxX - b.minX, d = b.maxZ - b.minZ, hpx = HEIGHT[piece.kind], h = hpx / PPM
    const cv = piece.canvas, W = cv.width, Hc = cv.height, dpx = Math.round(d * PPM), wpx = Math.round(w * PPM)
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv
    const remap = (face: number, u0: number, u1: number, y0: number, y1: number) => { // canvas pixel rect → face UVs
      for (let v = face * 4; v < face * 4 + 4; v++) uv.setXY(v, (u0 + uv.getX(v) * (u1 - u0)) / W, 1 - (y1 - uv.getY(v) * (y1 - y0)) / Hc)
    }
    remap(2, 1, 1 + wpx, 1, 1 + dpx) // top
    remap(4, 1, 1 + wpx, 1 + dpx, 1 + dpx + hpx) // front
    const art = matOf(tex(cv)), side = colorMat(shade('#7a5434', -0.15))
    const m = new THREE.Mesh(geo, [side, side, art, side, art, side])
    m.position.set((b.minX + b.maxX) / 2, h / 2, (b.minZ + b.maxZ) / 2); m.castShadow = true; m.receiveShadow = true
    g.add(m)
    if (FIRES.includes(piece.kind)) fires.push(new THREE.Vector3(m.position.x + ROOM.cx, h * 0.45, b.maxZ + ROOM.cz + 0.2))
  })
  return { group: g, fires }
}
