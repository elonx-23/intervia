import * as React from 'react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/lib/auth'

// RequireAuth s'exécute sur CHAQUE écran authentifié (il enveloppe
// l'Outlet) — un import statique ici forçait ces trois pages dans le chunk
// principal quel que soit l'écran visité, malgré leur lazy-loading côté
// App.tsx (vite le signalait : "INEFFECTIVE_DYNAMIC_IMPORT"). En lazy ici
// aussi, elles ne sont téléchargées que si l'un de ces états déclenche
// vraiment leur affichage (rare : suspension, équipe sans rôle...).
const AccountSuspended = React.lazy(() => import('@/pages/AccountSuspended'))
const NoTeamYet = React.lazy(() => import('@/pages/NoTeamYet'))
const TeamSuspended = React.lazy(() => import('@/pages/TeamSuspended'))

function Fallback() {
  return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Chargement…</div>
}

export function RequireAuth() {
  const { session, suspended, teamSuspended } = useAuth()

  if (!session) return <Navigate to="/bienvenue" replace />

  return (
    <React.Suspense fallback={<Fallback />}>
      {suspended ? (
        <AccountSuspended />
      ) : teamSuspended ? (
        <TeamSuspended />
      ) : !session.role ? (
        <NoTeamYet />
      ) : (
        <Outlet />
      )}
    </React.Suspense>
  )
}
