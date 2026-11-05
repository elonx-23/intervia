import {
  Camera,
  Check,
  ClipboardList,
  Clock,
  Download,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  Receipt,
  Share2,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { AddressField } from '@/components/AddressField'
import { DocumentEditHeader, type DocumentEditTab } from '@/components/DocumentEditHeader'
import { EmailTracking, HistoryTimeline, type HistoryEvent } from '@/components/DocumentHistory'
import { PdfViewer } from '@/components/DocumentPdfViewer'
import { InterventionContext } from '@/components/InterventionContext'
import { Loader } from '@/components/Loader'
import { PhotoUploader } from '@/components/PhotoUploader'
import { SendFab } from '@/components/SendFab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useEditorSwipe } from '@/hooks/useEditorSwipe'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import { useAuth } from '@/lib/auth'
import { totalTTC } from '@/lib/documents'
import { friendlyError } from '@/lib/errors'
import { deleteReport, draftReportWithAi, getReport, sendReportEmail, updateReport, type ReportFull, type ReportPatch } from '@/lib/reports'
import { shareFile } from '@/lib/sharePdf'
import { formatEuro } from '@/lib/utils'
import { reportDuration } from '../../shared/reportPdf.mjs'

const EDITOR_TABS = ['modifier', 'apercu', 'historique'] as const

// Éléments fréquents : un appui les ajoute à la liste pour l'IA.
const SUGGESTIONS = [
  "Tentative d'effraction",
  'Porte claquée',
  'Perte de clés',
  'Vol de clés',
  'Clé cassée dans la serrure',
  'Serrure bloquée',
  'Cylindre arraché',
  'Porte blindée',
  'Ouverture fine sans dégât',
  'Remplacement du cylindre',
  'Mise en sécurité provisoire',
  'Vandalisme',
  "Fuite d'eau",
  'Bris de glace',
  'Client locataire',
]

interface Form {
  title: string
  extra: string
  notes: string
  technicien_name: string
  intervention_type: string
  client_first_name: string
  client_last_name: string
  phone: string
  email: string
  address: string
  postal_code: string
  city: string
  arrival: string
  end: string
  photos: string[]
  motifs: string[]
}

// « 2026-11-04T14:05 » (heure locale, champ datetime-local) ⇄ ISO.
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

function formOf(r: ReportFull): Form {
  return {
    title: r.title ?? '',
    extra: r.extra ?? '',
    notes: r.notes ?? '',
    technicien_name: r.technicien_name ?? '',
    intervention_type: r.intervention_type ?? '',
    client_first_name: r.client_first_name ?? '',
    client_last_name: r.client_last_name ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    address: r.address ?? '',
    postal_code: r.postal_code ?? '',
    city: r.city ?? '',
    arrival: toLocalInput(r.arrival_at),
    end: toLocalInput(r.end_at),
    photos: r.photos ?? [],
    motifs: r.motifs ?? [],
  }
}

function patchOf(f: Form): ReportPatch {
  const { arrival, end, ...rest } = f
  return { ...rest, arrival_at: fromLocalInput(arrival), end_at: fromLocalInput(end) }
}

function SaveIndicator({ state }: { state: 'idle' | 'pending' | 'saving' | 'saved' | 'error' }) {
  if (state === 'saving' || state === 'pending')
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Enregistrement…
      </span>
    )
  if (state === 'error') return <span className="text-destructive">Non enregistré — vérifie ta connexion</span>
  if (state === 'saved')
    return (
      <span className="flex items-center gap-1 text-success">
        <Check className="size-3" /> Enregistré
      </span>
    )
  return null
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function SectionCard({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof Clock
  tone: string
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="gap-3 px-4 py-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={`size-4 ${tone}`} /> {title}
      </p>
      {children}
    </Card>
  )
}

// Rapport d'intervention, ouvert comme un devis ou une facture :
// Modifier (enregistré automatiquement) · Aperçu (le vrai PDF) · Historique.
export default function RapportEdit() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [report, setReport] = React.useState<ReportFull | null>(null)
  const [form, setForm] = React.useState<Form | null>(null)
  const [tab, setTab] = React.useState<DocumentEditTab>('modifier')
  const [saveState, setSaveState] = React.useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [drafting, setDrafting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [emailOpen, setEmailOpen] = React.useState(false)
  const [emailTo, setEmailTo] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [emailError, setEmailError] = React.useState<string | null>(null)
  const savedRef = React.useRef('')
  const fileRef = React.useRef<File | null>(null)

  const goBack = React.useCallback(() => navigate(-1), [navigate])
  useEditorSwipe({ tabs: EDITOR_TABS, tab, setTab, onBack: goBack })

  React.useEffect(() => {
    if (!session || !id) return
    getReport(session.sessionId, id)
      .then((r) => {
        const f = formOf(r)
        savedRef.current = JSON.stringify(patchOf(f))
        setReport(r)
        setForm(f)
      })
      .catch((e) => setError(friendlyError(e, 'Rapport introuvable.')))
  }, [session, id])

  // Email ouvert par le client : l'historique se met à jour tout seul.
  const refresh = React.useCallback(() => {
    if (!session || !id) return
    getReport(session.sessionId, id)
      .then(setReport)
      .catch(() => {})
  }, [session, id])
  useLiveEvents(['documents_changed'], refresh)

  const save = React.useCallback(
    async (patch: ReportPatch, json: string) => {
      if (!session || !id) return
      setSaveState('saving')
      try {
        const updated = await updateReport(session.sessionId, id, patch)
        savedRef.current = json
        setReport(updated)
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    },
    [session, id],
  )

  // Enregistrement automatique, un court instant après la dernière frappe.
  React.useEffect(() => {
    if (!form) return
    const patch = patchOf(form)
    const json = JSON.stringify(patch)
    if (json === savedRef.current) return
    setSaveState('pending')
    const t = setTimeout(() => save(patch, json), 800)
    return () => clearTimeout(t)
  }, [form, save])

  const flush = React.useCallback(async () => {
    if (!form) return
    const patch = patchOf(form)
    const json = JSON.stringify(patch)
    if (json !== savedRef.current) await save(patch, json)
  }, [form, save])

  // Ce que montre l'aperçu (et ce qui part par email) : le rapport tel qu'il
  // est à l'écran, même juste avant l'enregistrement.
  const preview = React.useMemo<ReportFull | null>(() => (report && form ? { ...report, ...patchOf(form) } : null), [report, form])

  // PDF préparé à l'avance : Safari n'autorise le partage que juste après l'appui.
  React.useEffect(() => {
    if (!preview) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const { generateReportPdf } = await import('@/lib/pdf')
        const pdf = await generateReportPdf(preview)
        if (!cancelled)
          fileRef.current = new File([pdf.output('blob') as Blob], `Rapport-${preview.number}.pdf`, { type: 'application/pdf' })
      } catch {
        // le partage retombera sur une génération à la demande
      }
    }, 1200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [preview])

  const pdfFile = async () => {
    if (fileRef.current) return fileRef.current
    const { generateReportPdf } = await import('@/lib/pdf')
    const pdf = await generateReportPdf(preview!)
    return new File([pdf.output('blob') as Blob], `Rapport-${preview!.number}.pdf`, { type: 'application/pdf' })
  }
  const share = async () => preview && shareFile(await pdfFile(), `Rapport d'intervention ${preview.number}`)
  const download = async () => {
    if (!preview) return
    const { downloadReportPdf } = await import('@/lib/pdf')
    downloadReportPdf(preview)
  }

  const runAi = React.useCallback(async () => {
    if (!session || !id || !form) return
    setDrafting(true)
    setError(null)
    try {
      await flush()
      const updated = await draftReportWithAi(session.sessionId, id, form.extra)
      const next = { ...form, title: updated.title, notes: updated.notes, motifs: updated.motifs }
      savedRef.current = JSON.stringify(patchOf(next))
      setReport(updated)
      setForm((f) => (f ? { ...f, title: updated.title, notes: updated.notes, motifs: updated.motifs } : f))
    } catch (e) {
      setError(friendlyError(e, 'La rédaction a échoué.'))
    } finally {
      setDrafting(false)
    }
  }, [session, id, form, flush])

  // Rapport tout juste créé : l'IA le rédige aussitôt (une seule fois).
  const autoAiRef = React.useRef(false)
  React.useEffect(() => {
    if (!report || !form || autoAiRef.current || params.get('ia') !== '1') return
    autoAiRef.current = true
    setParams({}, { replace: true })
    if (report.ai_available && !report.ai_at) runAi()
  }, [report, form, params, setParams, runAi])

  const sendEmail = async () => {
    if (!session || !id || !preview) return
    setSending(true)
    setEmailError(null)
    try {
      await flush()
      const { generateReportPdf } = await import('@/lib/pdf')
      const pdf = await generateReportPdf(preview)
      const base64 = (pdf.output('datauristring') as string).split(',')[1]
      const updated = await sendReportEmail(session.sessionId, id, emailTo.trim(), base64)
      setReport(updated)
      setForm((f) => (f && !f.email ? { ...f, email: emailTo.trim() } : f))
      setEmailOpen(false)
      setTab('historique')
      window.scrollTo({ top: 0 })
    } catch (e) {
      setEmailError(friendlyError(e, "L'envoi a échoué."))
    } finally {
      setSending(false)
    }
  }

  const remove = async () => {
    if (!session || !id || !window.confirm('Supprimer ce rapport ?')) return
    try {
      await deleteReport(session.sessionId, id)
      navigate(-1)
    } catch (e) {
      setError(friendlyError(e, 'Suppression impossible.'))
    }
  }

  const loadPdf = React.useCallback(async () => (await import('@/lib/pdf')).generateReportPdf(preview!), [preview])

  if (error && !report) return <p className="p-6 text-sm text-destructive">{error}</p>
  if (!report || !form || !session) return <Loader className="min-h-dvh" />

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))
  const addExtra = (s: string) => set('extra', form.extra.trim() ? `${form.extra.trim().replace(/[,.;]$/, '')}, ${s.toLowerCase()}` : s)
  const length = reportDuration(fromLocalInput(form.arrival), fromLocalInput(form.end))
  const doc = report.document
  const docTotal = doc ? totalTTC(doc.items, doc.vat_rate, doc.discount_type as 'amount' | 'percent', doc.discount_value) : 0

  const historyEvents: HistoryEvent[] = [
    {
      icon: ClipboardList,
      label: `Rapport créé${report.created_by_name ? ` par ${report.created_by_name}` : ''}`,
      date: report.created_at,
      detail: (report.intervention || doc) && (
        <p className="text-xs text-muted-foreground">
          D'après{' '}
          {[
            report.intervention && `la fiche ${report.intervention.reference}`,
            doc && `${doc.kind === 'facture' ? 'la facture' : 'le devis'} ${doc.number}`,
          ]
            .filter(Boolean)
            .join(' et ')}
        </p>
      ),
    },
  ]
  if (report.ai_at) historyEvents.push({ icon: Sparkles, label: "Rédigé par l'IA", date: report.ai_at })
  if (report.updated_at && new Date(report.updated_at).getTime() - new Date(report.ai_at ?? report.created_at).getTime() > 60_000) {
    historyEvents.push({ icon: FileText, label: 'Dernière modification', date: report.updated_at })
  }
  for (const email of report.emails) {
    historyEvents.push({
      icon: email.status === 'echec' ? TriangleAlert : Mail,
      label: `Envoyé par email${email.to_email ? ` à ${email.to_email}` : ''}`,
      date: email.sent_at,
      detail: <EmailTracking email={email} />,
    })
  }

  return (
    <>
      <DocumentEditHeader
        title={`Rapport ${report.number}`}
        tab={tab}
        onTabChange={setTab}
        menu={
          <>
            <DropdownMenuItem onClick={share}>
              <Share2 className="size-4" /> Partager le PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={download}>
              <Download className="size-4" /> Télécharger le PDF
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={remove}>
              <Trash2 className="size-4" /> Supprimer
            </DropdownMenuItem>
          </>
        }
      />
      <main className="flex-1 px-4 pb-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 7.75rem)' }}>
        <div className="flex flex-col gap-4 pb-16">
          {tab === 'modifier' && (
            <>
              <div className="flex min-h-5 items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">
                  {[
                    report.intervention && `Fiche ${report.intervention.reference}`,
                    doc && `${doc.kind === 'facture' ? 'Facture' : 'Devis'} ${doc.number}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <SaveIndicator state={saveState} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}

              {session.role === 'admin' && report.intervention_id && <InterventionContext interventionId={report.intervention_id} />}

              {/* Rédaction par l'IA, avec les éléments ajoutés. */}
              <Card className="gap-3 border-tone-violet/30 px-4 py-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-tone-violet" /> Rédaction par l'IA
                </p>
                <Field label="Éléments à ajouter au rapport">
                  <Textarea
                    rows={3}
                    value={form.extra}
                    onChange={(e) => set('extra', e.target.value)}
                    placeholder="Ex. tentative d'effraction, cylindre arraché, porte blindée, client locataire…"
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5" data-no-swipe>
                  {SUGGESTIONS.filter((s) => !form.extra.toLowerCase().includes(s.toLowerCase())).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addExtra(s)}
                      className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs font-medium text-foreground active:scale-95"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={runAi}
                  disabled={drafting || !report.ai_available}
                  className="bg-tone-violet text-white hover:bg-tone-violet/90"
                >
                  {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {drafting ? 'Rédaction en cours…' : report.ai_at ? "Réécrire le rapport avec l'IA" : "Rédiger le rapport avec l'IA"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {report.ai_available
                    ? "L'IA s'appuie sur la fiche, les horaires, la facture, l'appel du client, les photos et tes éléments. Le compte-rendu ci-dessous est remplacé."
                    : "La rédaction par l'IA n'est pas activée pour ton entreprise : écris le compte-rendu ci-dessous."}
                </p>
              </Card>

              <SectionCard icon={MessageSquareText} tone="text-tone-blue" title="Objet et compte-rendu">
                <Field label="Objet de l'intervention">
                  <Input
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder="Ex. Ouverture de porte et remplacement du cylindre"
                    disabled={drafting}
                  />
                </Field>
                {form.motifs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.motifs.map((m) => (
                      <Badge key={m} variant="amber" className="gap-1 pr-1">
                        {m}
                        <button
                          type="button"
                          aria-label={`Retirer ${m}`}
                          onClick={() =>
                            set(
                              'motifs',
                              form.motifs.filter((x) => x !== m),
                            )
                          }
                          className="rounded-full p-0.5 hover:bg-black/10"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Field label="Compte-rendu">
                  <div className="relative">
                    <Textarea
                      rows={16}
                      value={form.notes}
                      onChange={(e) => set('notes', e.target.value)}
                      disabled={drafting}
                      className="text-[15px] leading-relaxed"
                      placeholder={"Motif de l'intervention :\n…\n\nConstat à l'arrivée :\n…\n\nTravaux réalisés :\n- …"}
                    />
                    {drafting && (
                      <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-background/75 text-sm font-medium backdrop-blur-sm">
                        <Loader2 className="size-4 animate-spin text-tone-violet" /> L'IA rédige le rapport…
                      </div>
                    )}
                  </div>
                </Field>
                <p className="text-xs text-muted-foreground">
                  Un titre de section seul sur sa ligne, terminé par « : ». Une liste avec « - ».
                </p>
              </SectionCard>

              <SectionCard icon={Clock} tone="text-tone-cyan" title="Horaires et métier">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Arrivée sur place">
                    <Input
                      type="datetime-local"
                      value={form.arrival}
                      onChange={(e) => set('arrival', e.target.value)}
                      className="max-w-none"
                    />
                  </Field>
                  <Field label="Fin de l'intervention">
                    <Input type="datetime-local" value={form.end} onChange={(e) => set('end', e.target.value)} className="max-w-none" />
                  </Field>
                </div>
                {length && (
                  <p className="text-xs text-muted-foreground">
                    Durée sur place : <span className="font-semibold text-foreground">{length}</span>
                  </p>
                )}
                <Field label="Métier">
                  <Input
                    value={form.intervention_type}
                    onChange={(e) => set('intervention_type', e.target.value)}
                    placeholder="Serrurerie"
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  Le nom du technicien n'apparaît jamais sur le rapport : seule l'entreprise y figure.
                </p>
              </SectionCard>

              <SectionCard icon={UserRound} tone="text-tone-blue" title="Client et lieu d'intervention">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prénom">
                    <Input value={form.client_first_name} onChange={(e) => set('client_first_name', e.target.value)} />
                  </Field>
                  <Field label="Nom">
                    <Input value={form.client_last_name} onChange={(e) => set('client_last_name', e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Téléphone">
                    <Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
                  </Field>
                  <Field label="Email">
                    <Input type="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
                  </Field>
                </div>
                <Field label="Adresse">
                  <AddressField
                    value={form.address}
                    onChange={(address) => set('address', address)}
                    onSelect={({ postcode, city }) => setForm((f) => (f ? { ...f, postal_code: postcode, city } : f))}
                  />
                </Field>
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <Field label="Code postal">
                    <Input inputMode="numeric" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
                  </Field>
                  <Field label="Ville">
                    <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
                  </Field>
                </div>
              </SectionCard>

              <SectionCard icon={Camera} tone="text-tone-orange" title={`Photos${form.photos.length ? ` (${form.photos.length})` : ''}`}>
                <PhotoUploader folder="rapports" photos={form.photos} onChange={(photos) => set('photos', photos)} />
                <p className="text-xs text-muted-foreground">
                  Les photos de la fiche et de la facture sont reprises. Elles figurent en annexe du PDF.
                </p>
              </SectionCard>

              {doc && (
                <SectionCard icon={Receipt} tone="text-tone-green" title={doc.kind === 'facture' ? 'Facture liée' : 'Devis lié'}>
                  <Link
                    to={`/${doc.kind === 'facture' ? 'factures' : 'devis'}/${doc.id}/modifier`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {doc.kind === 'facture' ? 'Facture' : 'Devis'} {doc.number}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {doc.items.length} ligne{doc.items.length > 1 ? 's' : ''} reprise{doc.items.length > 1 ? 's' : ''} dans le rapport
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold">{formatEuro(docTotal)}</span>
                  </Link>
                </SectionCard>
              )}
            </>
          )}

          {tab === 'apercu' && preview && (
            <div className="flex flex-col gap-3">
              <Button variant="outline" onClick={download}>
                <Download className="size-4" /> Télécharger le PDF
              </Button>
              <PdfViewer load={loadPdf} />
            </div>
          )}

          {tab === 'historique' && <HistoryTimeline events={historyEvents} />}
        </div>
      </main>

      {tab === 'modifier' && (
        <SendFab
          disabled={drafting}
          actions={[
            {
              key: 'email',
              label: 'Envoyer par email',
              icon: Mail,
              onClick: () => {
                setEmailTo(form.email)
                setEmailError(null)
                setEmailOpen(true)
              },
            },
            { key: 'share', label: 'Partager le PDF', icon: Share2, onClick: share },
          ]}
        />
      )}

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Envoyer le rapport</DialogTitle>
          </DialogHeader>
          <Field label="Adresse email">
            <Input
              type="email"
              inputMode="email"
              autoFocus
              placeholder="client@exemple.fr"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Le PDF du rapport, photos comprises, est joint à l'email. Tu verras dans l'historique s'il a été ouvert.
          </p>
          {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
              Annuler
            </Button>
            <Button onClick={sendEmail} disabled={sending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo.trim())}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
