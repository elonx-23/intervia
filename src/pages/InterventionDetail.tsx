import { Check, ChevronRight, Copy, FileText, Navigation } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AddressField } from '@/components/AddressField'
import { PhotoUploader } from '@/components/PhotoUploader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/layout/EmptyState'
import { ErrorState } from '@/components/layout/ErrorState'
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
  buildWhatsAppText,
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
  const [editing, setEditing] = React.useState(false)
  const [photosSaving, setPhotosSaving] = React.useState(false)
  const [form, setForm] = React.useState({
    clientFirstName: '',
    clientLastName: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
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
        <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
      </Page>
    )
  }

  const technicianName = technicians.find((t) => t.id === intervention.technicien_id)
  const client = [intervention.client_first_name, intervention.client_last_name]
    .filter(Boolean)
    .join(' ')

  const copyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(buildWhatsAppText(intervention))
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
        <div className="flex items-center justify-between">
          <Badge>{STATUS_LABELS[intervention.status]}</Badge>
          <div className="flex gap-1">
            {isAdmin && documents.length === 0 && (
              <Button variant="ghost" size="sm" onClick={createDevisFromIntervention} disabled={creatingDevis}>
                <FileText className="size-4" /> Devis
              </Button>
            )}
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={copyWhatsApp}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                WhatsApp
              </Button>
            )}
          </div>
        </div>

        {editing ? (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Prénom</Label>
                  <Input
                    value={form.clientFirstName}
                    onChange={(e) => setForm((f) => ({ ...f, clientFirstName: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Nom</Label>
                  <Input
                    value={form.clientLastName}
                    onChange={(e) => setForm((f) => ({ ...f, clientLastName: e.target.value }))}
                  />
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
              <div className="flex flex-col gap-2">
                <Label>Type</Label>
                <Input
                  value={form.interventionType}
                  onChange={(e) => setForm((f) => ({ ...f, interventionType: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Montant (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
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
            <CardContent className="flex flex-col gap-2">
              <p className="font-medium">{client || 'Client sans nom'}</p>
              {intervention.phone && <p className="text-sm text-muted-foreground">{intervention.phone}</p>}
              {intervention.address && <p className="text-sm text-muted-foreground">{intervention.address}</p>}
              <p className="text-sm">{intervention.intervention_type}</p>
              {intervention.description && <p className="text-sm text-muted-foreground">{intervention.description}</p>}
              <p className="text-sm">
                💰 Tarif : {intervention.amount != null ? `${intervention.amount} €` : 'non défini'}
              </p>
              {isAdmin && (
                <p className="text-xs text-muted-foreground">
                  Créée le {new Date(intervention.created_at).toLocaleString('fr-FR')}
                </p>
              )}
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
                        <Badge variant={d.status === 'payee' || d.status === 'signe' ? 'success' : 'outline'}>
                          {statusLabel}
                        </Badge>
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
                  onClick={() =>
                    session && runAction(() => updateInterventionStatus(session.sessionId, intervention.id, 'validee'))
                  }
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
              <a
                href={`https://waze.com/ul?q=${encodeURIComponent(intervention.address)}&navigate=yes`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="outline" size="lg" className="w-full">
                  <Navigation className="size-4" /> Ouvrir dans Waze
                </Button>
              </a>
            )}
            {intervention.status === 'assignee' && (
              <Button
                size="lg"
                disabled={busy}
                onClick={() =>
                  session && runAction(() => updateInterventionStatus(session.sessionId, intervention.id, 'acceptee'))
                }
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
                onClick={() =>
                  session && runAction(() => updateInterventionStatus(session.sessionId, intervention.id, 'terminee'))
                }
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
