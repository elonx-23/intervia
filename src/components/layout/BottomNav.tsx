import { ClipboardList, FileText, LayoutDashboard, LineChart, Plus, Receipt, X } from 'lucide-react'
import type { ComponentType } from 'react'
import * as React from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/lib/auth'
import { useLiquidTouch } from '@/hooks/useLiquidTouch'
import { createDevis, createFactureDirect } from '@/lib/documents'
import { cn } from '@/lib/utils'

const MORPH_DURATION_MS = 500

// Bleu fixe, jamais dérivé de --primary — le bouton doit rester identique
// en clair comme en sombre (repère visuel constant), alors que --primary
// change légèrement de teinte entre les deux thèmes.
const FAB_BLUE = '#2563eb'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
}

// Mesure la vraie valeur de env(safe-area-inset-bottom) via un élément sonde
// invisible plutôt que de faire confiance à son application directe en CSS.
function measureSafeAreaBottom() {
  if (typeof document === 'undefined') return 0
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;bottom:0;left:0;height:0;width:0;padding-bottom:env(safe-area-inset-bottom, 0px);visibility:hidden;pointer-events:none;'
  document.body.appendChild(probe)
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0
  document.body.removeChild(probe)
  return value
}

// Mesurée UNE SEULE FOIS au montage (BottomNav n'est de toute façon jamais
// démonté pendant la navigation interne — il vit dans AppLayout) et plus
// jamais retouchée ensuite : cette valeur est une propriété de l'appareil,
// pas de la page. La réévaluer à chaque changement de page (fait avant)
// provoquait de temps en temps un très léger changement de valeur entre
// deux mesures, ce qui faisait visuellement "sauter" la barre. La valeur
// initiale est mesurée directement au rendu (pas dans un effet) et la
// vérification de rattrapage passe par useLayoutEffect — les deux
// s'exécutent avant que le navigateur peigne quoi que ce soit à l'écran,
// donc même une correction ne provoque jamais de flash visible au
// lancement de l'app, contrairement à un useEffect classique qui, lui,
// s'exécute après la première peinture.
function useSafeAreaBottom() {
  const [inset, setInset] = React.useState(measureSafeAreaBottom)

  React.useLayoutEffect(() => {
    const measure = () => setInset(measureSafeAreaBottom())
    // Le layout peut se stabiliser après le tout premier rendu (webfonts,
    // hydratation…) — une seule relecture de rattrapage, jamais répétée.
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])

  return inset
}

function NavPill({ to, end, children }: { to: string; end?: boolean; children: React.ReactNode }) {
  const { ref, handlers } = useLiquidTouch<HTMLAnchorElement>()
  return (
    <NavLink
      ref={ref}
      to={to}
      end={end}
      {...handlers}
      className="liquid relative z-10 flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-medium text-muted-foreground transition-colors [&.active]:text-primary [&.active_svg]:scale-110"
    >
      {children}
    </NavLink>
  )
}

// Groupe de pastilles (moitié gauche ou droite de la barre) avec sa propre
// bulle de verre liquide qui glisse entre SES deux onglets — jamais entre
// les deux groupes (séparés par le bouton "+" au milieu, aucun sens à faire
// glisser une bulle par-dessus).
function NavGroup({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const activeIndex = items.findIndex((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))
  const n = items.length
  const prevIndex = React.useRef(activeIndex)
  const [morphing, setMorphing] = React.useState(false)

  React.useEffect(() => {
    if (prevIndex.current !== activeIndex) {
      prevIndex.current = activeIndex
      setMorphing(true)
      const t = setTimeout(() => setMorphing(false), MORPH_DURATION_MS)
      return () => clearTimeout(t)
    }
  }, [activeIndex])

  return (
    <div className="relative flex flex-1 items-center gap-0.5">
      {activeIndex >= 0 && (
        <div
          className={`glass absolute top-1 bottom-1 rounded-full transition-[left,width] duration-500 [transition-timing-function:cubic-bezier(0.34,1.2,0.4,1)] ${morphing ? 'liquid-blob-morph' : ''}`}
          style={{
            left: `calc(${(activeIndex / n) * 100}% + 2px)`,
            width: `calc(${100 / n}% - 4px)`,
          }}
          aria-hidden="true"
        />
      )}
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavPill key={to} to={to} end={end}>
          <Icon className="size-5 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]" />
          <span aria-hidden="true" className="whitespace-nowrap">
            {label}
          </span>
        </NavPill>
      ))}
    </div>
  )
}

interface CreateAction {
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
  onClick: () => void
}

