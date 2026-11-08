// The Guild Master's face for the HUD, cut from their real sprite sheet (same look as in town).
import { useEffect, useRef } from 'react'
import { loadCharacter, lookKeyFor } from '../character-creator/appearance'
import { useGame } from '../game/store'
import { buildSheet, frameRect } from './sheet'
import { fromCreator, fromSimple } from './look'

const DEFAULT = fromSimple({ skin: '#f1c9a5', hair: '#4a2c1c', hairStyle: 'short', shirt: '#2f4f7f', pants: '#3a2e26', height: 1 }, '#b8392f')

export function PixelAvatar() {
  const ref = useRef<HTMLCanvasElement>(null)
  const rev = useGame((s) => s.rev)
  useEffect(() => {
    const draw = (sheet: HTMLCanvasElement) => {
      const x = ref.current?.getContext('2d')
      if (!x) return
      x.imageSmoothingEnabled = false
      const r = frameRect('idle', 'down', 0)
      x.clearRect(0, 0, 24, 24)
      x.drawImage(sheet, r.x + 4, r.y + 1, 24, 24, 0, 0, 24, 24) // full hat + head
    }
    draw(buildSheet(DEFAULT))
    loadCharacter(lookKeyFor(useGame.getState().loggedInstagram)).then((s) => s && draw(buildSheet(fromCreator(s.appearance)))).catch(() => {})
  }, [rev])
  return <canvas ref={ref} width={24} height={24} />
}
