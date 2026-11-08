// QC sheet (#/sprites): every character state × direction × frame for a few looks, drawn 3× with nearest-neighbour.
import { useEffect, useRef } from 'react'
import { SHEET, STATE_ORDER, buildSheet, frameRect, type SpriteLook } from './sheet'
import { fromSimple } from './look'

const LOOKS: SpriteLook[] = [
  fromSimple({ skin: '#f1c9a5', hair: '#4a2c1c', hairStyle: 'short', shirt: '#2f4f7f', pants: '#3a2e26', height: 1 }, '#b8392f', 'sword'),
  { ...fromSimple({ skin: '#c99a76', hair: '#d7a64a', hairStyle: 'long', shirt: '#5b3d8a', pants: '#2f2a35', height: 1, accessory: 'glasses' }), long: true, hat: { kind: 'wizard', c: '#5b3d8a', c2: '#e7c35b' }, weapon: 'staff' },
  { ...fromSimple({ skin: '#8d5a3b', hair: '#1d1714', hairStyle: 'spiky', shirt: '#7a5434', pants: '#5b4636', height: 1, accessory: 'horns' }), armor: '#9aa0a8', shoulders: '#c8ccd2', weapon: 'hammer', pack: '#7a4e2c' },
  { ...fromSimple({ skin: '#efc6a4', hair: '#b8442e', hairStyle: 'bun', shirt: '#3f7a3a', pants: '#5c4430', height: 1 }), hat: { kind: 'hood', c: '#4f6b45' }, weapon: 'bow', belt: '#5c4430' },
]
const Z = 3

export function SpriteQC() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!, x = c.getContext('2d')!
    const cols = STATE_ORDER.reduce((a, s) => a + SHEET.states[s].frames, 0)
    c.width = (cols * SHEET.frameW + STATE_ORDER.length * 4) * Z; c.height = LOOKS.length * 4 * (SHEET.frameH + 2) * Z + 20
    x.imageSmoothingEnabled = false
    x.fillStyle = '#6aac52'; x.fillRect(0, 0, c.width, c.height)
    x.font = '12px monospace'; x.fillStyle = '#1d1622'
    let col = 0
    for (const st of STATE_ORDER) { x.fillText(st, col * Z, 12); col += SHEET.states[st].frames * SHEET.frameW + 4 }
    LOOKS.forEach((L, li) => {
      const sheet = buildSheet(L)
      SHEET.dirs.forEach((d, di) => {
        let cx = 0
        const y = 20 + ((li * 4 + di) * (SHEET.frameH + 2)) * Z
        for (const st of STATE_ORDER) {
          for (let f = 0; f < SHEET.states[st].frames; f++) {
            const r = frameRect(st, d, f)
            x.drawImage(sheet, r.x, r.y, r.w, r.h, cx * Z, y, r.w * Z, r.h * Z)
            cx += SHEET.frameW
          }
          cx += 4
        }
      })
    })
  }, [])
  return <div style={{ overflow: 'auto', height: '100vh', background: '#6aac52' }}><canvas ref={ref} style={{ imageRendering: 'pixelated' }} /></div>
}
