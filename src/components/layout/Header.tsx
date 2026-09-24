import { Bell, Building2, Settings as SettingsIcon, X } from 'lucide-react'
import * as React from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useCurrentTeam } from '@/hooks/useCurrentTeam'
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications'
import { useAuth } from '@/lib/auth'
import { isTabRootPath } from '@/lib/navRoots'
import { cn } from '@/lib/utils'

export function Header({ title, toolbar }: { title: string; toolbar?: ReactNode }) {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = React.useState(false)
  const currentTeam = useCurrentTeam()
  const unread = useUnreadNotifications()

  // Racine d'onglet (Accueil, Devis, Factures…) : icônes notif/réglages.
  // Page empilée par-dessus (fiche ouverte, devis en édition, réglages…) :
  // une simple croix pour fermer — jamais les deux à la fois, jamais de
  // flèche retour. Dérivé de l'URL, jamais d'une prop à faire passer par
  // chaque page : impossible d'en oublier une.
  const isRoot = isTabRootPath(pathname, session?.role === 'admin')

  // Barre de nav façon iOS : quasi transparente en haut de page, elle prend
  // le flou/la matière "verre" progressivement une fois que le contenu
  // défile en-dessous (comme un "large title" qui se compacte au scroll).
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 left-1/2 z-40 flex w-full max-w-2xl -translate-x-1/2 items-center justify-between gap-2 border-b transition-all duration-300',
        // Quand une barre d'outils (filtres/recherche) est fournie, elle
        // prend la place du titre dans la même rangée — pas de deuxième
        // rangée en dessous, pour ne pas perdre de hauteur d'écran.
        toolbar ? 'min-h-14 px-4' : 'min-h-16 px-5',
        scrolled
          ? 'glass border-b-[var(--glass-border)]'
          : 'border-b-transparent bg-background/15 backdrop-blur-lg backdrop-saturate-150',
      )}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {toolbar ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">{toolbar}</div>
        ) : (
          <div className="flex min-w-0 items-baseline gap-2">
            {title && <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>}
            {/* Rappel permanent de l'équipe active — un technicien qui en a
                rejoint plusieurs doit toujours savoir sur laquelle il
                travaille, pas seulement au moment de basculer dans Réglages. */}
            {currentTeam && (
              <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
                {title && '·'}
                {currentTeam.logoUrl ? (
                  <img
                    src={currentTeam.logoUrl}
                    alt=""
                    className="size-5 shrink-0 rounded-full object-cover ring-1 ring-[var(--glass-edge)]"
                  />
                ) : (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Building2 className="size-3" />
                  </span>
                )}
                <span className="truncate">{currentTeam.name}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {isRoot ? (
          <div
            className="glass-strong flex items-center gap-0.5 rounded-full p-1"
            style={{ '--elevation-shadow': '0 4px 14px -4px rgba(0,0,0,0.2)' } as React.CSSProperties}
          >
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="liquid relative flex size-10 shrink-0 items-center justify-center rounded-full text-foreground"
            >
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <Link
              to="/reglages"
              aria-label="Réglages"
              className="liquid flex size-10 shrink-0 items-center justify-center rounded-full text-foreground"
            >
              <SettingsIcon className="size-5" />
            </Link>
          </div>
        ) : (
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Fermer" onClick={() => navigate(-1)}>
            <X className="size-5" />
          </Button>
        )}
      </div>
    </header>
  )
}
