import * as React from 'react'

const VISIBLE_MS = 700
const FADE_MS = 350

// Écran de lancement affiché brièvement à l'ouverture de l'app (comme le
// splash natif d'une app mobile) — logo centré sur le même fond que
// `.app-backdrop`, puis fondu vers l'app réelle. Purement cosmétique : ne
// bloque aucun chargement de données, juste un minuteur.
export function Splash() {
  const [phase, setPhase] = React.useState<'visible' | 'fading' | 'done'>('visible')

  React.useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase('fading'), VISIBLE_MS)
    const doneTimer = setTimeout(() => setPhase('done'), VISIBLE_MS + FADE_MS)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [])

  if (phase === 'done') return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity ease-out"
      style={{
        opacity: phase === 'fading' ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
      }}
      aria-hidden="true"
    >
      <img
        src="/marketing/logo-mark.png"
        alt=""
        className="size-20 animate-in fade-in-0 zoom-in-95 duration-500 sm:size-24"
      />
    </div>
  )
}
