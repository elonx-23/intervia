import { Bell, FileText, Navigation, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

const SELLING_POINTS = [
  {
    icon: Zap,
    title: 'Tout en temps réel',
    body: "Une fiche assignée, un devis signé, une facture réglée — visible instantanément sur tous les écrans, sans jamais recharger la page.",
  },
  {
    icon: FileText,
    title: 'Devis et factures en un geste',
    body: "Génère un devis directement depuis une fiche d'intervention, transforme-le en facture en un clic, fais signer et encaisser en ligne.",
  },
  {
    icon: Navigation,
    title: 'Le technicien guidé de bout en bout',
    body: 'Itinéraire Waze en un tap, démarrage d’intervention qui prépare le devis tout seul — le terrain n’a plus qu’à se concentrer sur le client.',
  },
  {
    icon: Bell,
    title: 'Notifications qui comptent',
    body: 'Une fiche distribuée arrive en push instantané chez le bon technicien — pas de standard, pas de coup de fil de relance.',
  },
]

export default function Landing() {
  const { session } = useAuth()
  if (session) return <Navigate to="/" replace />

  return (
    <div className="min-h-svh overflow-x-hidden bg-[radial-gradient(120%_60%_at_50%_-10%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_60%)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-20 px-6 pt-10 pb-16">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/marketing/logo-mark.png" alt="" className="size-9" />
            <span className="text-sm font-semibold tracking-tight">Intervia</span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/login">Se connecter</Link>
          </Button>
        </header>

        {/* Hero */}
        <section className="grid items-center gap-12 md:grid-cols-2">
          <div className="flex flex-col gap-6">
            <span className="glass inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              Fait pour le dépannage à domicile
            </span>
            <h1 className="text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl">
              Le dispatch de tes interventions, du premier appel à la facture encaissée.
            </h1>
            <p className="text-lg text-muted-foreground text-pretty">
              Intervia réunit fiches d'intervention, devis, factures et équipe technicien dans une seule app qui
              se met à jour en direct — sur ton téléphone comme sur celui de tes techniciens.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button asChild size="lg">
                <Link to="/login">Se connecter</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/inscription">Créer un compte</Link>
              </Button>
            </div>
          </div>

          {/* Vraie capture de l'app (duo iPhone) plutôt qu'un mockup
              recomposé en CSS — halo "glass" derrière, cohérent avec le
              reste de la page. */}
          <div className="relative mx-auto w-full max-w-[340px]">
            <div className="glass-strong absolute inset-8 -z-10 rounded-[3rem] opacity-60 blur-2xl" />
            <img
              src="/marketing/hero-devis-dashboard.png"
              alt="Intervia — devis et tableau de bord sur iPhone"
              className="w-full drop-shadow-2xl"
            />
          </div>
        </section>

        {/* Éléments vendeurs */}
        <section className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Une seule app pour piloter toute la tournée
            </h2>
            <p className="max-w-lg text-sm text-muted-foreground text-pretty">
              Conçue pour les entreprises de dépannage qui en ont marre de jongler entre le téléphone, le carnet et
              le tableur.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {SELLING_POINTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="glass flex flex-col gap-3 rounded-2xl p-5">
                <div className="glass-strong flex size-10 items-center justify-center rounded-xl text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground text-pretty">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="glass-strong flex flex-col items-center gap-4 rounded-3xl px-6 py-10 text-center">
          <ShieldCheck className="size-8 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            Prêt à arrêter de gérer ta tournée sur des post-it ?
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/inscription">Créer mon compte</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/login">J'ai déjà un compte</Link>
            </Button>
          </div>
        </section>

        <footer className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/mentions-legales" className="hover:text-foreground">
            Mentions légales
          </Link>
        </footer>
      </div>
    </div>
  )
}
