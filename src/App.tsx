import { useEffect, useState } from 'react'
import { useGame } from './game/store'
import { HUD } from './ui/HUD'
import { MainMenu } from './ui/MainMenu'
import { RegisterPage } from './ui/Register'
import { CharacterCreator } from './character-creator/CharacterCreator'
import { TownScene } from './scene/TownScene'
import { SpriteQC } from './pixel/SpriteQC'

const ROUTES: Record<string, string> = { '#/register': 'register', '#/creator': 'creator', '#/sprites': 'sprites' }
const page = () => ROUTES[location.hash] ?? 'game'

export function App() {
  const [route] = useState(page)
  useEffect(() => {
    document.documentElement.classList.add('pixel-ui')
    // switch pages with a clean reload: each page owns a WebGL canvas, never two at once
    const on = () => { if (page() !== route) location.reload() }
    addEventListener('hashchange', on)
    return () => {
      removeEventListener('hashchange', on)
      document.documentElement.classList.remove('pixel-ui')
    }
  }, [route])
  if (route === 'register') return <RegisterPage />
  if (route === 'creator') return <CharacterCreator />
  if (route === 'sprites') return <SpriteQC />
  return <PixelGame />
}

/** The 2.5D pixel-art town (Three.js). */
function PixelGame() {
  const screen = useGame((s) => s.screen)
  return (
    <>
      <TownScene />
      {screen === 'menu' ? <MainMenu /> : <HUD />}
    </>
  )
}

