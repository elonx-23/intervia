import { Building2, Check, ChevronLeft, ChevronRight, Mail, Phone, ShieldCheck, Users2 } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'
import { friendlyError } from '@/lib/errors'
import { FORMULES, type FormuleKey } from '@/lib/formules'
import { createTeam, joinTeam, type TeamPlan } from '@/lib/teams'

type View = 'choix' | FormuleKey

// Rend un point de vente en mettant en gras les parties marquées **ainsi**
// — en couleur de la formule en plus du gras pour Société+/Ultra (les deux
// formules haut de gamme), gras neutre pour les autres.
function FormattedPoint({ text, accent, colored }: { text: string; accent: string; colored: boolean }) {
  const parts = text.split('**')
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={colored ? { color: accent } : undefined}>
            {part}
          </strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  )
}

// Un compte vérifié mais pas encore rattaché à une équipe atterrit ici :
// rejoindre une équipe existante (gratuit) ou en créer une (Solo/Société,
// paiement Stripe récurrent avant activation — voir server/routes/teams.mjs).
// ?apercu=1 (route publique /apercu-abonnement) affiche la page avec des
// données d'exemple et sans appel serveur, pour la retravailler visuellement
// sans avoir besoin d'une vraie session.
export default function NoTeamYet() {
  const { session, logout, updateSession } = useAuth()
  const [params] = useSearchParams()
  const preview = params.get('apercu') === '1'
  const [view, setView] = React.useState<View>('choix')
  const [joinCode, setJoinCode] = React.useState('')
  const [form, setForm] = React.useState({ name: '', phone: '', email: session?.email ?? '', siret: '' })
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const join = async () => {
    if (preview) return
    if (!session || !joinCode.trim()) return
    setBusy('join')
    setError(null)
    try {
      updateSession(await joinTeam(session.sessionId, joinCode.trim()))
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
    } finally {
      setBusy(null)
    }
  }

  const create = async (plan: TeamPlan) => {
    if (preview) return
    setError(null)
    // Le bouton reste cliquable même formulaire incomplet — sinon un champ
    // manquant se traduit juste par "rien ne se passe" au clic, sans
    // explication visible pour l'utilisateur.
    if (!form.name.trim()) return setError("Le nom de l'entreprise est requis.")
    if (!form.phone.trim()) return setError('Le numéro de téléphone est requis.')
    if (!session) return
    setBusy(plan)
    try {
      const { url } = await createTeam(session.sessionId, {
        plan,
        name: form.name.trim(),
        contactPhone: form.phone.trim(),
        contactEmail: form.email.trim() || undefined,
        siret: form.siret.trim() || undefined,
      })
      window.location.href = url
    } catch (e) {
      setError(friendlyError(e, 'Erreur.'))
      setBusy(null)
    }
  }

  // Fixe en haut de l'écran (pas juste en tête du contenu défilant) — sinon
  // il disparaît dès qu'on scrolle dans un formulaire un peu long, et plus
  // moyen de revenir aux autres formules sans tout remonter.
  const BackRow = ({ label }: { label: string }) => (
    <button
      type="button"
      onClick={() => setView('choix')}
      className="liquid glass-strong sticky top-3 z-10 flex w-fit items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm text-muted-foreground shadow-sm"
    >
      <ChevronLeft className="size-4" />
      {label}
    </button>
  )

  if (view === 'technicien') {
    const formule = FORMULES[0]
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-4 py-10">
        <BackRow label="Toutes les formules" />

        {/* Le technicien sur le terrain, tenue de travail, qui consulte
            l'app — à côté du texte, avec la même lueur collée à l'image. */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div
              className="absolute inset-[6%] -z-10 rounded-[2rem] opacity-60 blur-2xl"
              style={{ background: formule.accent }}
            />
            <img
              src="/marketing/hero-technicien.png"
              alt="Technicien utilisant Intervia sur le terrain"
              className="w-28 drop-shadow-2xl"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              className="flex size-11 items-center justify-center rounded-2xl text-white"
              style={{
                background: `linear-gradient(160deg, color-mix(in srgb, ${formule.accent} 80%, white) 0%, ${formule.accent} 55%, color-mix(in srgb, ${formule.accent} 88%, black) 100%)`,
                boxShadow: `0 6px 16px -6px ${formule.accent}`,
              }}
            >
              <Users2 className="size-5" />
            </div>
            <h1 className="text-lg font-semibold">Rejoindre une équipe</h1>
            <p className="text-sm text-muted-foreground">Gratuit — un admin t'a donné un code d'équipe ?</p>
          </div>
        </div>
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Input
              placeholder="Code d'équipe"
              autoFocus
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="text-center text-lg tracking-widest"
            />
            <Button size="lg" disabled={busy === 'join' || !joinCode.trim()} onClick={join}>
              {busy === 'join' ? '…' : 'Rejoindre'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (view === 'solo' || view === 'entreprise' || view === 'entreprise_plus' || view === 'ultra') {
    const formule = FORMULES.find((f) => f.view === view)!
    const Icon = formule.icon

    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col gap-5 px-4 py-10">
        <BackRow label="Toutes les formules" />

        {/* Vraie capture de l'app à côté du descriptif (pas au-dessus) —
            lueur colorée collée à l'image plutôt qu'un halo large et vague. */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div
              className="absolute inset-[6%] -z-10 rounded-[2rem] opacity-60 blur-2xl"
              style={{ background: `linear-gradient(135deg, ${formule.accent} 0%, ${formule.accent2} 100%)` }}
            />
            <img
              src="/marketing/hero-devis-dashboard.png"
              alt="Intervia — devis et tableau de bord"
              className="w-32 drop-shadow-2xl"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              className="flex size-11 items-center justify-center rounded-2xl text-white"
              style={{
                background: `linear-gradient(160deg, color-mix(in srgb, ${formule.accent} 80%, white) 0%, ${formule.accent} 55%, color-mix(in srgb, ${formule.accent} 88%, black) 100%)`,
                boxShadow: `0 6px 16px -6px ${formule.accent}`,
              }}
            >
              <Icon className="size-5" />
            </div>
            <h1 className="text-lg font-semibold">{formule.title}</h1>
            <p className="font-bold" style={{ color: formule.accent, fontSize: formule.priceSize }}>
              {formule.price}
            </p>
            <p className="text-sm text-muted-foreground">{formule.pitch}</p>
          </div>
        </div>

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        {/* Ce que contient la formule */}
        <Card className="border-2" style={{ borderColor: `color-mix(in srgb, ${formule.accent} 35%, transparent)` }}>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ce qui est inclus</p>
            <ul className="flex flex-col gap-2">
              {formule.points.map((point) => (
                <li key={point} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 shrink-0" style={{ color: formule.accent }} />
                  <FormattedPoint
                    text={point}
                    accent={formule.accent}
                    colored={view === 'entreprise_plus' || view === 'ultra'}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Un vrai formulaire d'entreprise, pas juste un nom */}
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ton entreprise</p>
            <div className="flex flex-col gap-2">
              <Label htmlFor="team-name">
                <Building2 className="size-3.5" /> Nom de l'entreprise *
              </Label>
              <Input
                id="team-name"
                autoFocus
                placeholder="Ex. Dupont Dépannage"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="team-phone">
                  <Phone className="size-3.5" /> Téléphone *
                </Label>
                <Input
                  id="team-phone"
                  type="tel"
                  placeholder="06 12 34 56 78"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor="team-siret">SIRET (optionnel)</Label>
                <Input
                  id="team-siret"
                  placeholder="14 chiffres"
                  value={form.siret}
                  onChange={(e) => setForm((f) => ({ ...f, siret: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="team-email">
                <Mail className="size-3.5" /> Email de contact
              </Label>
              <Input
                id="team-email"
                type="email"
                placeholder="contact@entreprise.fr"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Récapitulatif avant paiement */}
        <Card className="border-2" style={{ borderColor: `color-mix(in srgb, ${formule.accent} 35%, transparent)` }}>
          <CardContent className="flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Récapitulatif</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Formule {formule.title}</span>
              <span className="font-medium">{formule.price}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border/70 pt-3 text-sm">
              <span className="font-semibold">Total aujourd'hui</span>
              <span className="font-bold" style={{ color: formule.accent, fontSize: formule.priceSize }}>
                {formule.price}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Facturé mensuellement, résiliable à tout moment.</p>

            {error && <p className="text-center text-sm text-destructive">{error}</p>}
            <Button
              size="lg"
              className="mt-1"
              disabled={busy === view}
              onClick={() => create(view)}
              style={{ background: formule.accent }}
            >
              {busy === view ? '…' : `Continuer vers le paiement — ${formule.price}`}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Paiement sécurisé par Stripe.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col gap-5 py-10">
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <Users2 className="size-10 text-primary" />
        <h1 className="text-lg font-semibold">Ton compte est confirmé</h1>
        <p className="text-sm text-muted-foreground">Choisis une formule pour continuer.</p>
      </div>

      {/* Les 4 formules payantes, toutes avec la même bulle (bannière +
          arguments de vente) — la formule technicien gratuite passe en
          dessous, volontairement plus discrète. */}
      <div className="grid grid-cols-2 gap-3 px-4">
        {FORMULES.filter((f) => f.view !== 'technicien').map((f) => {
          const Icon = f.icon
          return (
            <div key={f.view} className="relative">
              <Card
                className="liquid flex h-full flex-col overflow-hidden border-2 p-0"
                style={{
                  borderColor: `color-mix(in srgb, ${f.accent} 35%, transparent)`,
                  boxShadow: `0 ${8 + f.badge / 4}px ${24 + f.badge}px -16px color-mix(in srgb, ${f.accent} 45%, transparent)`,
                }}
              >
                {/* Image accrocheuse : bannière dégradée aux couleurs de la
                    formule, avec un motif de cercles et l'icône en grand. */}
                <div
                  className="relative flex h-24 shrink-0 items-center justify-center overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${f.accent} 0%, ${f.accent2} 100%)` }}
                >
                  <div className="absolute -top-6 -left-6 size-20 rounded-full bg-white/15" />
                  <div className="absolute -right-4 -bottom-8 size-24 rounded-full bg-white/10" />
                  <Icon className="relative size-11 text-white drop-shadow-md" strokeWidth={1.6} />
                </div>

                <CardContent className="flex flex-1 flex-col gap-2.5 p-3.5">
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="text-[11px] text-muted-foreground">{f.pitch}</p>
                  </div>
                  <p className="font-bold" style={{ color: f.accent, fontSize: f.priceSize }}>
                    {f.price}
                  </p>
                  <ul className="flex flex-1 flex-col gap-1.5 border-t border-border/70 pt-2.5">
                    {f.points.map((point) => (
                      <li key={point} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <Check className="mt-0.5 size-3 shrink-0" style={{ color: f.accent }} />
                        <FormattedPoint
                          text={point}
                          accent={f.accent}
                          colored={f.view === 'entreprise_plus' || f.view === 'ultra'}
                        />
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" className="mt-1 w-full" style={{ background: f.accent }} onClick={() => setView(f.view)}>
                    Choisir
                  </Button>
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>

      {/* Formule technicien gratuite — discrète, en dessous des deux
          formules payantes qu'elle ne doit pas concurrencer visuellement. */}
      {(() => {
        const tech = FORMULES.find((f) => f.view === 'technicien')!
        const Icon = tech.icon
        return (
          <div className="px-4">
            <button type="button" onClick={() => setView('technicien')} className="w-full text-left">
              <Card className="liquid">
                <CardContent className="flex items-center gap-3 py-1">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: tech.accent }}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {tech.title} <span className="text-muted-foreground">— {tech.price}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{tech.pitch}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </button>
          </div>
        )
      })()}

      <Button variant="ghost" size="sm" onClick={logout} className="mx-auto">
        Se déconnecter
      </Button>
    </div>
  )
}
