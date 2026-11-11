import { Check, ChevronRight, Copy, FileText, KeyRound, MapPin, Navigation, Phone, PhoneIncoming } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AddressField } from '@/components/AddressField'
import { PhotoUploader } from '@/components/PhotoUploader'
import { CallSummary } from '@/components/CallSummary'
import { WhatsAppSendButton, WhatsAppShareStatus } from '@/components/WhatsAppShare'
import { ficheText } from '@/lib/whatsapp'
import { INTERVENTION_TONE, TONE_ICON, documentTone, friendlyDate } from '@/lib/tones'
import { TradeIcon } from '@/components/TradeIcon'
import { RecordingPlayer } from '@/components/RecordingPlayer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/NumberInput'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/layout/EmptyState'
import { ErrorState } from '@/components/layout/ErrorState'
import { Loader } from '@/components/Loader'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { useLiveEvents } from '@/hooks/useLiveEvents'
import {
  createDevis,
  DEVIS_STATUS_LABELS,
  FACTURE_STATUS_LABELS,
  listDocumentsByIntervention,
  totalTTC,
  type PseDocument,
} from '@/lib/documents'
import { friendlyError } from '@/lib/errors'
import {
  assignIntervention,
  getIntervention,
  listTechnicians,
  STATUS_LABELS,
  updateIntervention,
  updateInterventionPhotos,
  updateInterventionStatus,
  type Intervention,
  type Technician,
} from '@/lib/interventions'
import { presetsFor } from '@/lib/itemPresets'
import { formatPhone } from '@/lib/utils'

