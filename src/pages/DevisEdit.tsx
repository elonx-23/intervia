import { ArrowDown, ArrowUp, ChevronUp, CirclePlus, Copy, Download, FileCheck2, Mail, MessageSquare, Paperclip, PenLine, Settings2, Share2, Trash2, User } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AddressField } from '@/components/AddressField'
import { ClientPicker } from '@/components/ClientPicker'
import { CollapsibleRow } from '@/components/CollapsibleRow'
import { DocumentEditHeader, type DocumentEditTab } from '@/components/DocumentEditHeader'
import { DocumentHistory } from '@/components/DocumentHistory'
import { DocumentPdfViewer } from '@/components/DocumentPdfViewer'
import { ItemLabelField } from '@/components/ItemLabelField'
import { LegalClausesCard } from '@/components/LegalClausesCard'
import { PhotoUploader } from '@/components/PhotoUploader'
import { SendFab } from '@/components/SendFab'
import { SignOnDeviceDialog } from '@/components/SignOnDeviceDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import {
  DEVIS_STATUS_LABELS,
  adjustmentKindOf,
  adjustmentLabel,
  convertDevisToFacture,
  deleteDocument,
  discountAmount,
  duplicateDocument,
  getConvertedFacture,
  getDocument,
  itemsTotalHT,
  sendDocumentEmail,
  signedDiscountValue,
  totalTTC,
  updateDocument,
  type AdjustmentKind,
  type DiscountType,
  type DocumentItem,
  type PseDocument,
} from '@/lib/documents'
import { friendlyError } from '@/lib/errors'

