import * as React from 'react'
import { useNavigate } from 'react-router-dom'

import { AddressField } from '@/components/AddressField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { createIntervention, listTechnicians, type Technician } from '@/lib/interventions'

export default function InterventionCreate() {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [technicians, setTechnicians] = React.useState<Technician[]>([])
  const [clientFirstName, setClientFirstName] = React.useState('')
  const [clientLastName, setClientLastName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [postalCode, setPostalCode] = React.useState('')
  const [city, setCity] = React.useState('')
  const [interventionType, setInterventionType] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [technicienId, setTechnicienId] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!session) return
    listTechnicians(session.sessionId)
      .then((list) => setTechnicians(list.filter((t) => t.active)))
      .catch(() => {})
  }, [session])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session) return
    setSaving(true)
    setError(null)
    try {
      const created = await createIntervention(session.sessionId, {
        clientFirstName,
        clientLastName,
        phone,
        address,
        postalCode,
        city,
        interventionType,
        description,
        amount: amount ? Number(amount) : null,
        technicienId: technicienId || null,
      })
      navigate(`/interventions/${created.id}`, { replace: true })
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la création.'))
      setSaving(false)
    }
  }

  return (
    <Page title="Créer une intervention">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fn">Prénom</Label>
            <Input id="fn" value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ln">Nom</Label>
            <Input id="ln" value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="address">Adresse</Label>
          <AddressField
            value={address}
            onChange={setAddress}
            onSelect={({ postcode, city }) => {
              setPostalCode(postcode)
              setCity(city)
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="postalCode">Code postal</Label>
            <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="city">Ville</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Type d'intervention</Label>
          <Input
            id="type"
            value={interventionType}
            onChange={(e) => setInterventionType(e.target.value)}
            placeholder="Plomberie, électricité…"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Montant (€)</Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tech">Technicien</Label>
            <Select
              value={technicienId || '__none__'}
              onValueChange={(v) => setTechnicienId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger id="tech">
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
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" size="lg" disabled={saving || !interventionType}>
          {saving ? 'Création…' : 'Créer l’intervention'}
        </Button>
      </form>
    </Page>
  )
}