export default function InterventionDetail() {
  const { id } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const isAdmin = session?.role === 'admin'
  const [creatingDevis, setCreatingDevis] = React.useState(false)

  const [intervention, setIntervention] = React.useState<Intervention | null>(null)
  const [documents, setDocuments] = React.useState<PseDocument[]>([])
  const [technicians, setTechnicians] = React.useState<Technician[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [shareKey, setShareKey] = React.useState(0)
  const [editing, setEditing] = React.useState(false)
  const [photosSaving, setPhotosSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    clientFirstName: '',
    clientLastName: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    floor: '',
    accessCodes: '',
    interventionType: '',
    description: '',
    amount: '',
  })

  const load = React.useCallback(async () => {
    if (!session || !id) return
    try {
      const data = await getIntervention(session.sessionId, id)
      setIntervention(data)
      setForm({
        clientFirstName: data.client_first_name,
        clientLastName: data.client_last_name,
        phone: data.phone ?? '',
        address: data.address ?? '',
        postalCode: data.postal_code ?? '',
        city: data.city ?? '',
        floor: data.floor ?? '',
        accessCodes: data.access_codes ?? '',
        interventionType: data.intervention_type,
        description: data.description ?? '',
        amount: data.amount != null ? String(data.amount) : '',
      })
    } catch (e) {
      setError(friendlyError(e, 'Erreur de chargement.'))
    }
  }, [session, id])

  React.useEffect(() => {
    load()
  }, [load])

  const loadDocuments = React.useCallback(() => {
    if (!session || !id) return
    listDocumentsByIntervention(session.sessionId, id)
      .then(setDocuments)
      .catch(() => {})
  }, [session, id])

  React.useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  React.useEffect(() => {
    if (!session || !isAdmin) return
    listTechnicians(session.sessionId)
      .then(setTechnicians)
      .catch(() => {})
  }, [session, isAdmin])

  // Actualisation en tâche de fond dès qu'un autre appareil (admin ↔
  // technicien) modifie cette fiche ou ses devis/factures — poussé par le
  // serveur en temps réel (SSE), pas un sondage. Pendant que l'utilisateur
  // édite le formulaire, on ne retouche pas ses champs en cours de saisie —
  // seuls les documents liés (toujours en lecture seule ici) se rafraîchissent.
  useLiveEvents(
    ['interventions_changed', 'documents_changed'],
    React.useCallback(() => {
      if (!editing) load()
      loadDocuments()
    }, [editing, load, loadDocuments]),
  )

  // Une erreur avant tout chargement réussi (accès refusé, fiche
  // introuvable…) prend toute la page — il n'y a rien d'autre à montrer. Une
  // fois la fiche chargée, une erreur d'action (échec d'enregistrement…) ne
  // doit plus jamais la faire disparaître : elle reste en bannière en bas.
  if (error && !intervention) {
    return (
      <Page title="Fiche intervention">
        <ErrorState label={error} onBack={() => navigate(-1)} />
      </Page>
    )
  }

  if (!intervention) {
    return (
      <Page title="Fiche intervention">
        <Loader className="py-8" />
      </Page>
    )
  }

  const technicianName = technicians.find((t) => t.id === intervention.technicien_id)
  const client = [intervention.client_first_name, intervention.client_last_name].filter(Boolean).join(' ')

  const copyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(ficheText(intervention))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard indisponible — pas bloquant
    }
  }

  // Le devis est créé tout de suite (numéro réel attribué) puis on atterrit
  // directement sur sa fiche — pas d'écran de création séparé, comme sur le
  // reste de l'app.
  const createDevisFromIntervention = async () => {
    if (!session || creatingDevis) return
    setCreatingDevis(true)
    try {
      const created = await createDevis(session.sessionId, {
        interventionId: intervention.id,
        clientFirstName: intervention.client_first_name,
        clientLastName: intervention.client_last_name,
        phone: intervention.phone ?? '',
        address: intervention.address ?? '',
        postalCode: intervention.postal_code ?? '',
        city: intervention.city ?? '',
        email: '',
        items: presetsFor(intervention.intervention_type),
        vatRate: 10,
        notes: '',
        validityDate: null,
        photosBefore: [],
      })
      navigate(`/devis/${created.id}/modifier`)
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la création du devis.'))
      setCreatingDevis(false)
    }
  }

  // "Démarrer l'intervention" fait tout d'un coup pour le technicien : passe
  // l'intervention en cours, crée (ou retrouve, si déjà fait) son devis, et
  // atterrit directement dessus — plus besoin de naviguer manuellement vers
  // "Devis" ensuite, il enchaîne directement sur les étapes.
  const startIntervention = async () => {
    if (!session || busy) return
    setBusy(true)
    setError(null)
    try {
      await updateInterventionStatus(session.sessionId, intervention.id, 'en_cours')
      const existingDevis = documents.find((d) => d.kind === 'devis')
      if (existingDevis) {
        navigate(`/devis/${existingDevis.id}/modifier`)
        return
      }
      const created = await createDevis(session.sessionId, {
        interventionId: intervention.id,
        clientFirstName: intervention.client_first_name,
        clientLastName: intervention.client_last_name,
        phone: intervention.phone ?? '',
        address: intervention.address ?? '',
        postalCode: intervention.postal_code ?? '',
        city: intervention.city ?? '',
        email: '',
        items: presetsFor(intervention.intervention_type),
        vatRate: 10,
        notes: '',
        validityDate: null,
        photosBefore: [],
      })
      navigate(`/devis/${created.id}/modifier`)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
      setBusy(false)
    }
  }

  const runAction = async (fn: () => Promise<Intervention>) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await fn()
      setIntervention(updated)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setBusy(false)
    }
  }

  const savePhotos = async (photos: string[]) => {
    if (!session) return
    setIntervention((prev) => (prev ? { ...prev, photos } : prev))
    setPhotosSaving(true)
    try {
      await updateInterventionPhotos(session.sessionId, intervention.id, photos)
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'enregistrement des photos."))
    } finally {
      setPhotosSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!session) return
    await runAction(() =>
      updateIntervention(session.sessionId, intervention.id, {
        clientFirstName: form.clientFirstName,
        clientLastName: form.clientLastName,
        phone: form.phone,
        address: form.address,
        postalCode: form.postalCode,
        city: form.city,
        floor: form.floor,
        accessCodes: form.accessCodes,
        interventionType: form.interventionType,
        description: form.description,
        amount: form.amount ? Number(form.amount) : null,
        technicienId: intervention.technicien_id,
      }),
    )
    setEditing(false)
  }

  return (
    <Page title={intervention.reference}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={INTERVENTION_TONE[intervention.status]} className="px-3 py-1 text-[13px]">
              {STATUS_LABELS[intervention.status]}
            </Badge>
            {isAdmin && <span className="text-xs text-muted-foreground">Créée {friendlyDate(intervention.created_at).toLowerCase()}</span>}
          </div>
          {/* Actions : grille qui passe à la ligne — jamais de débordement. */}
          {isAdmin && (
            <div className="flex gap-2 *:min-w-0 *:flex-1">
              {documents.length === 0 && (
                <Button variant="outline" size="sm" className="w-full" onClick={createDevisFromIntervention} disabled={creatingDevis}>
                  <FileText className="size-4 text-tone-violet" /> Devis
                </Button>
              )}
              <WhatsAppSendButton intervention={intervention} onSent={() => setShareKey((k) => k + 1)} className="w-full" />
              <Button variant="outline" size="sm" className="w-full" onClick={copyWhatsApp}>
                {copied ? <Check className="size-4 text-tone-green" /> : <Copy className="size-4" />}
                {copied ? 'Copié' : 'Copier'}
              </Button>
            </div>
          )}
        </div>

        {isAdmin && <WhatsAppShareStatus intervention={intervention} refreshKey={shareKey} />}

        {isAdmin && intervention.source_call_id && session && (
          <div className="flex flex-col gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <PhoneIncoming className="size-4 text-sky-600 dark:text-sky-400" />
              Créée automatiquement depuis l'appel
            </p>
            <p className="text-xs text-muted-foreground">
              L'IA a écouté l'appel, rempli la fiche, relu chaque information et vérifié l'adresse dans la base nationale des adresses.
            </p>
            <RecordingPlayer callId={intervention.source_call_id} sessionId={session.sessionId} />
            <CallSummary callId={intervention.source_call_id} sessionId={session.sessionId} />
          </div>
        )}

        {editing ? (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Prénom</Label>
                  <Input value={form.clientFirstName} onChange={(e) => setForm((f) => ({ ...f, clientFirstName: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Nom</Label>
                  <Input value={form.clientLastName} onChange={(e) => setForm((f) => ({ ...f, clientLastName: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Téléphone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Adresse</Label>
                <AddressField
                  value={form.address}
                  onChange={(address) => setForm((f) => ({ ...f, address }))}
                  onSelect={({ postcode, city }) => setForm((f) => ({ ...f, postalCode: postcode, city }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Code postal</Label>
                  <Input value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Ville</Label>
                  <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Étage</Label>
                  <Input value={form.floor} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Codes d'accès</Label>
                  <Input
                    value={form.accessCodes}
                    onChange={(e) => setForm((f) => ({ ...f, accessCodes: e.target.value }))}
                    placeholder="Digicode, interphone…"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Type</Label>
                <Input value={form.interventionType} onChange={(e) => setForm((f) => ({ ...f, interventionType: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Montant (€)</Label>
                <NumberInput
                  value={form.amount ? Number(String(form.amount).replace(',', '.')) : 0}
                  onValueChange={(v) => setForm((f) => ({ ...f, amount: v ? String(v) : '' }))}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(false)} disabled={busy}>
                  Annuler
                </Button>
                <Button className="flex-1" onClick={saveEdit} disabled={busy}>
                  Enregistrer
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-4">
              {/* En-tête : métier (pastille colorée au statut), client, prix annoncé. */}
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${TONE_ICON[INTERVENTION_TONE[intervention.status]]}`}
                >
                  <TradeIcon trade={intervention.intervention_type} className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{client || 'Client sans nom'}</p>
                  <p className="truncate text-sm text-muted-foreground">{intervention.intervention_type || 'Type non précisé'}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold">
                    {intervention.amount != null ? `${String(intervention.amount).replace('.', ',')} €` : '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">prix annoncé</p>
                </div>
              </div>

              {intervention.description && <p className="rounded-xl bg-secondary/60 px-3 py-2.5 text-sm">{intervention.description}</p>}

              <div className="flex flex-col gap-2.5 text-sm">
                {intervention.phone && (
                  <a href={`tel:${intervention.phone.replace(/\s/g, '')}`} className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-green-soft text-tone-green-ink">
                      <Phone className="size-4" />
                    </span>
                    <span className="font-medium">{formatPhone(intervention.phone)}</span>
                  </a>
                )}
                {(intervention.address || intervention.city) && (
                  <a
                    href={`https://waze.com/ul?q=${encodeURIComponent([intervention.address, [intervention.postal_code, intervention.city].filter(Boolean).join(' ')].filter(Boolean).join(', '))}&navigate=yes`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-blue-soft text-tone-blue-ink">
                      <MapPin className="size-4" />
                    </span>
                    <span className="min-w-0">
                      {[intervention.address, [intervention.postal_code, intervention.city].filter(Boolean).join(' ')]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </a>
                )}
                {(intervention.floor || intervention.access_codes) && (
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-amber-soft text-tone-amber-ink">
                      <KeyRound className="size-4" />
                    </span>
                    <span className="min-w-0">
                      {[
                        intervention.floor && `Étage ${intervention.floor.replace(/^étage\s*/i, '')}`,
                        intervention.access_codes && `Code ${intervention.access_codes}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <Button variant="outline" size="sm" className="mt-2 self-start" onClick={() => setEditing(true)}>
                  Modifier
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {documents.length > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-2">
              <Label>Devis &amp; factures</Label>
              <div className="flex flex-col gap-2">
                {documents.map((d) => {
                  const ttc = totalTTC(d.items, d.vat_rate, d.discount_type, d.discount_value)
                  const statusLabel =
                    d.kind === 'devis'
                      ? DEVIS_STATUS_LABELS[d.status as keyof typeof DEVIS_STATUS_LABELS]
                      : FACTURE_STATUS_LABELS[d.status as keyof typeof FACTURE_STATUS_LABELS]
                  return (
                    <Link
                      key={d.id}
                      to={`/${d.kind === 'devis' ? 'devis' : 'factures'}/${d.id}/modifier`}
                      className="liquid flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/40 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {d.kind === 'devis' ? 'Devis' : 'Facture'} {d.number}
                        </p>
                        <Badge variant={documentTone(d.kind, d.status)}>{statusLabel}</Badge>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="font-semibold tabular-nums">{ttc.toFixed(2)} €</span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Photos</Label>
              {photosSaving && <span className="text-xs text-muted-foreground">Enregistrement…</span>}
            </div>
            <PhotoUploader folder="interventions" photos={intervention.photos} onChange={savePhotos} />
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardContent className="flex flex-col gap-2">
              <Label>Technicien assigné</Label>
              <Select
                value={intervention.technicien_id ?? '__none__'}
                disabled={busy}
                onValueChange={(v) => {
                  if (!session || v === '__none__') return
                  runAction(() => assignIntervention(session.sessionId, intervention.id, v))
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Non assigné</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {intervention.status === 'terminee' && (
                <Button
                  disabled={busy}
                  onClick={() => session && runAction(() => updateInterventionStatus(session.sessionId, intervention.id, 'validee'))}
                >
                  Valider l'intervention
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {!isAdmin && (
          <div className="flex flex-col gap-2">
            {intervention.address && ['assignee', 'acceptee'].includes(intervention.status) && (
              <a href={`https://waze.com/ul?q=${encodeURIComponent(intervention.address)}&navigate=yes`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="lg" className="w-full">
                  <Navigation className="size-4" /> Ouvrir dans Waze
                </Button>
              </a>
            )}
            {intervention.status === 'assignee' && (
              <Button
                size="lg"
                disabled={busy}
                onClick={() => session && runAction(() => updateInterventionStatus(session.sessionId, intervention.id, 'acceptee'))}
              >
                Accepter l'intervention
              </Button>
            )}
            {intervention.status === 'acceptee' && (
              <Button size="lg" disabled={busy} onClick={startIntervention}>
                Démarrer l'intervention
              </Button>
            )}
            {intervention.status === 'en_cours' && (
              <Button
                size="lg"
                disabled={busy}
                onClick={() => session && runAction(() => updateInterventionStatus(session.sessionId, intervention.id, 'terminee'))}
              >
                Terminer l'intervention
              </Button>
            )}
            {(intervention.status === 'terminee' || intervention.status === 'validee') && (
              <EmptyState label="Intervention terminée, en attente de validation" />
            )}
          </div>
        )}

        {technicianName && (
          <p className="text-center text-sm text-muted-foreground">
            Assignée à {technicianName.first_name} {technicianName.last_name}
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </Page>
  )
}