export default function DevisEdit() {
  const { id } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()

  const [doc, setDoc] = React.useState<PseDocument | null>(null)
  const [tab, setTab] = React.useState<DocumentEditTab>('modifier')
  const [items, setItems] = React.useState<DocumentItem[]>([])
  // Un seul article ouvert à la fois — les autres restent repliés (nom +
  // prix) pour ne pas noyer le devis sous trop de champs. Ouvrir un article
  // referme automatiquement celui qui l'était.
  const [expandedItem, setExpandedItem] = React.useState<number | null>(null)
  const [form, setForm] = React.useState({
    clientFirstName: '',
    clientLastName: '',
    phone: '',
    address: '',
    postalCode: '',
    city: '',
    email: '',
    notes: '',
    vatRate: 20,
    validityDate: '',
    discountType: 'amount' as DiscountType,
    discountValue: 0,
  })
  const [photosBefore, setPhotosBefore] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [emailSent, setEmailSent] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [signOpen, setSignOpen] = React.useState(false)
  const [clientOpen, setClientOpen] = React.useState(false)
  const [photoOpen, setPhotoOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [converting, setConverting] = React.useState(false)
  const [convertedFacture, setConvertedFacture] = React.useState<PseDocument | null>(null)
  const skipAutosave = React.useRef(true)
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Snapshot toujours à jour de ce qui compte pour la suppression à
  // l'abandon (voir plus bas) — un ref, pas du state, pour que le cleanup
  // au démontage lise la toute dernière valeur plutôt qu'une fermeture figée
  // sur le premier rendu.
  const latestRef = React.useRef({ session, doc, form, items })
  React.useEffect(() => {
    latestRef.current = { session, doc, form, items }
  })

  // Si on quitte la fiche sans avoir rien saisi (ni client, ni article) —
  // cas d'un devis créé via "+" puis abandonné — on le supprime plutôt que
  // de laisser un brouillon vide traîner en base indéfiniment.
  React.useEffect(() => {
    return () => {
      const { session, doc, form, items } = latestRef.current
      if (!session || !doc) return
      const isEmpty = !form.clientFirstName.trim() && !form.clientLastName.trim() && items.length === 0
      if (isEmpty) {
        deleteDocument(session.sessionId, doc.id).catch(() => {})
      }
    }
  }, [])

  const load = React.useCallback(async () => {
    if (!session || !id) return
    skipAutosave.current = true
    try {
      const d = await getDocument(session.sessionId, id)
      setDoc(d)
      setItems(d.items)
      setPhotosBefore(d.photos_before)
      setForm({
        clientFirstName: d.client_first_name,
        clientLastName: d.client_last_name,
        phone: d.phone ?? '',
        address: d.address ?? '',
        postalCode: d.postal_code ?? '',
        city: d.city ?? '',
        email: d.email ?? '',
        notes: d.notes ?? '',
        vatRate: d.vat_rate,
        validityDate: d.validity_date ?? '',
        discountType: d.discount_type,
        discountValue: d.discount_value,
      })
      getConvertedFacture(session.sessionId, id)
        .then(setConvertedFacture)
        .catch(() => {})
    } catch (e) {
      setError(friendlyError(e, 'Erreur de chargement.'))
    }
  }, [session, id])

  React.useEffect(() => {
    load()
  }, [load])

  // Enregistrement automatique : toute modification (champs, articles,
  // photos) déclenche une sauvegarde après une courte pause, plus besoin de
  // bouton "Enregistrer". La première exécution après un chargement est
  // ignorée pour ne pas re-sauvegarder des données qui viennent d'arriver.
  React.useEffect(() => {
    if (!doc) return
    if (skipAutosave.current) {
      skipAutosave.current = false
      return
    }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      runSave()
    }, 900)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, items, photosBefore])

  // Empêche qu'une sauvegarde automatique déjà "en vol" (déclenchée par le
  // minuteur juste avant qu'on agisse) ne finisse par écraser l'état juste
  // après une action serveur dédiée (signer, transformer en facture…) — on
  // garde la référence à la sauvegarde en cours pour pouvoir l'attendre,
  // pas seulement annuler le minuteur (qui peut déjà s'être déclenché).
  const savePromise = React.useRef<Promise<void> | null>(null)
  const runSave = () => {
    const p = save()
    savePromise.current = p
    p.finally(() => {
      if (savePromise.current === p) savePromise.current = null
    })
    return p
  }
  const flushPendingSave = async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      await runSave()
    } else if (savePromise.current) {
      await savePromise.current
    }
  }

  if (error && !doc) {
    return (
      <div className="flex-1 px-4 pt-24">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }
  if (!doc) {
    return (
      <div className="flex-1 px-4 pt-24">
        <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
      </div>
    )
  }

  const addItem = () => {
    setItems((it) => [...it, { label: '', quantity: 1, unitPrice: 0, itemType: 'service' }])
    setExpandedItem(items.length)
  }
  const updateItem = (i: number, patch: Partial<DocumentItem>) =>
    setItems((it) => it.map((item, idx) => (idx === i ? { ...item, ...patch } : item)))
  const removeItem = (i: number) => {
    setItems((it) => it.filter((_, idx) => idx !== i))
    setExpandedItem((cur) => (cur === null ? null : cur === i ? null : cur > i ? cur - 1 : cur))
  }
  const moveItem = (i: number, dir: -1 | 1) => {
    setItems((it) => {
      const j = i + dir
      if (j < 0 || j >= it.length) return it
      const next = [...it]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setExpandedItem((cur) => (cur === i ? i + dir : cur === i + dir ? i : cur))
  }

  const ht = itemsTotalHT(items)
  const remise = discountAmount(ht, form.discountType, form.discountValue)
  const adj = adjustmentLabel(remise)
  const ttc = totalTTC(items, form.vatRate, form.discountType, form.discountValue)
  const canSign = doc.status === 'brouillon' || doc.status === 'envoye'
  const adjustmentKind = adjustmentKindOf(form.discountValue)
  const setAdjustmentKind = (kind: AdjustmentKind) =>
    setForm((f) => ({ ...f, discountValue: signedDiscountValue(kind, Math.abs(f.discountValue)) }))
  const setAbsDiscountValue = (abs: number) =>
    setForm((f) => ({ ...f, discountValue: signedDiscountValue(adjustmentKindOf(f.discountValue), abs) }))

  const save = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateDocument(session.sessionId, doc.id, {
        interventionId: doc.intervention_id,
        clientFirstName: form.clientFirstName,
        clientLastName: form.clientLastName,
        phone: form.phone,
        address: form.address,
        postalCode: form.postalCode,
        city: form.city,
        email: form.email,
        items,
        vatRate: form.vatRate,
        notes: form.notes,
        validityDate: form.validityDate || null,
        discountType: form.discountType,
        discountValue: form.discountValue,
        photosBefore,
      })
      setDoc(updated)
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'enregistrement."))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!session) return
    const isAdmin = session.role === 'admin'
    const msg = isAdmin
      ? 'Supprimer ce devis ?'
      : "Demander la suppression de ce devis ? Il restera visible (en attente) jusqu'à confirmation par un admin."
    if (!confirm(msg)) return
    await deleteDocument(session.sessionId, doc.id)
    navigate('/devis', { replace: true })
  }

  const duplicate = async () => {
    if (!session || !confirm('Dupliquer ce devis ?')) return
    const copy = await duplicateDocument(session.sessionId, doc.id)
    navigate(`/devis/${copy.id}/modifier`)
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Devis ${doc.number}`, url: signLink })
      } catch {
        // partage annulé par l'utilisateur — rien à faire
      }
    } else {
      navigator.clipboard?.writeText(signLink)
    }
  }

  const convert = async () => {
    if (!session) return
    setConverting(true)
    setError(null)
    try {
      await flushPendingSave()
      const facture = await convertDevisToFacture(session.sessionId, doc.id)
      navigate(`/factures/${facture.id}/modifier`)
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
      setConverting(false)
    }
  }

  const sendEmail = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    setEmailSent(false)
    try {
      await sendDocumentEmail(session.sessionId, doc.id)
      setEmailSent(true)
    } catch (e) {
      setError(friendlyError(e, "Erreur d'envoi."))
    } finally {
      setBusy(false)
    }
  }

  const signLink = `${window.location.origin}/signer/${doc.public_token}`

  const smsLink = () => {
    const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const body = encodeURIComponent(`Bonjour, voici votre devis ${doc.number} : ${signLink}`)
    return `sms:${form.phone}${isApple ? '&' : '?'}body=${body}`
  }

  return (
    <>
      <DocumentEditHeader
        title={doc.number}
        tab={tab}
        onTabChange={setTab}
        menu={
          <>
            <DropdownMenuItem onClick={duplicate}>
              <Copy className="size-4" /> Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={share}>
              <Share2 className="size-4" /> Partager
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
              <Card>
                <CardContent className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold">{doc.number}</p>
                    <p className="text-sm text-muted-foreground">Informations relatives à l'entreprise</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm text-muted-foreground">{new Date(doc.issue_date).toLocaleDateString('fr-FR')}</span>
                    {doc.status !== 'brouillon' && (
                      <Badge variant={doc.status === 'signe' ? 'success' : 'outline'}>
                        {DEVIS_STATUS_LABELS[doc.status as keyof typeof DEVIS_STATUS_LABELS]}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <CollapsibleRow
                    icon={User}
                    open={clientOpen}
                    onToggle={() => setClientOpen((o) => !o)}
                    label={
                      <>
                        <span className="text-muted-foreground">À</span>{' '}
                        <span className="font-semibold text-foreground">
                          {[form.clientFirstName, form.clientLastName].filter(Boolean).join(' ') || 'Client'}
                        </span>
                      </>
                    }
                  >
                    <ClientPicker
                      onPick={(c) =>
                        setForm((f) => ({
                          ...f,
                          clientFirstName: c.firstName,
                          clientLastName: c.lastName,
                          phone: c.phone ?? '',
                          address: c.address ?? '',
                          postalCode: c.postalCode ?? '',
                          city: c.city ?? '',
                          email: c.email ?? '',
                        }))
                      }
                    />
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
                    <div className="flex flex-col gap-2">
                      <Label>Email</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                    </div>
                  </CollapsibleRow>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col gap-3">
                  <Label>Articles</Label>
                  {items.map((item, i) =>
                    expandedItem === i ? (
                      <div key={i} className="flex flex-col gap-2 rounded-xl border border-border/70 bg-secondary/40 p-3">
                        <ItemLabelField
                          value={item.label}
                          onLabelChange={(label) => updateItem(i, { label })}
                          onPick={(preset) =>
                            updateItem(i, {
                              label: preset.label,
                              description: preset.description ?? '',
                              unitPrice: preset.unitPrice,
                              itemType: preset.itemType,
                            })
                          }
                        />
                        <div className="flex items-center justify-between gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            onClick={() => setExpandedItem(null)}
                            aria-label="Replier l'article"
                          >
                            <ChevronUp className="size-4" />
                          </Button>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="size-8" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label="Monter">
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} aria-label="Descendre">
                              <ArrowDown className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive"
                              onClick={() => removeItem(i)}
                              aria-label="Supprimer l'article"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                        <Input
                          placeholder="Description (optionnel)"
                          value={item.description ?? ''}
                          onChange={(e) => updateItem(i, { description: e.target.value })}
                          className="text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-muted-foreground">Quantité</Label>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs text-muted-foreground">Prix unitaire (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Article replié : juste le nom et le prix, pour ne pas
                      // noyer le devis sous les champs de tous les articles à
                      // la fois — un clic le rouvre pour le modifier.
                      <button
                        key={i}
                        type="button"
                        onClick={() => setExpandedItem(i)}
                        className="liquid flex w-full items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/40 p-3 text-left"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">
                          {item.label || 'Article sans nom'}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {(item.quantity * item.unitPrice).toFixed(2)} €
                        </span>
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={addItem}
                    className="liquid flex items-center gap-2 rounded-xl py-2 text-sm font-medium text-primary"
                  >
                    <CirclePlus className="size-5" /> Ajouter un article
                  </button>
                  <div className="flex items-center justify-between border-t border-border/70 pt-3 font-semibold">
                    <span>Sous-total</span>
                    <span>{ht.toFixed(2)} €</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex flex-col gap-4">
                  <CollapsibleRow
                    icon={Settings2}
                    open={settingsOpen}
                    onToggle={() => setSettingsOpen((o) => !o)}
                    label={<span className="text-muted-foreground">Réglages</span>}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex min-w-0 flex-col gap-2">
                        <Label>TVA</Label>
                        <Select value={String(form.vatRate)} onValueChange={(v) => setForm((f) => ({ ...f, vatRate: Number(v) }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0 %</SelectItem>
                            <SelectItem value="5.5">5,5 %</SelectItem>
                            <SelectItem value="10">10 %</SelectItem>
                            <SelectItem value="20">20 %</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2">
                        <Label>Valide jusqu'au</Label>
                        <Input type="date" className="w-full min-w-0" value={form.validityDate} onChange={(e) => setForm((f) => ({ ...f, validityDate: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Remise / Majoration</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={adjustmentKind} onValueChange={(v) => setAdjustmentKind(v as AdjustmentKind)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="remise">Remise</SelectItem>
                            <SelectItem value="majoration">Majoration</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={form.discountType}
                          onValueChange={(v) => setForm((f) => ({ ...f, discountType: v as DiscountType }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="amount">€</SelectItem>
                            <SelectItem value="percent">%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Montant"
                        value={form.discountValue === 0 ? '' : Math.abs(form.discountValue)}
                        onChange={(e) => setAbsDiscountValue(Number(e.target.value))}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Notes</Label>
                      <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                    </div>
                  </CollapsibleRow>

                  <div className="flex flex-col gap-2 border-t border-border/70 pt-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{remise !== 0 ? adj.label : 'Remise'}</span>
                      <span>
                        {remise !== 0 ? `${adj.sign}${adj.amount.toFixed(2)}` : '0,00'} €
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Taxe ({form.vatRate}%)</span>
                      <span>{(ttc - (ht - remise)).toFixed(2)} €</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between border-t border-border/70 pt-3">
                      <span className="text-base font-semibold">Total</span>
                      <span className="text-2xl font-bold text-primary tabular-nums">{ttc.toFixed(2)} €</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {canSign && (
                <Button variant="outline" size="lg" onClick={() => setSignOpen(true)}>
                  <PenLine className="size-4" /> Faire signer sur place
                </Button>
              )}

              <Card>
                <CardContent>
                  <CollapsibleRow
                    icon={Paperclip}
                    open={photoOpen}
                    onToggle={() => setPhotoOpen((o) => !o)}
                    label={<span className="text-muted-foreground">Ajouter une photo</span>}
                  >
                    <PhotoUploader folder="devis-avant" photos={photosBefore} onChange={setPhotosBefore} />
                  </CollapsibleRow>
                </CardContent>
              </Card>

              <LegalClausesCard />

              {error && <p className="text-sm text-destructive">{error}</p>}
              {emailSent && <p className="text-sm text-success">Email envoyé.</p>}

              {doc.status === 'signe' && (
                <div className="flex flex-col gap-1">
                  <Button size="lg" onClick={convert} disabled={converting || items.length === 0}>
                    <FileCheck2 className="size-4" /> {converting ? 'Conversion…' : 'Transformer en facture'}
                  </Button>
                  {items.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground">
                      Ajoute au moins un article pour transformer ce devis en facture.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'apercu' && (
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={async () => {
                  const { downloadDocumentPdf } = await import('@/lib/pdf')
                  downloadDocumentPdf(doc)
                }}
              >
                <Download className="size-4" /> Télécharger le PDF
              </Button>
              <DocumentPdfViewer doc={doc} />
            </div>
          )}

          {tab === 'historique' && <DocumentHistory doc={doc} convertedFacture={convertedFacture} />}
        </div>
      </main>

      {tab === 'modifier' && (
        <SendFab
          disabled={busy}
          actions={[
            {
              key: 'email',
              label: form.email ? 'Envoyer par email' : 'Ajoute un email',
              icon: Mail,
              disabled: busy || !form.email,
              onClick: sendEmail,
            },
            {
              key: 'sms',
              label: form.phone ? 'Envoyer par SMS' : 'Ajoute un téléphone',
              icon: MessageSquare,
              disabled: !form.phone,
              href: form.phone ? smsLink() : undefined,
              onClick: () => {},
            },
          ]}
        />
      )}

      <SignOnDeviceDialog document={doc} open={signOpen} onOpenChange={setSignOpen} onSigned={setDoc} />
    </>
  )
}
