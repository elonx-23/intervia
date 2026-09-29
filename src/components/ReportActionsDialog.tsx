import { Download, Mail } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { downloadReportPdf, type ReportPdfInput } from '@/lib/pdf'
import { sendReportEmail, type InterventionReportListItem } from '@/lib/reports'

// Une intervention n'a pas d'adresse email stockée (contrairement à un
// devis/facture) — on la demande donc ici au moment de l'envoi plutôt que de
// la relire en base, sans jamais la conserver après coup.
export function ReportActionsDialog({
  report,
  open,
  onOpenChange,
}: {
  report: InterventionReportListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { session } = useAuth()
  const [email, setEmail] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setEmail('')
      setError(null)
      setSent(false)
    }
  }, [open])

  if (!report) return null

  const client = [report.i_client_first_name, report.i_client_last_name].filter(Boolean).join(' ')
  const eventDate = report.i_completed_at ?? report.i_started_at ?? report.i_created_at
  const pdfData: ReportPdfInput = {
    reference: report.i_reference,
    clientFirstName: report.i_client_first_name,
    clientLastName: report.i_client_last_name,
    address: report.i_address,
    interventionType: report.i_intervention_type,
    description: report.i_description,
    eventDate,
  }

  const download = () => {
    if (!session) return
    const technicienName = [session.firstName, session.lastName].filter(Boolean).join(' ') || 'Technicien'
    downloadReportPdf(technicienName, pdfData, report.notes).catch(() => {})
  }

  const send = async () => {
    if (!session || !email.trim()) return
    setBusy(true)
    setError(null)
    setSent(false)
    try {
      await sendReportEmail(session.sessionId, report.id, email.trim())
      setSent(true)
    } catch (e) {
      setError(friendlyError(e, "Erreur d'envoi."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{client || 'Client sans nom'}</DialogTitle>
          <p className="text-xs text-muted-foreground">{report.i_reference} · Rapport d'intervention</p>
        </DialogHeader>

        <Button variant="outline" className="w-full justify-start gap-2" onClick={download}>
          <Download className="size-4" />
          Télécharger le PDF
        </Button>

        <div className="space-y-2 border-t border-border pt-4">
          <label htmlFor="report-email" className="text-sm font-medium">
            Envoyer par email
          </label>
          <div className="flex gap-2">
            <Input
              id="report-email"
              type="email"
              inputMode="email"
              placeholder="client@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            <Button onClick={send} disabled={busy || !email.trim()} className="shrink-0 gap-1.5">
              <Mail className="size-4" />
              Envoyer
            </Button>
          </div>
          {sent && <p className="text-xs text-success">Rapport envoyé.</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
