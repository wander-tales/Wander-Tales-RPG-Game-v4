import { useEffect, useRef, useState } from 'react'
import type { CharacterAppearance, Slot } from '../character-creator/appearance'
import type { CatalogAsset } from '../threejs/chibiCatalog'
import { SHEET, buildSheet, frameRect, type Dir, type SpriteLook, type State, type Weapon } from './sheet'
import { fromCreator } from './look'

const DIRS: Dir[] = ['down', 'left', 'up', 'right']
const DIR_LABEL: Record<Dir, string> = { down: 'Front', left: 'Left', right: 'Right', up: 'Back' }

/** Paint a cozy pixel-art RPG meadow & stone pedestal behind the character (internal 64×64 canvas). */
function paintStageBg(x: CanvasRenderingContext2D, W: number, H: number, t: number) {
  x.imageSmoothingEnabled = false
  // Sky bands
  x.fillStyle = '#9ad1ea'; x.fillRect(0, 0, W, H)
  x.fillStyle = '#b7e2f4'; x.fillRect(0, 10, W, 14)
  x.fillStyle = '#d6f0fa'; x.fillRect(0, 22, W, 12)

  // Drifting pixel clouds
  const cx1 = Math.floor((t * 3) % (W + 20)) - 14
  const cx2 = Math.floor((t * 2 + 32) % (W + 20)) - 14
  x.fillStyle = '#ffffff'
  x.fillRect(cx1, 6, 12, 3); x.fillRect(cx1 + 2, 4, 8, 2)
  x.fillRect(cx2, 13, 10, 3); x.fillRect(cx2 + 2, 11, 6, 2)

  // Distant hills & pixel trees
  x.fillStyle = '#6da35d'; x.fillRect(0, 30, W, 8)
  x.fillStyle = '#5a8f4c'
  for (let i = 0; i < W; i += 8) {
    x.fillRect(i + 1, 27, 6, 4)
    x.fillRect(i + 2, 25, 4, 2)
  }

  // Meadow ground
  x.fillStyle = '#7bb862'; x.fillRect(0, 35, W, H - 35)
  x.fillStyle = '#6aa553'; x.fillRect(0, 48, W, H - 48)
  x.fillStyle = '#5b9246'; x.fillRect(0, 56, W, H - 56)

  // Pixel grass tufts & tiny flowers
  const tufts: [number, number, string][] = [
    [6, 39, '#5a8f4c'], [12, 44, '#f4d35e'], [52, 40, '#f6a5c0'],
    [56, 46, '#5a8f4c'], [8, 52, '#ffffff'], [50, 53, '#f4d35e'],
  ]
  for (const [gx, gy, c] of tufts) {
    x.fillStyle = '#4e7f3e'; x.fillRect(gx, gy + 1, 2, 1)
    x.fillStyle = c; x.fillRect(gx, gy, 1, 1)
  }

  // Stone RPG pedestal under character
  const px = Math.floor(W / 2) - 13, py = 44
  x.fillStyle = '#3a2e26'; x.fillRect(px - 1, py + 1, 28, 8)
  x.fillStyle = '#8b857c'; x.fillRect(px, py, 26, 7)
  x.fillStyle = '#aba499'; x.fillRect(px + 1, py, 24, 5)
  x.fillStyle = '#c9c2b6'; x.fillRect(px + 3, py + 1, 20, 3)
  // Shadow oval on pedestal
  x.fillStyle = 'rgba(20, 16, 24, 0.35)'
  x.fillRect(px + 6, py + 2, 14, 3)
}