// Bulles d'action qui montent depuis le bouton "+" — même langage visuel que
// SendFab (verre, flou plein écran) plutôt qu'un menu générique, pour que
// "créer" se sente pareil partout dans l'app.
function CreateActions({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: CreateAction[] }) {
  return (
    <>
      {/* z-45, AU-DESSUS du header (z-40, un fixed séparé — pas un ancêtre
          de ce calque, donc son propre z-index compte). C'était la vraie
          cause du bug (flou qui s'arrêtait sous le header au lieu de
          couvrir tout l'écran, et clignotait) : à z-30 ce calque passait
          par-dessous, dans un ordre de peinture incohérent avec ses
          voisins. Une fois l'empilement corrigé (lui à 45, la barre du bas
          + le bouton "+" + les bulles à 50), le vrai flou (backdrop-blur)
          peut revenir sans le souci — seuls le bouton et les 3 bulles
          d'action, au-dessus, restent nets. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'pointer-events-none fixed inset-0 z-[45] bg-background/50 backdrop-blur-lg transition-opacity duration-300',
          open && 'pointer-events-auto opacity-100',
          !open && 'opacity-0',
        )}
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-36 z-50 flex flex-col items-center gap-3 px-6">
        {actions.map((action, i) => {
          const Icon = action.icon
          return (
            <button
              key={action.key}
              type="button"
              onClick={() => {
                onClose()
                action.onClick()
              }}
              className={cn(
                'pointer-events-auto flex w-full max-w-xs origin-bottom items-center gap-3 transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]',
                open ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-50 opacity-0',
              )}
              style={{ transitionDelay: open ? `${i * 40}ms` : '0ms' }}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary shadow-[0_6px_16px_-4px_rgba(0,0,0,0.3)]">
                <Icon className="size-6" />
              </span>
              <span className="flex-1 rounded-full border border-border bg-card px-5 py-3 text-base font-semibold whitespace-nowrap shadow-[0_6px_16px_-4px_rgba(0,0,0,0.25)]">
                {action.label}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

export function BottomNav() {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const safeAreaBottom = useSafeAreaBottom()
  const isAdmin = session?.role === 'admin'
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const fab = useLiquidTouch<HTMLButtonElement>()

  const left: NavItem[] = isAdmin
    ? [
        { to: '/', label: 'Accueil', icon: LayoutDashboard, end: true },
        { to: '/interventions', label: 'Fiches', icon: ClipboardList },
      ]
    : [
        { to: '/statistiques', label: 'Stats', icon: LineChart },
        { to: '/', label: 'Fiches', icon: ClipboardList, end: true },
      ]
  const right: NavItem[] = [
    { to: '/devis', label: 'Devis', icon: FileText },
    { to: '/factures', label: 'Factures', icon: Receipt },
  ]

  const newDevis = async () => {
    if (!session || creating) return
    setCreating(true)
    try {
      const created = await createDevis(session.sessionId, {
        interventionId: null,
        clientFirstName: '',
        clientLastName: '',
        phone: '',
        address: '',
        email: '',
        items: [],
        vatRate: 10,
        notes: '',
        validityDate: null,
        photosBefore: [],
      })
      navigate(`/devis/${created.id}/modifier`)
    } finally {
      setCreating(false)
    }
  }

  const newFacture = async () => {
    if (!session || creating) return
    setCreating(true)
    try {
      const created = await createFactureDirect(session.sessionId, {
        interventionId: null,
        clientFirstName: '',
        clientLastName: '',
        phone: '',
        address: '',
        email: '',
        items: [],
        vatRate: 10,
        notes: '',
        validityDate: null,
        photosBefore: [],
      })
      navigate(`/factures/${created.id}/modifier`)
    } finally {
      setCreating(false)
    }
  }

  const actions: CreateAction[] = [
    { key: 'devis', label: 'Nouveau devis', icon: FileText, onClick: newDevis },
    { key: 'facture', label: 'Nouvelle facture', icon: Receipt, onClick: newFacture },
    { key: 'rapport', label: "Rapport d'intervention", icon: ClipboardList, onClick: () => navigate('/rapports/nouveau') },
  ]

  return (
    // CreateActions est rendu HORS des conteneurs ci-dessous, volontairement
    // — ils portent un `transform` (translateZ(0)), et un transform sur un
    // ancêtre crée un nouveau "containing block" pour tout descendant en
    // `position: fixed`. Le flou plein écran de CreateActions (fixed
    // inset-0) se retrouvait alors positionné par rapport à CE conteneur
    // (ancré en bas, haut de quelques centimètres) au lieu du vrai viewport
    // — d'où le bug "le flou ne couvre que la barre du bas".
    //
    // Barre et bouton "+" sont maintenant deux conteneurs `fixed` SÉPARÉS
    // (pas un bouton dans le même conteneur que la barre) : un `transform`
    // crée aussi son propre contexte d'empilement, donc un z-index élevé
    // posé sur un élément À L'INTÉRIEUR du conteneur transformé de la barre
    // reste plafonné au z-index DU CONTENEUR — impossible pour le bouton de
    // passer au-dessus du fond flouté (z-45) tant qu'il partage ce
    // conteneur. Séparés, la barre (z-40) se floute avec le reste de la
    // page à l'ouverture du menu, et le bouton (z-50, son propre
    // conteneur) reste net au-dessus.
    <>
      <CreateActions open={createOpen} onClose={() => setCreateOpen(false)} actions={actions} />

      {/* Ancre simple et inconditionnelle à "bottom: 0" (aucun calcul dans
          la propriété bottom elle-même) — WebKit/Safari a un historique de
          recalculs instables quand un élément fixe combine calc()+env()
          dans sa position, surtout en PWA installée où le viewport se
          redimensionne (clavier, rotation…). La zone sécurisée est posée
          en padding sur ce conteneur, qui est un pur repère de position ;
          la pastille visible (le vrai <nav>) n'a plus qu'une marge fixe
          simple par-dessus. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
        style={{
          // Valeur mesurée nous-mêmes en JS (voir useSafeAreaBottom) plutôt
          // que "env(safe-area-inset-bottom)" directement en CSS — c'est ce
          // calcul CSS qui semble se figer sur une valeur fausse après une
          // navigation SPA sur certains iPhones.
          paddingBottom: `${Math.max(4, safeAreaBottom - 14)}px`,
          transform: 'translateZ(0)',
        }}
      >
        <nav
          className="glass-strong bottom-nav-glass pointer-events-auto flex w-full max-w-md items-center justify-between gap-0.5 rounded-full px-2 py-1.5"
          style={{
            // @ts-expect-error propriété CSS personnalisée
            '--elevation-shadow': '0 8px 30px -8px rgba(0,0,0,0.35), 0 2px 8px -2px rgba(0,0,0,0.18)',
          }}
        >
          <NavGroup items={left} pathname={pathname} />
          {/* Encoche vide au centre — même largeur que le bouton "+" posé
              par-dessus, fait partie de la même barre continue plutôt que
              deux pastilles séparées. */}
          <div className="w-16 shrink-0" aria-hidden="true" />
          <NavGroup items={right} pathname={pathname} />
        </nav>
      </div>

      {/* Conteneur dédié au bouton "+", superposé au même endroit que la
          barre ci-dessus mais dans son propre calque (voir le commentaire
          plus haut) — jamais flouté avec elle. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
        style={{ paddingBottom: `${Math.max(4, safeAreaBottom - 14)}px` }}
      >
        <div className="relative w-full max-w-md">
          {/* Une seule bulle bleue (pas un bouton + un anneau de verre
              séparé derrière) — le "verre" vient d'un dégradé/reflet posé
              SUR le bleu lui-même (inset highlight en haut, liseré clair),
              jamais d'un backdrop-filter séparé qui doublait la forme.
              Centrage par un conteneur externe (jamais un transform sur le
              bouton lui-même) : .liquid-pressed impose son propre
              `transform: scale(...)` qui écraserait un `-translate-x-1/2`
              porté par le même élément, faisant sauter le bouton hors de
              l'axe au toucher. */}
          <div className="pointer-events-none absolute left-1/2 -top-[4.25rem] -translate-x-1/2">
            <button
              ref={fab.ref}
              type="button"
              onClick={() => setCreateOpen((o) => !o)}
              disabled={creating}
              aria-label={createOpen ? 'Fermer' : 'Créer'}
              className="liquid pointer-events-auto flex size-16 items-center justify-center rounded-[1.5rem] text-white disabled:opacity-60"
              style={{
                // Plat, net, sans dégradé ni ombre diffuse — un dégradé doux
                // en superposition ("gloss") ou une ombre à grand rayon de
                // flou se lisaient comme un halo flou autour du bouton,
                // signalé à plusieurs reprises. Un simple liseré net de 1px
                // (pas un dégradé) suffit pour le reflet du haut.
                backgroundColor: FAB_BLUE,
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.5), 0 3px 8px -2px rgba(0,0,0,0.35)',
                isolation: 'isolate',
              }}
              {...fab.handlers}
            >
              <span className={cn('transition-transform duration-300', createOpen && 'rotate-45')}>
                {createOpen ? <X className="size-7" /> : <Plus className="size-7" />}
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
