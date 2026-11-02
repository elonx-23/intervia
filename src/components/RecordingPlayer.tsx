import { Loader2, Play } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'

// L'enregistrement vit chez Twilio, protégé par Basic Auth (identifiants de
// l'équipe, jamais exposés au navigateur) — impossible de le pointer
// directement en src= d'un <audio> comme une image publique. On le récupère
// en blob via un fetch authentifié (même header x-session-id que le reste de
// l'app) à la demande, pas au chargement de la page.
export function RecordingPlayer({ callId, sessionId }: { callId: string; sessionId: string }) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/telephony/calls/${callId}/recording`, { headers: { 'x-session-id': sessionId } })
      if (!res.ok) throw new Error()
      setUrl(URL.createObjectURL(await res.blob()))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  if (url) return <audio controls autoPlay className="h-9 w-full" src={url} />

  return (
    <Button variant="outline" size="sm" onClick={load} disabled={loading} className="w-fit">
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      {error ? 'Erreur, réessayer' : "Écouter l'appel"}
    </Button>
  )
}
