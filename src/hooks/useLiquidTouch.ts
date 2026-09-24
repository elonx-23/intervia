import * as React from 'react'

// Pilote le matériau "verre liquide" en temps réel à partir de la position
// exacte du doigt — pas une animation préenregistrée. Écrit directement les
// coordonnées en variables CSS sur l'élément (pas de setState à chaque
// pointermove, ça ferait re-render toute la page à 60fps) : le style reflète
// la vraie position/vitesse/durée du geste.
export function useLiquidTouch<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const start = React.useRef<{ x: number; y: number; t: number } | null>(null)

  const setPoint = (el: HTMLElement, clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    el.style.setProperty('--touch-x', `${Math.max(0, Math.min(100, x))}%`)
    el.style.setProperty('--touch-y', `${Math.max(0, Math.min(100, y))}%`)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    setPoint(el, e.clientX, e.clientY)
    el.classList.remove('liquid-release')
    el.classList.add('liquid-pressed')
    el.style.setProperty('--ripple-x', el.style.getPropertyValue('--touch-x'))
    el.style.setProperty('--ripple-y', el.style.getPropertyValue('--touch-y'))
    el.classList.remove('liquid-ripple')
    // force reflow pour pouvoir rejouer l'animation même sur des taps répétés
    void el.offsetWidth
    el.classList.add('liquid-ripple')
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || !start.current) return
    setPoint(el, e.clientX, e.clientY)
  }

  const release = (_e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    el.classList.remove('liquid-pressed')
    if (start.current) {
      el.classList.remove('liquid-release')
      void el.offsetWidth
      el.classList.add('liquid-release')
    }
    start.current = null
  }

  return {
    ref,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: release,
      onPointerLeave: release,
      onPointerCancel: release,
    },
  }
}
