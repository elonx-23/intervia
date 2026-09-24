import * as React from 'react'

import { apiFetch } from '@/lib/api'
import { applyCompanySettings } from '@/lib/company'
import { getCompanySettings } from '@/lib/settings'

export type Role = 'admin' | 'technicien'

export interface PseSession {
  sessionId: string
  username: string
  role: Role | null
  teamId: string | null
  technicienId: string | null
  technicienFirstName: string | null
  technicienLastName: string | null
  label: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
}

interface AuthContextValue {
  session: PseSession | null
  loading: boolean
  suspended: boolean
  teamSuspended: boolean
  demoMode: boolean
  loginEmail: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void
  setDemoRole: (role: Role) => void
  updateSession: (next: PseSession) => void
}

const STORAGE_KEY = 'pse_session'
const POLL_INTERVAL_MS = 5000

// Mode démo optionnel (VITE_SKIP_AUTH=true dans .env) : saute l'écran de
// connexion. Désactivé par défaut maintenant que le serveur local répond.
const DEMO_MODE = import.meta.env.VITE_SKIP_AUTH === 'true'

const DEMO_SESSIONS: Record<Role, PseSession> = {
  admin: {
    sessionId: 'demo-admin',
    username: 'admin',
    role: 'admin',
    teamId: 'demo-team',
    technicienId: null,
    technicienFirstName: null,
    technicienLastName: null,
    label: 'Démo Admin',
    firstName: 'Admin',
    lastName: '',
    email: null,
    phone: null,
  },
  technicien: {
    sessionId: 'demo-technicien',
    username: 'demo.technicien',
    role: 'technicien',
    teamId: 'demo-team',
    technicienId: 'demo-technicien-id',
    technicienFirstName: 'Démo',
    technicienLastName: 'Technicien',
    label: 'Démo Technicien',
    firstName: 'Démo',
    lastName: 'Technicien',
    email: null,
    phone: null,
  },
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

function readStoredSession(): PseSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PseSession
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<PseSession | null>(() =>
    DEMO_MODE ? DEMO_SESSIONS.admin : readStoredSession(),
  )
  const [loading, setLoading] = React.useState(false)
  const [suspended, setSuspended] = React.useState(false)
  const [teamSuspended, setTeamSuspended] = React.useState(false)

  const loginEmail = React.useCallback(async (email: string, password: string) => {
    setLoading(true)
    try {
      const next = await apiFetch<PseSession>('/api/auth/login-email', {
        method: 'POST',
        body: { email: email.trim(), password },
      })

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setSession(next)
      setSuspended(false)
      setTeamSuspended(false)
      return { ok: true as const }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Identifiants invalides.' }
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = React.useCallback(() => {
    if (DEMO_MODE) {
      setSession(DEMO_SESSIONS.admin)
      return
    }
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setSuspended(false)
    setTeamSuspended(false)
  }, [])

  const setDemoRole = React.useCallback((role: Role) => {
    setSession(DEMO_SESSIONS[role])
  }, [])

  const updateSession = React.useCallback((next: PseSession) => {
    if (!DEMO_MODE) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSession(next)
  }, [])

  // Les infos entreprise (utilisées dans les PDF de devis/factures et les
  // mentions légales) sont chargées une fois la session établie et
  // appliquées à l'objet COMPANY partagé — tout composant qui le lit à
  // l'affichage voit la valeur à jour sans avoir à la re-récupérer lui-même.
  React.useEffect(() => {
    if (!session) return
    getCompanySettings(session.sessionId)
      .then(applyCompanySettings)
      .catch(() => {})
  }, [session])

  React.useEffect(() => {
    if (!session || DEMO_MODE) return

    let cancelled = false

    const check = async () => {
      try {
        const { active, teamSuspended: teamSusp } = await apiFetch<{ active: boolean; teamSuspended: boolean }>(
          '/api/auth/session/active',
          { sessionId: session.sessionId },
        )
        if (!cancelled) {
          setSuspended(!active)
          setTeamSuspended(teamSusp)
        }
      } catch {
        // erreur réseau : on ne bascule pas en "veille" pour autant
      }
    }

    check()
    const interval = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session])

  const value = React.useMemo(
    () => ({
      session,
      loading,
      suspended,
      teamSuspended,
      demoMode: DEMO_MODE,
      loginEmail,
      logout,
      setDemoRole,
      updateSession,
    }),
    [session, loading, suspended, teamSuspended, loginEmail, logout, setDemoRole, updateSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider')
  return ctx
}
