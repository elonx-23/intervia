import { Outlet, useLocation } from 'react-router-dom'

import { BottomNav } from './BottomNav'
import { DemoBanner } from './DemoBanner'
import { useAuth } from '@/lib/auth'
import { isTabRootPath } from '@/lib/navRoots'

export function AppLayout() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  // La barre du bas n'a de sens que sur les pages "racine" d'un onglet —
  // une fiche ouverte, un devis en édition ou les réglages sont des pages
  // empilées qu'on ferme avec une croix (voir Header), pas des destinations
  // qu'on rejoint par un onglet.
  const showBottomNav = isTabRootPath(pathname, session?.role === 'admin')

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col">
      <DemoBanner />
      <Outlet />
      {showBottomNav && <BottomNav />}
    </div>
  )
}
