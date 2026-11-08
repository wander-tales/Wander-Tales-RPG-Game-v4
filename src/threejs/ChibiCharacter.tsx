import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { GAME_SCALE, type Motion } from './chibiGeo'
import { PARENT, PIVOT, type Bone } from './chibiGeo'
import { assemble } from './chibiParts'
import type { CharacterAppearance } from '../character-creator/appearance'

export interface ChibiMotion { speed: number; mode: Motion }

const BONES = Object.keys(PIVOT) as Bone[]
const CHILDREN = Object.fromEntries(BONES.map((b) => [b, BONES.filter((c) => PARENT[c] === b)])) as Record<Bone, Bone[]>

function BoneNode({ b, pieces, refs }: { b: Bone; pieces: Partial<Record<Bone, ReactNode[]>>; refs: RefObject<Partial<Record<Bone, Group | null>>> }) {
  const p = PIVOT[b], pp = PARENT[b] ? PIVOT[PARENT[b]!] : [0, 0, 0]
  return (
    <group position={[p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]]} ref={(g) => { refs.current[b] = g }}>
      {/* pieces are authored in rest-pose character space: undo the pivot */}
      <group position={[-p[0], -p[1], -p[2]]}>{pieces[b]?.map((n, i) => <group key={i}>{n}</group>)}</group>
      {CHILDREN[b].map((c) => <BoneNode key={c} b={c} pieces={pieces} refs={refs} />)}
    </group>
  )
}

/**
 * The chibi, built in code from smooth shapes (no model files). Equipment comes from the appearance;
 * rebuilt only when the appearance actually changes. `scale` keeps the old GLB convention (town = GAME_SCALE).
 */
export function ChibiCharacter({ appearance, motion, scale = GAME_SCALE, onReady }: {
  appearance: CharacterAppearance; motion?: RefObject<ChibiMotion>; scale?: number; onReady?: () => void
}) {
  const key = useMemo(() => JSON.stringify(appearance), [appearance])
  const pieces = useMemo(() => assemble(JSON.parse(key) as CharacterAppearance), [key])
  const refs = useRef<Partial<Record<Bone, Group | null>>>({})
  const root = useRef<Group>(null!)
  const phase = useRef(Math.random() * 10)
  useEffect(() => { onReady?.() }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const m = motion?.current, mode: Motion = m?.mode ?? 'idle'
    phase.current += dt * (mode === 'walk' ? 4 + (m?.speed ?? 1) * 2.2 : mode === 'work' ? 6 : mode === 'talk' || mode === 'sitTalk' ? 3 : 1.5)
    pose(refs.current, root.current, mode, phase.current, Math.min(1, 0.4 + (m?.speed ?? 0) * 0.25))
  })

  return (
    <group scale={(scale / GAME_SCALE) * appearance.height}>
      <group ref={root}><BoneNode b="pelvis" pieces={pieces} refs={refs} /></group>
    </group>
  )
}

const deg = Math.PI / 180
/** Drive the bones: walk / work / idle / talk / sit. Positive x rotation swings a limb backward, nods the head down. */
function pose(b: Partial<Record<Bone, Group | null>>, root: Group, motion: Motion, phase: number, amount: number) {
  for (const k of BONES) b[k]?.rotation.set(0, 0, 0)
  const s = Math.sin(phase), slow = Math.sin(phase * 0.5)
  const walk = motion === 'walk', sit = motion === 'sit' || motion === 'sitTalk', talk = motion === 'talk' || motion === 'sitTalk'
  const swing = walk ? 32 * deg * amount : 0
  const set = (k: Bone, x = 0, y = 0, z = 0) => b[k]?.rotation.set(x, y, z)

  // legs
  if (sit) { set('thighL', -86 * deg, 0, 4 * deg); set('thighR', -86 * deg, 0, -4 * deg); set('shinL', 86 * deg); set('shinR', 86 * deg) }
  else {
    set('thighL', -s * swing); set('thighR', s * swing)
    if (walk) { set('shinL', Math.max(0, s) * swing * 0.9); set('shinR', Math.max(0, -s) * swing * 0.9) }
  }
  // arms: hang a little outward; swing opposite the legs, hammer at work, gesture while talking
  let aL = s * swing * 0.8, aR = -s * swing * 0.8, fL = -6 * deg, fR = -6 * deg
  if (motion === 'work') { aR = -70 * deg + s * 32 * deg; fR = -40 * deg; aL = -20 * deg; fL = -20 * deg }
  else if (talk) {
    aR = -36 * deg + Math.sin(phase * 1.3) * 16 * deg; fR = -62 * deg - Math.sin(phase * 1.7) * 20 * deg
    aL = -28 * deg + Math.sin(phase * 1.1 + 2) * 14 * deg; fL = -55 * deg - Math.sin(phase * 1.5 + 1) * 20 * deg
  } else if (sit) { aL = aR = -24 * deg; fL = fR = -45 * deg }
  else if (motion === 'idle') { aL = slow * 5 * deg; aR = -slow * 5 * deg }
  set('armL', aL, 0, 6 * deg); set('armR', aR, 0, -6 * deg)
  set('foreL', fL); set('foreR', fR)
  // body: breathing, weight shift when idle, twist when walking
  set('spine', slow * 1.5 * deg + (talk ? 3 * deg : 0), walk ? s * 5 * deg : talk ? Math.sin(phase * 0.7) * 5 * deg : 0, motion === 'idle' ? slow * 2.5 * deg : 0)
  // head: looks around when idle or seated, nods while talking, looks down at the work
  const headY = motion === 'idle' || sit ? Math.sin(phase * 0.3) * 10 * deg : talk ? Math.sin(phase * 0.6) * 7 * deg : 0
  const headX = talk ? (4 + Math.abs(Math.sin(phase * 2.2)) * 9) * deg : motion === 'work' ? 10 * deg : motion === 'idle' ? Math.sin(phase * 0.23) * 3 * deg : 0
  set('head', headX, headY)
  // whole body: bob when walking, sway when idle, lowered onto the seat when sitting (origin = seat top)
  root.position.set(motion === 'idle' ? slow * 0.008 : 0, walk ? Math.abs(s) * 0.025 * amount : sit ? -0.32 : 0, 0)
}
