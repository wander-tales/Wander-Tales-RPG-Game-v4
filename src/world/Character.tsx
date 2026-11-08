import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { blushMark, Cone, Dome, Disc, Ell, G, hairCap, HEAD, pixelEye, Ring, Seg, mat as chibiMat } from '../threejs/chibiGeo'
import type { Appearance } from '../game/residents.mock'
import type { ChibiMotion } from '../threejs/ChibiCharacter'

export type Anim = ChibiMotion

/**
 * Simple chibi used where only the basic look (skin/hair/shirt/pants) is known — the Register page's
 * preview, and the brief fallback NPCs/the player show while their full equipped look loads. Built from the
 * same smooth primitives as the in-town character (threejs/chibiGeo.tsx), just without equipment layers.
 */
export function Character({ look, anim, cape }: { look: Appearance; anim: RefObject<Anim>; cape?: string }) {
  const body = useRef<Group>(null!)
  const legL = useRef<Group>(null!), legR = useRef<Group>(null!)
  const armL = useRef<Group>(null!), armR = useRef<Group>(null!)
  const phase = useRef(Math.random() * 10)

  useFrame(({ camera }, dt) => {
    // distance tier: far-away characters are a few pixels tall, skip limb animation
    const e = body.current.matrixWorld.elements
    if ((camera.position.x - e[12]) ** 2 + (camera.position.z - e[14]) ** 2 > 90 * 90) return
    const a = anim.current
    const walking = a.mode === 'walk'
    const sit = a.mode === 'sit' || a.mode === 'sitTalk', talk = a.mode === 'talk' || a.mode === 'sitTalk'
    phase.current += dt * (walking ? 3 + a.speed * 2.2 : a.mode === 'work' ? 7 : talk ? 3 : 1.6)
    const p = phase.current
    const swing = walking ? Math.min(0.75, 0.25 + a.speed * 0.12) : 0
    legL.current.rotation.x = sit ? -1.45 : Math.sin(p) * swing
    legR.current.rotation.x = sit ? -1.45 : -Math.sin(p) * swing
    if (a.mode === 'work') {
      armR.current.rotation.x = -1.2 + Math.sin(p) * 0.7
      armL.current.rotation.x = -0.4
    } else if (talk) { // hands gesture in turn
      armR.current.rotation.x = -0.9 + Math.sin(p * 1.3) * 0.35
      armL.current.rotation.x = -0.7 + Math.sin(p * 1.1 + 2) * 0.3
    } else {
      armL.current.rotation.x = -Math.sin(p) * swing + (walking ? 0 : Math.sin(p * 0.5) * 0.08)
      armR.current.rotation.x = Math.sin(p) * swing - (walking ? 0 : Math.sin(p * 0.5) * 0.08)
    }
    body.current.position.y = walking ? Math.abs(Math.sin(p)) * 0.07 : sit ? -0.12 : Math.sin(p) * 0.015
    body.current.rotation.z = a.mode === 'idle' ? Math.sin(p * 0.5) * 0.03 : 0 // idle weight shift
    body.current.rotation.x = talk ? Math.abs(Math.sin(p * 2.2)) * 0.05 : 0 // nodding along
  })

  const skin = chibiMat(look.skin, { rough: 0.6 }), hair = chibiMat(look.hair, { rough: 0.85 })
  const shirt = chibiMat(look.shirt, { rough: 0.8 }), pants = chibiMat(look.pants, { rough: 0.8 })
  const bw = look.build === 'slim' ? 0.86 : look.build === 'sturdy' ? 1.18 : 1 // body width

  return (
    <group scale={look.height}>
      <group ref={body}>
        {/* legs pivot at the hip */}
        <group ref={legL} position={[-0.12, 0.42, 0]}>{Seg([0, 0, 0], [0, -0.4, 0], 0.085, pants)}{Ell([0, -0.42, 0.03], [0.09, 0.06, 0.13], pants)}</group>
        <group ref={legR} position={[0.12, 0.42, 0]}>{Seg([0, 0, 0], [0, -0.4, 0], 0.085, pants)}{Ell([0, -0.42, 0.03], [0.09, 0.06, 0.13], pants)}</group>
        {Ell([0, 0.66, 0], [0.27 * bw, 0.26, 0.22 * bw], shirt)}
        {look.accessory === 'scarf' && Ring([0, 0.92, 0], 0.24 * bw, 0.05, chibiMat(look.hat ?? '#c94f4f'))}
        {cape && G(Seg([0, 0.86, -0.18], [0, 0.3, -0.24], 0.26, chibiMat(cape, { rough: 0.85 })))}
        <group ref={armL} position={[-0.34 * bw, 0.86, 0]}>{Seg([0, 0, 0], [0, -0.34, 0], 0.062, shirt)}{Ell([0, -0.37, 0], 0.075, skin)}</group>
        <group ref={armR} position={[0.34 * bw, 0.86, 0]}>{Seg([0, 0, 0], [0, -0.34, 0], 0.062, shirt)}{Ell([0, -0.37, 0], 0.075, skin)}</group>
        {/* big chibi head — anchored at the same HEAD constant the full in-town body uses, so this
            preview (Register's "Become a Resident") lines up with Character Creator's, not a lookalike */}
        <>
          {Ell(HEAD.c, [HEAD.r * HEAD.s[0], HEAD.r * HEAD.s[1], HEAD.r * HEAD.s[2]], skin)}
          {pixelEye(0.34)}{pixelEye(-0.34)}
          {blushMark(1)}{blushMark(-1)}
          <Hair style={look.hairStyle} c={look.hair} />
          <group position={HEAD.c}>
            {look.accessory === 'glasses' && (
              <group position={[0, -0.03, 0.36]}>
                {[-0.13, 0.13].map((x) => <mesh key={x} position={[x, 0, 0]} material={chibiMat('#3a2e26', { rough: 0.4 })}><torusGeometry args={[0.075, 0.012, 6, 16]} /></mesh>)}
                {Seg([-0.06, 0, 0], [0.06, 0, 0], 0.012, chibiMat('#3a2e26'))}
              </group>
            )}
            {look.accessory === 'flower' && (
              <group position={[0.27, 0.22, 0.16]}>
                {[0, 1, 2, 3, 4].map((i) => <mesh key={i}>{Ell([Math.cos(i * 1.26) * 0.05, Math.sin(i * 1.26) * 0.05, 0], 0.04, chibiMat('#f6a5c0'))}</mesh>)}
                {Ell([0, 0, 0], 0.035, chibiMat('#f4d35e'))}
              </group>
            )}
            {look.accessory === 'horns' && (
              <>
                <mesh>{Cone([0.24, 0.52, 0], 0.06, 0.3, chibiMat('#e8dcc0'), [0, 0, -0.35])}</mesh>
                <mesh>{Cone([-0.24, 0.52, 0], 0.06, 0.3, chibiMat('#e8dcc0'), [0, 0, 0.35])}</mesh>
              </>
            )}
            {look.accessory === 'headband' && Ring([0, 0.12, 0], 0.4, 0.035, chibiMat(look.hat ?? '#c94f4f'))}
            {look.hat && (
              <group position={[0, 0.3, 0]}>
                {Disc([0, 0, 0], 0.5, 0.04, chibiMat(look.hat))}
                {Dome([0, 0.1, 0], [0.26, 0.24, 0.26], chibiMat(look.hat))}
              </group>
            )}
          </group>
        </>
      </group>
    </group>
  )
}

/** Short/long/bun/spiky hair built from the same smooth cap every chibi hairstyle starts from. */
function Hair({ style, c }: { style: Appearance['hairStyle']; c: string }) {
  // hairCap() places itself in absolute space (like pixelEye); the extra bits below are small local
  // offsets off the head centre, so they go in their own HEAD.c-anchored group, not mixed with hairCap.
  return (
    <>
      {hairCap(c)}
      <group position={HEAD.c}>
        {style === 'long' && Seg([0, 0.08, -0.3], [0, -0.3, -0.28], 0.16, chibiMat(c, { rough: 0.85 }))}
        {style === 'bun' && Ell([0, 0.36, -0.22], 0.14, chibiMat(c, { rough: 0.85 }))}
        {style === 'spiky' && [-0.18, 0, 0.18].map((x) => <mesh key={x}>{Cone([x, 0.4, -0.05], 0.07, 0.22, chibiMat(c, { rough: 0.85 }), [0, 0, -x * 1.3])}</mesh>)}
      </group>
    </>
  )
}
