import * as React from 'react'

// Gestes d'un devis / d'une facture, comme dans les grandes apps :
// - glisser depuis le MILIEU de l'écran (gauche ↔ droite) : onglet suivant /
//   précédent (Modifier · Aperçu · Historique) ;
// - glisser depuis le BORD GAUCHE vers la droite : retour en arrière.
// Jamais déclenché par un défilement vertical (le geste doit être nettement
// horizontal), ni dans les zones qui ont leurs propres gestes : champs de
// saisie, signature, aperçu PDF zoomé, lignes à glisser… (marquées
// data-no-swipe ou reconnues ci-dessous).
const EDGE = 28 // px depuis le bord gauche pour le geste « retour »
const MIN_DISTANCE = 70
const IGNORE = 'input, textarea, select, [contenteditable="true"], [data-no-swipe], [role="dialog"], [role="menu"]'

// Dans Safari, le retour par le bord existe déjà (natif) : on ne l'ajoute que
// dans l'app installée sur l'écran d'accueil, sinon on reculerait deux fois.
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function useEditorSwipe<T extends string>({
  tabs,
  tab,
  setTab,
  onBack,
}: {
  tabs: readonly T[]
  tab: T
  setTab: (t: T) => void
  onBack: () => void
}) {
  const tabRef = React.useRef(tab)
  React.useEffect(() => {
    tabRef.current = tab
  }, [tab])

  React.useEffect(() => {
    let start: { x: number; y: number; t: number; edge: boolean } | null = null

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start = null
        return
      }
      const target = e.target as Element | null
      if (target?.closest?.(IGNORE)) {
        start = null
        return
      }
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, t: e.timeStamp, edge: t.clientX <= EDGE }
    }

    const onEnd = (e: TouchEvent) => {
      const s = start
      start = null
      if (!s) return
      const t = e.changedTouches[0]
      const dx = t.clientX - s.x
      const dy = t.clientY - s.y
      const fast = e.timeStamp - s.t < 600
      // Nettement horizontal, assez long (ou rapide).
      if (Math.abs(dx) < (fast ? MIN_DISTANCE * 0.7 : MIN_DISTANCE) || Math.abs(dx) < Math.abs(dy) * 2) return
      if (s.edge) {
        if (dx > 0 && isStandalone()) onBack()
        return
      }
      const i = tabs.indexOf(tabRef.current)
      const next = dx < 0 ? i + 1 : i - 1
      if (next >= 0 && next < tabs.length) {
        setTab(tabs[next])
        window.scrollTo({ top: 0 })
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [tabs, setTab, onBack])
}
