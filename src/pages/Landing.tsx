import {
  ArrowRight,
  Bell,
  CalendarClock,
  CreditCard,
  FileText,
  MapPinned,
  Phone,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

// Reprend les 6 destinations réelles de la nav (BottomNav) — la vitrine
// vend exactement ce que l'app fait, rien d'inventé pour l'occasion.
const FEATURES = [
  {
    icon: MapPinned,
    title: 'Dispatch & interventions',
    body: "Crée une fiche, assigne le bon technicien, suis chaque intervention en direct sur tous les écrans.",
  },
  {
    icon: Users,
    title: 'Techniciens',
    body: "Suis l'activité de ton équipe — interventions en cours, chiffre d'affaires et performance de chacun.",
  },
  {
    icon: FileText,
    title: 'Devis & factures',
    body: "Génère un devis en un geste depuis une fiche, transforme-le en facture, fais signer directement sur place.",
  },
  {
    icon: CreditCard,
    title: 'Encaissements',
    body: 'Encaisse par carte (lien de paiement), espèces ou virement — le suivi se fait tout seul.',
  },
  {
    icon: Bell,
    title: 'Notifications',
    body: 'Une fiche distribuée arrive en push instantané chez le bon technicien, sans coup de fil de relance.',
  },
  {
    icon: TrendingUp,
    title: 'Statistiques',
    body: "Pilote l'activité avec des tableaux de bord clairs, par équipe et par technicien.",
  },
]

const PROCESS_STEPS = [
  { icon: Phone, title: 'Appel client', body: 'Le client appelle ou est rappelé.' },
  { icon: CalendarClock, title: 'Intervention', body: 'Le technicien est assigné et se déplace sur place.' },
  { icon: FileText, title: 'Devis / facture', body: "Générée depuis l'app, signée sur place." },
  { icon: CreditCard, title: 'Encaissement', body: 'Payée sur place ou à distance, suivi automatique.' },
]

const STATS = [
  { icon: Zap, value: 'Temps réel', label: 'Fiches, devis et factures mis à jour instantanément' },
  { icon: ShieldCheck, value: 'De bout en bout', label: "Du premier appel jusqu'à l'encaissement" },
  { icon: Sparkles, value: 'Tout-en-un', label: 'Une seule application pour toute la tournée' },
]

export default function Landing() {
  const { session } = useAuth()
  if (session) return <Navigate to="/" replace />

  return (
    <div className="dark min-h-svh overflow-x-hidden bg-[#050810] text-foreground">
      {/* Halo bleu ambiant derrière le hero — pas un dégradé décoratif
          générique : centré sur la zone où vit le mockup, comme dans la
          référence, pour que la lumière semble venir de l'app elle-même. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[900px]"
        style={{
          background:
            'radial-gradient(60% 50% at 68% 8%, color-mix(in oklch, var(--primary) 30%, transparent), transparent 70%), radial-gradient(40% 35% at 15% 25%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-24 px-6 pt-8 pb-20">
        {/* Nav */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/marketing/logo-mark.png" alt="" className="size-9" />
            <span className="text-sm font-semibold tracking-tight">Intervia</span>
          </div>
          <a
            href="#fonctionnalites"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Fonctionnalités
          </a>
          <div className="flex items-center gap-2.5">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link to="/login">Se connecter</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/inscription">Créer un compte</Link>
            </Button>
          </div>
        </header>

        {/* Hero */}
        <section className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col gap-6">
            <span className="glass inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              Fait pour le dépannage à domicile
            </span>
            <h1 className="text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-5xl">
              Pilotez chaque intervention.{' '}
              <span className="bg-gradient-to-r from-primary to-sky-400 bg-clip-text text-transparent">
                Encaissez chaque facture.
              </span>
            </h1>
            <p className="text-lg text-muted-foreground text-pretty">
              Interventions, techniciens, devis, factures et encaissements réunis dans une seule application qui se
              met à jour en direct — sur ton téléphone comme sur celui de tes techniciens.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button asChild size="lg">
                <Link to="/inscription">
                  Créer mon compte
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/login">Se connecter</Link>
              </Button>
            </div>
          </div>

          {/* Vraie capture de l'app (duo iPhone), pas un mockup recomposé —
              halo "glass" derrière pour la faire flotter sur le fond sombre. */}
          <div className="relative mx-auto w-full max-w-[420px]">
            <div className="glass-strong absolute inset-10 -z-10 rounded-[3rem] opacity-70 blur-3xl" />
            <img
              src="/marketing/hero-devis-dashboard.png"
              alt="Intervia — devis et tableau de bord sur iPhone"
              className="w-full drop-shadow-2xl"
            />
          </div>
        </section>

        {/* Bandeau de repères */}
        <section className="glass grid gap-6 rounded-3xl p-6 sm:grid-cols-3 sm:p-8">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={value} className="flex items-center gap-4">
              <div className="glass-strong flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">{value}</p>
                <p className="text-sm text-muted-foreground text-pretty">{label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Fonctionnalités */}
        <section id="fonctionnalites" className="flex scroll-mt-20 flex-col gap-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-xs font-semibold tracking-widest text-primary uppercase">
              Des fonctionnalités pensées pour vous
            </span>
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Tout ce qu'il faut pour piloter votre activité
            </h2>
            <p className="max-w-lg text-sm text-muted-foreground text-pretty">
              Une application complète, pensée pour les entreprises de dépannage qui en ont marre de jongler entre
              le téléphone, le carnet et le tableur.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
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

        {/* Processus */}
        <section className="flex flex-col gap-10">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-xs font-semibold tracking-widest text-primary uppercase">Un processus fluide</span>
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              De l'appel client à l'encaissement
            </h2>
            <p className="max-w-lg text-sm text-muted-foreground text-pretty">
              Chaque étape est centralisée dans Intervia — rien ne se perd entre le premier appel et le paiement.
            </p>
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            {PROCESS_STEPS.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="flex flex-1 items-start gap-4 sm:flex-col sm:items-center sm:text-center">
                <div className="glass-strong flex size-12 shrink-0 items-center justify-center rounded-2xl text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold">
                    {i + 1}. {title}
                  </p>
                  <p className="text-sm text-muted-foreground text-pretty">{body}</p>
                </div>
                {i < PROCESS_STEPS.length - 1 && (
                  <ArrowRight className="mt-3 hidden size-4 shrink-0 text-muted-foreground sm:block" />
                )}
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
          <p className="text-xs text-muted-foreground">C'est gratuit pour rejoindre une équipe existante.</p>
        </section>

        <footer className="flex flex-col items-center gap-4 border-t border-border/60 pt-8 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <img src="/marketing/logo-mark.png" alt="" className="size-5" />
            <span>© {new Date().getFullYear()} Intervia. Tous droits réservés.</span>
          </div>
          <Link to="/mentions-legales" className="hover:text-foreground">
            Mentions légales
          </Link>
        </footer>
      </div>
    </div>
  )
}
