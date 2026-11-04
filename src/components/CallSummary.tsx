import { ChevronDown, ChevronUp, FileText, Sparkles } from 'lucide-react'
import * as React from 'react'

import { getCallSummary } from '@/lib/telephony'

// Résumé de l'appel d'où vient une fiche, replié par défaut pour ne pas
// encombrer la fiche ; la transcription mot à mot est repliée à l'intérieur.
export function CallSummary({ callId, sessionId }: { callId: string; sessionId: string }) {
  const [open, setOpen] = React.useState(false)
  const [showTranscript, setShowTranscript] = React.useState(false)
  const [data, setData] = React.useState<{ summary: string | null; transcription: string | null } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    getCallSummary(sessionId, callId)
      .then((d) => !cancelled && setData(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [callId, sessionId])

  if (!data || (!data.summary && !data.transcription)) return null

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary"
      >
        <Sparkles className="size-4" />
        {open ? "Masquer le résumé de l'appel" : "Voir le résumé de l'appel"}
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {open && (
        <div className="flex flex-col gap-2 rounded-xl bg-background/70 p-3 text-sm">
          {data.summary ? (
            <p className="whitespace-pre-line">{data.summary}</p>
          ) : (
            <p className="text-muted-foreground">Résumé en cours…</p>
          )}
          {data.transcription && (
            <>
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground"
              >
                {showTranscript ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {showTranscript ? 'Masquer la transcription' : 'Voir la transcription complète'}
              </button>
              {showTranscript && (
                <div className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-xs text-muted-foreground">
                  <FileText className="mt-0.5 size-3.5 shrink-0" />
                  <p className="min-w-0 whitespace-pre-line">{data.transcription}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
