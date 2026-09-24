import { Trash2 } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

const REVEAL = 84

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

// Glisser vers la gauche pour révéler un bouton "Supprimer" (comme dans
// Mail sur iOS) — la suppression n'arrive jamais au simple geste, il faut
// ensuite taper le bouton révélé, pour ne jamais supprimer par accident.
// `id` (unique dans la liste) permet, dans un SwipeToDeleteGroup, de
// refermer automatiquement toute autre fiche déjà ouverte.
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
  const dragState = React.useRef<{ startX: number; startDragX: number; moved: boolean } | null>(null)
  const [animate, setAnimate] = React.useState(false)

  React.useEffect(() => {
    if (group && group.openId !== id && dragX !== 0) {
      setAnimate(true)
      setDragX(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.openId])

  if (disabled) return <>{children}</>

  const onTouchStart = (e: React.TouchEvent) => {
    dragState.current = { startX: e.touches[0].clientX, startDragX: dragX, moved: false }
    setAnimate(false)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragState.current) return
    const dx = e.touches[0].clientX - dragState.current.startX
    if (Math.abs(dx) > 4 && !dragState.current.moved) {
      dragState.current.moved = true
      group?.setOpenId(id)
    }
    const next = Math.min(0, Math.max(-REVEAL - 24, dragState.current.startDragX + dx))
    setDragX(next)
  }

  const onTouchEnd = () => {
    dragState.current = null
    setAnimate(true)
    const opening = dragX < -REVEAL / 2
    setDragX(opening ? -REVEAL : 0)
    if (!opening && group?.openId === id) {
      group.setOpenId(null)
    }
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)}>
      <button
        type="button"
        aria-label="Supprimer"
        onClick={() => {
          onDelete()
          setDragX(0)
          group?.setOpenId(null)
        }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-destructive text-destructive-foreground"
        style={{ width: REVEAL }}
      >
        <Trash2 className="size-5" />
      </button>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: animate ? 'transform 200ms ease' : 'none',
        }}
        className="relative bg-background"
      >
        {children}
      </div>
    </div>
  )
}