export function PixelSpriteStage({
  look,
  state = 'idle',
  spin = false,
  compact = false,
  onSelectState,
  weapon,
  onSelectWeapon,
}: {
  look: SpriteLook
  state?: State
  spin?: boolean
  compact?: boolean
  onSelectState?: (s: State) => void
  weapon?: Weapon
  onSelectWeapon?: (w: Weapon | undefined) => void
}) {
  const mainRef = useRef<HTMLCanvasElement>(null)
  const turnRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const [dir, setDir] = useState<Dir>('down')
  const dragX = useRef<number | null>(null)

  const sheetLook = weapon ? { ...look, weapon } : look

  useEffect(() => {
    const sheet = buildSheet(sheetLook)
    let raf = 0
    const start = performance.now()

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const elapsed = (now - start) / 1000
      const meta = SHEET.states[state] ?? SHEET.states.idle
      const frame = Math.floor(elapsed * meta.fps) % meta.frames
      const activeDir: Dir = spin ? DIRS[Math.floor(elapsed * 0.9) % DIRS.length] : dir

      // Draw main stage (64×64 pixel canvas)
      const mc = mainRef.current
      if (mc) {
        const ctx = mc.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        paintStageBg(ctx, 64, 64, elapsed)
        const r = frameRect(state, activeDir, frame)
        ctx.drawImage(sheet, r.x, r.y, r.w, r.h, 16, 10, r.w, r.h)
      }

      // Draw 4-direction turnaround cards (32×38 each)
      DIRS.forEach((d, idx) => {
        const tc = turnRefs.current[idx]
        if (!tc) return
        const tx = tc.getContext('2d')!
        tx.imageSmoothingEnabled = false
        tx.clearRect(0, 0, 32, 38)
        // Pedestal dot
        tx.fillStyle = 'rgba(58, 36, 20, 0.22)'
        tx.fillRect(8, 33, 16, 3)
        const r = frameRect(state, d, frame)
        tx.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, 32, 38)
      })
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sheetLook, state, spin, dir])

  return (
    <div className={`pixel-stage-wrap ${compact ? 'compact' : ''}`}>
      <div
        className="pixel-stage-main"
        onPointerDown={(e) => { dragX.current = e.clientX }}
        onPointerMove={(e) => {
          if (dragX.current === null) return
          const dx = e.clientX - dragX.current
          if (Math.abs(dx) > 24) {
            dragX.current = e.clientX
            setDir((cur) => DIRS[(DIRS.indexOf(cur) + (dx > 0 ? 1 : 3)) % DIRS.length])
          }
        }}
        onPointerUp={() => { dragX.current = null }}
      >
        <canvas ref={mainRef} width={64} height={64} className="pixel-stage-canvas" />
        <div className="pixel-dir-pills" role="group" aria-label="Facing direction">
          {DIRS.map((d) => (
            <button
              key={d}
              type="button"
              className={!spin && dir === d ? 'on' : ''}
              onClick={() => setDir(d)}
              title={`Face ${DIR_LABEL[d]}`}
            >
              {DIR_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      {/* 4-Direction Live Pixel Turnaround Strip */}
      <div className="pixel-turnaround">
        {DIRS.map((d, i) => (
          <button
            key={d}
            type="button"
            className={`pixel-turn-card ${!spin && dir === d ? 'on' : ''}`}
            onClick={() => setDir(d)}
            title={`View ${DIR_LABEL[d]} sprite`}
          >
            <canvas ref={(el) => { turnRefs.current[i] = el }} width={32} height={38} />
            <small>{DIR_LABEL[d]}</small>
          </button>
        ))}
      </div>

      {/* Optional Weapon & Animation Controls */}
      {(onSelectWeapon || onSelectState) && (
        <div className="pixel-stage-tools">
          {onSelectState && (
            <div className="pixel-tool-group">
              <span>Pose:</span>
              {(['idle', 'walk', 'run', 'interact', 'attack'] as State[]).map((st) => (
                <button key={st} type="button" className={state === st ? 'on' : ''} onClick={() => onSelectState(st)}>
                  {st[0].toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>
          )}
          {onSelectWeapon && (
            <div className="pixel-tool-group">
              <span>Weapon:</span>
              {([undefined, 'sword', 'staff', 'bow', 'dagger', 'hammer'] as (Weapon | undefined)[]).map((w) => (
                <button key={w ?? 'none'} type="button" className={weapon === w ? 'on' : ''} onClick={() => onSelectWeapon(w)}>
                  {w ? w[0].toUpperCase() + w.slice(1) : 'None'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Crop region & facing direction per equipment slot so pixel item thumbnails focus on the item without cutting off tall hats. */
function slotCrop(slot: Slot, id: string): { dir: Dir; sx: number; sy: number; sw: number; sh: number } {
  if (slot === 'back') return { dir: 'up', sx: 6, sy: 17, sw: 20, sh: 20 }
  if (slot === 'headwear' || slot === 'hair_ornament') return { dir: 'down', sx: 3, sy: 0, sw: 26, sh: 26 }
  if (slot === 'hair' && (id.includes('ponytail') || id.includes('braid'))) return { dir: 'left', sx: 4, sy: 2, sw: 24, sh: 24 }
  if (slot === 'hair') return { dir: 'down', sx: 4, sy: 2, sw: 24, sh: 24 }
  if (slot === 'ears') return { dir: 'down', sx: 5, sy: 5, sw: 22, sh: 22 }
  if (slot === 'feet' || slot === 'legs') return { dir: 'down', sx: 8, sy: 24, sw: 16, sh: 14 }
  return { dir: 'down', sx: 6, sy: 18, sw: 20, sh: 18 }
}

/** Crisp pixel-art thumbnail for a CatalogAsset. */
export function PixelItemThumb({ asset, baseApp }: { asset: CatalogAsset; baseApp: CharacterAppearance }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, 32, 32)

    // Preview mannequin with the player's skin/eyes and this item equipped
    const previewApp: CharacterAppearance = {
      schemaVersion: 1,
      skin: baseApp.skin,
      eyes: baseApp.eyes,
      height: 1,
      equipment: {
        hair: asset.slot === 'hair' ? asset.id : baseApp.equipment.hair ?? 'hair_short',
        torso: asset.slot === 'torso' ? asset.id : 'shirt_linen',
        feet: asset.slot === 'feet' ? asset.id : 'boots_leather',
        [asset.slot]: asset.id,
      },
      colors: {
        ...baseApp.colors,
      },
    }
    if (asset.slot === 'hair_ornament' || asset.slot === 'ears') {
      previewApp.equipment.hair = baseApp.equipment.hair ?? 'hair_short'
    }

    const sheet = buildSheet(fromCreator(previewApp))
    const { dir, sx, sy, sw, sh } = slotCrop(asset.slot, asset.id)
    const r = frameRect('idle', dir, 0)
    ctx.drawImage(sheet, r.x + sx, r.y + sy, sw, sh, 2, 2, 28, 28)
  }, [asset, baseApp.skin, baseApp.eyes, baseApp.equipment.hair, baseApp.colors])

  return <canvas ref={ref} width={32} height={32} className="pixel-item-canvas" />
}
