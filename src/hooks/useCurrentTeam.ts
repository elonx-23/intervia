import * as React from 'react'

import { useAuth } from '@/lib/auth'
import { getMemberships } from '@/lib/teams'

export interface CurrentTeamInfo {
  name: string
  logoUrl: string | null
}

// Rappel permanent de l'équipe active pour un technicien (surtout utile
// s'il en a rejoint plusieurs) — refait la requête seulement quand la
// session ou l'équipe active change, pas à chaque changement de page.
export function useCurrentTeam(): CurrentTeamInfo | null {
  const { session } = useAuth()
  const [team, setTeam] = React.useState<CurrentTeamInfo | null>(null)

  React.useEffect(() => {
    if (!session || session.role !== 'technicien') {
      setTeam(null)
      return
    }
    let cancelled = false
    getMemberships(session.sessionId)
      .then((list) => {
        if (cancelled) return
        const active = list.find((m) => m.active)
        setTeam(active ? { name: active.name, logoUrl: active.logoUrl } : null)
      })
      .catch(() => {
        if (!cancelled) setTeam(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, session?.teamId, session?.role])

  return team
}
