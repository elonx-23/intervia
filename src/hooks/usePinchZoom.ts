import * as React from 'react'

// Zoom/pan tactile appliqué directement sur le style de l'élément (pas de
// re-render React pendant le geste, pour rester fluide à 60fps). Actif
// seulement pendant un vrai pincement à deux doigts — le défilement normal
// à un doigt n'est jamais intercepté tant qu'on n'est pas zoomé, et repasse
// à l'échelle 1 dès qu'on relâche si on est revenu proche de la taille
// d'origine.
export function usePinchZoom<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    let scale = 1
    let tx = 0
    let ty = 0
    let pinchStartDist = 0
    let pinchStartScale = 1
    let pan: { x: number; y: number; tx: number; ty: number } | null = null

    const apply = () => {
      el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`
    }

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const clampPan = () => {
      // Empêche de faire glisser la page entièrement hors champ une fois
      // zoomée — reste borné à ce que le zoom courant peut réellement
      // laisser dépasser du cadre.
      const maxX = (el.clientWidth * (scale - 1)) / 2
      const maxY = (el.clientHeight * (scale - 1)) / 2
      tx = Math.min(maxX, Math.max(-maxX, tx))
      ty = Math.min(maxY, Math.max(-maxY, ty))
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStartDist = dist(e.touches)
        pinchStartScale = scale
        pan = null
      } else if (e.touches.length === 1 && scale > 1) {
        pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty }
      }
    }

    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist) {
        e.preventDefault()
        scale = Math.min(4, Math.max(1, pinchStartScale * (dist(e.touches) / pinchStartDist)))
        clampPan()
        apply()
      } else if (e.touches.length === 1 && pan) {
        e.preventDefault()
        tx = pan.tx + (e.touches[0].clientX - pan.x)
        ty = pan.ty + (e.touches[0].clientY - pan.y)
        clampPan()
        apply()
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStartDist = 0
      if (e.touches.length < 1) {
        pan = null
        if (scale <= 1.02) {
          scale = 1
          tx = 0
          ty = 0
          el.style.transition = 'transform 200ms ease'
          apply()
          setTimeout(() => {
            el.style.transition = ''
          }, 200)
        }
      }
    }

    el.style.transformOrigin = '0 0'
    el.style.touchAction = 'pan-y'
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return ref
}
