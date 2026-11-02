import { Loader2, Phone, Trash2 } from 'lucide-react'
import * as React from 'react'

import { Loader } from '@/components/Loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import {
  buyNumber,
  listOwnedNumbers,
  releaseNumber,
  searchAvailableNumbers,
  type AvailableNumber,
  type OwnedNumber,
  type TelephonySettings,
} from '@/lib/telephony'

// Onglet Numéros : chercher, acheter et libérer des numéros français sans
// jamais ouvrir le site de Twilio (qui reste le fournisseur réel derrière).
export function NumbersPanel({ settings, onChanged }: { settings: TelephonySettings; onChanged: () => void }) {
  const { session } = useAuth()
  const [owned, setOwned] = React.useState<OwnedNumber[] | null>(null)
  const [available, setAvailable] = React.useState<AvailableNumber[] | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const loadOwned = React.useCallback(() => {
    if (!session) return
    listOwnedNumbers(session.sessionId)
      .then(setOwned)
      .catch((e) => {
        setOwned([])
        setError(`Connexion à Twilio impossible : ${friendlyError(e, 'erreur inconnue')}. Vérifie tes identifiants dans l'onglet Réglages.`)
      })
  }, [session])

  React.useEffect(() => {
    if (settings.configured) loadOwned()
  }, [settings.configured, loadOwned])

  if (!settings.configured) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Connecte d'abord ton compte Twilio dans l'onglet Réglages pour acheter un numéro.
      </p>
    )
  }

  const search = async () => {
    if (!session) return
    setSearching(true)
    setError(null)
    try {
      setAvailable(await searchAvailableNumbers(session.sessionId))
    } catch (e) {
      setError(friendlyError(e, 'Erreur de recherche.'))
    } finally {
      setSearching(false)
    }
  }

  const buy = async (phoneNumber: string) => {
    if (!session) return
    setBusy(phoneNumber)
    setError(null)
    try {
      await buyNumber(session.sessionId, phoneNumber)
      setAvailable(null)
      loadOwned()
      onChanged()
    } catch (e) {
      setError(friendlyError(e, "Erreur lors de l'achat."))
    } finally {
      setBusy(null)
    }
  }

  const release = async (sid: string) => {
    if (!session) return
    setBusy(sid)
    setError(null)
    try {
      await releaseNumber(session.sessionId, sid)
      loadOwned()
      onChanged()
    } catch (e) {
      setError(friendlyError(e, 'Erreur lors de la suppression.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Tes numéros</p>
          {owned === null && <Loader className="py-2" />}
          {owned && owned.length === 0 && <p className="text-sm text-muted-foreground">Aucun numéro acheté pour l'instant.</p>}
          {owned?.map((n) => (
            <div key={n.sid} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="size-4 text-primary" />
                <span className="font-medium">{n.phoneNumber}</span>
                {n.phoneNumber === settings.phoneNumber && (
                  <Badge variant="success" className="text-[10px]">
                    Actif
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={busy === n.sid}
                onClick={() => release(n.sid)}
                aria-label="Supprimer ce numéro"
              >
                {busy === n.sid ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Acheter un numéro français</p>
            <Button variant="outline" size="sm" onClick={search} disabled={searching}>
              {searching ? <Loader2 className="size-4 animate-spin" /> : 'Chercher'}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {available && available.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun numéro disponible pour l'instant, réessaie.</p>
          )}
          {available?.map((n) => (
            <div key={n.phoneNumber} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
              <div className="text-sm">
                <p className="font-medium">{n.phoneNumber}</p>
                {(n.locality || n.region) && (
                  <p className="text-xs text-muted-foreground">{[n.locality, n.region].filter(Boolean).join(', ')}</p>
                )}
              </div>
              <Button size="sm" disabled={busy === n.phoneNumber} onClick={() => buy(n.phoneNumber)}>
                {busy === n.phoneNumber ? <Loader2 className="size-4 animate-spin" /> : 'Acheter'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
