import { Trash2 } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

// Largeur du bouton « Supprimer » révélé.
const REVEAL = 96
// Distance horizontale avant que le geste soit considéré comme un glissement
// (en dessous, c'est un simple toucher ou un défilement).
const START_SLOP = 14

interface SwipeGroupContextValue {
  openId: string | null
  setOpenId: (id: string | null) => void
}
const SwipeGroupContext = React.createContext<SwipeGroupContextValue | null>(null)

// Regroupe plusieurs SwipeToDelete pour qu'un seul reste ouvert à la fois —
// glisser une nouvelle fiche referme automatiquement celle qui l'était.
export function SwipeToDeleteGroup({ children }: { children: React.ReactNode }) {
  const [openId, setOpenId] = React.useState<string | null>(null)
  const value = React.useMemo(() => ({ openId, setOpenId }), [openId])
  return <SwipeGroupContext.Provider value={value}>{children}</SwipeGroupContext.Provider>
}

// Glisser vers la gauche pour révéler « Supprimer » (comme Mail sur iPhone).
// Pensé pour ne jamais supprimer par accident :
// - le geste ne démarre que s'il est franchement horizontal (un défilement de
//   la liste, même un peu en biais, ne fait jamais glisser la fiche) ;
// - il faut glisser plus de la moitié du bouton (ou d'un coup sec) pour qu'il
//   reste ouvert, avec une résistance élastique au-delà ;
// - la suppression demande toujours d'appuyer sur le bouton ;
// - toucher la fiche quand le bouton est ouvert la referme (sans l'ouvrir).
export function SwipeToDelete({
  id,
  onDelete,
  children,
  disabled,
  className,
}: {
  id: string
  onDelete: () => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  const group = React.useContext(SwipeGroupContext)
  const [dragX, setDragX] = React.useState(0)
  const [animate, setAnimate] = React.useState(false)
  const drag = React.useRef<{
    startX: number
    startY: number
    startDragX: number
    axis: 'x' | 'y' | null
    lastX: number
    lastT: number
    velocity: number
  } | null>(null)
  // Un glissement vient d'avoir lieu : le « clic » qui suit est ignoré.
  const suppressClick = React.useRef(false)

  React.useEffect(() => {
    if (group && group.openId !== id && dragX !== 0) {
      setAnimate(true)
      setDragX(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.openId])

  if (disabled) return <>{children}</>

  const open = dragX <= -REVEAL + 1

  const close = () => {
    setAnimate(true)
    setDragX(0)
    if (group?.openId === id) group.setOpenId(null)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    drag.current = { startX: t.clientX, startY: t.clientY, startDragX: dragX, axis: null, lastX: t.clientX, lastT: e.timeStamp, velocity: 0 }
    setAnimate(false)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current
    if (!d) return
    const t = e.touches[0]
    const dx = t.clientX - d.startX
    const dy = t.clientY - d.startY
    if (!d.axis) {
      if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return
      // Horizontal seulement si nettement plus horizontal que vertical.
      d.axis = Math.abs(dx) > Math.abs(dy) * 1.6 ? 'x' : 'y'
      if (d.axis === 'x') group?.setOpenId(id)
    }
    if (d.axis !== 'x') return
    const dt = Math.max(1, e.timeStamp - d.lastT)
    d.velocity = (t.clientX - d.lastX) / dt
    d.lastX = t.clientX
    d.lastT = e.timeStamp
    let next = d.startDragX + (dx - Math.sign(dx) * START_SLOP)
    // Résistance élastique au-delà du bouton, et aucun glissement vers la droite.
    if (next < -REVEAL) next = -REVEAL - (-REVEAL - next) * 0.25
    if (next > 0) next = 0
    setDragX(next)
  }

  const onTouchEnd = () => {
    const d = drag.current
    drag.current = null
    if (!d || d.axis !== 'x') return
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 350)
    setAnimate(true)
    // Ouvert si glissé au-delà de 55 % du bouton, ou d'un coup sec vers la gauche.
    const flickLeft = d.velocity < -0.6
    const flickRight = d.velocity > 0.6
    const opening = !flickRight && (flickLeft || dragX < -REVEAL * 0.55)
    setDragX(opening ? -REVEAL : 0)
    if (opening) navigator.vibrate?.(8)
    else if (group?.openId === id) group.setOpenId(null)
  }

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      <button
        type="button"
        aria-label="Supprimer"
        onClick={() => {
          onDelete()
          close()
        }}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 bg-destructive text-xs font-semibold text-destructive-foreground"
        style={{ width: Math.max(REVEAL, -dragX) }}
        tabIndex={open ? 0 : -1}
      >
        <Trash2 className="size-5" />
        Supprimer
      </button>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={(e) => {
          // Après un glissement, ou si le bouton est ouvert : on referme, sans ouvrir la fiche.
          if (suppressClick.current || dragX !== 0) {
            e.preventDefault()
            e.stopPropagation()
            if (!suppressClick.current) close()
          }
        }}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: animate ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          touchAction: 'pan-y',
        }}
        className="relative bg-background"
      >
        {children}
      </div>
    </div>
  )
}
