import { Database, Download, RefreshCw } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { EmptyState } from '@/components/layout/EmptyState'
import { useAuth } from '@/lib/auth'
import { downloadBackup, listBackups, runBackupNow, type Backup } from '@/lib/backups'
import { friendlyError } from '@/lib/errors'

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function BackupSettings() {
  const { session } = useAuth()
  const [backups, setBackups] = React.useState<Backup[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)
  const [downloadingName, setDownloadingName] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    listBackups(session.sessionId)
      .then(setBackups)
      .catch((e) => setError(friendlyError(e, 'Erreur de chargement.')))
  }, [session])

  const runNow = async () => {
    if (!session) return
    setRunning(true)
    setError(null)
    try {
      setBackups(await runBackupNow(session.sessionId))
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la sauvegarde.'))
    } finally {
      setRunning(false)
    }
  }

  const download = async (name: string) => {
    if (!session) return
    setDownloadingName(name)
    setError(null)
    try {
      await downloadBackup(session.sessionId, name)
    } catch (e) {
      setError(friendlyError(e, 'Erreur de téléchargement.'))
    } finally {
      setDownloadingName(null)
    }
  }

  return (
    <Page title="Sauvegardes">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Une sauvegarde complète de la base (fiches, devis, factures…) est faite automatiquement chaque nuit à 3h30
          et conservée 14 jours. Tu peux aussi en déclencher une à tout moment.
        </p>

        <Button onClick={runNow} disabled={running}>
          <RefreshCw className={`size-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!backups && !error && <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>}

        {backups && backups.length === 0 && <EmptyState label="Aucune sauvegarde pour le moment" />}

        {backups && backups.length > 0 && (
          <div className="flex flex-col gap-2">
            {backups.map((b) => (
              <Card key={b.name} className="py-3">
                <CardContent className="flex items-center gap-3 px-4">
                  <Database className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{formatDate(b.createdAt)}</p>
                    <p className="truncate text-xs text-muted-foreground">{formatSize(b.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    disabled={downloadingName === b.name}
                    onClick={() => download(b.name)}
                    aria-label="Télécharger"
                  >
                    <Download className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}
