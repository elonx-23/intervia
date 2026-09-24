import { apiFetch } from '@/lib/api'

export interface Backup {
  name: string
  size: number
  createdAt: string
}

export async function listBackups(sessionId: string) {
  return apiFetch<Backup[]>('/api/backups', { sessionId })
}

export async function runBackupNow(sessionId: string) {
  return apiFetch<Backup[]>('/api/backups/run', { method: 'POST', sessionId })
}

// Téléchargement en blob (pas un simple <a href>) : la route est protégée
// par session et un lien direct ne peut pas porter l'en-tête d'auth.
export async function downloadBackup(sessionId: string, name: string) {
  const res = await fetch(`/api/backups/${encodeURIComponent(name)}/download`, {
    headers: { 'x-session-id': sessionId },
  })
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
