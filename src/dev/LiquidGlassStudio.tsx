import * as React from 'react'
import '@ozcanyldzhn/liquid-glass-js'
import '@ozcanyldzhn/liquid-glass-js/css'

// Outil de réglage en direct, dev uniquement (jamais dans le build de
// production — voir le montage conditionnel dans App.tsx) : "Sélectionner"
// active un mode où cliquer sur n'importe quel bouton/élément réel de l'app
// pose par-dessus un calque <liquid-glass> qui suit sa position à l'écran,
// avec un panneau de réglages en direct façon "Physics Studio" du paquet
// (mêmes paramètres : moteur, profil de surface, indice de réfraction,
// épaisseur, lunette, rayon, flou, teinte, spéculaire, ombre). "Copier les
// réglages" donne un extrait JSX prêt à coller dans le vrai composant une
// fois les valeurs trouvées — l'objectif n'est pas de garder cet outil en
// prod, juste de trouver les bons chiffres une fois.

type Engine = 'svg' | 'webgl'
type SurfaceFn = 'convex_squircle' | 'convex_circle' | 'concave' | 'lip'

interface Settings {
  engine: Engine
  surfaceFn: SurfaceFn
  ior: number
  thickness: number
  bezel: number
  radius: number
  blur: number
  tintColor: string
  tintOpacity: number
  specularOpacity: number
  specularSaturation: number
  shadowBlur: number
  shadowSpread: number
}

const DEFAULTS: Settings = {
  engine: 'svg',
  surfaceFn: 'convex_squircle',
  ior: 2.2,
  thickness: 60,
  bezel: 35,
  radius: 26,
  blur: 4,
  tintColor: '#ffffff',
  tintOpacity: 18,
  specularOpacity: 0.55,
  specularSaturation: 5,
  shadowBlur: 30,
  shadowSpread: -8,
}

// Presets repris du panneau "Contrôles des matériaux" du Physics Studio
// officiel (Clair / Dense / Doux / Teinté) — un point de départ rapide
// plutôt que de partir des sliders à zéro à chaque fois.
const PRESETS: Record<string, Partial<Settings>> = {
  Clair: { thickness: 40, bezel: 25, tintOpacity: 8, blur: 0 },
  Dense: { thickness: 110, bezel: 55, tintOpacity: 28, blur: 6 },
  Doux: { ior: 1.6, bezel: 60, specularOpacity: 0.3, blur: 8 },
  Teinté: { tintOpacity: 40, specularOpacity: 0.7 },
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '',
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  unit?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
        <span>{label}</span>
        <span style={{ color: '#a3e635', fontFamily: 'monospace' }}>
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  )
}

export function LiquidGlassStudio() {
  const [selecting, setSelecting] = React.useState(false)
  const [target, setTarget] = React.useState<HTMLElement | null>(null)
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const [settings, setSettings] = React.useState<Settings>(DEFAULTS)
  const [copied, setCopied] = React.useState(false)

  const patch = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }))

  // Mode sélection : survol met en évidence, clic choisit la cible (et
  // empêche son action normale de se déclencher pendant qu'on choisit).
  React.useEffect(() => {
    if (!selecting) return
    let hovered: HTMLElement | null = null
    const onOver = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-lg-studio]')) return
      hovered?.style.removeProperty('outline')
      hovered = el
      el.style.outline = '2px solid #a3e635'
    }
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-lg-studio]')) return
      e.preventDefault()
      e.stopPropagation()
      hovered?.style.removeProperty('outline')
      setTarget(el)
      setSelecting(false)
    }
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('click', onClick, true)
    return () => {
      hovered?.style.removeProperty('outline')
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [selecting])

  // Le calque de prévisualisation suit la position réelle de la cible (page
  // qui défile, redimensionnement...) via une boucle légère plutôt qu'un
  // ResizeObserver+écouteurs multiples à démêler pour un outil temporaire.
  React.useEffect(() => {
    if (!target) return
    let raf: number
    const sync = () => {
      setRect(target.getBoundingClientRect())
      raf = requestAnimationFrame(sync)
    }
    sync()
    return () => cancelAnimationFrame(raf)
  }, [target])

  const copySettings = async () => {
    const snippet = `<liquid-glass
  engine="${settings.engine}"
  surface-fn="${settings.surfaceFn}"
  ior="${settings.ior}"
  thickness="${settings.thickness}"
  bezel="${settings.bezel}"
  radius="${settings.radius}"
  blur="${settings.blur}"
  tint-color="${settings.tintColor}"
  tint-opacity="${settings.tintOpacity}"
  specular-opacity="${settings.specularOpacity}"
  specular-saturation="${settings.specularSaturation}"
  shadow-blur="${settings.shadowBlur}"
  shadow-spread="${settings.shadowSpread}"
/>`
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div data-lg-studio="true">
      {/* Bouton d'activation, toujours visible */}
      <button
        type="button"
        onClick={() => {
          setSelecting((s) => !s)
          setTarget(null)
        }}
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          zIndex: 100000,
          background: selecting ? '#a3e635' : '#111827',
          color: selecting ? '#111827' : '#fff',
          border: 'none',
          borderRadius: 999,
          padding: '10px 16px',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: '-apple-system, sans-serif',
          cursor: 'pointer',
          boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
        }}
      >
        🔮 {selecting ? 'Clique sur un élément…' : target ? 'Changer de bouton' : 'Sélectionner un bouton'}
      </button>

      {/* Calque liquid-glass posé sur la cible sélectionnée */}
      {target && rect && (
        <div
          style={{
            position: 'fixed',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            zIndex: 99998,
            pointerEvents: 'none',
          }}
        >
          <liquid-glass
            width={String(Math.round(rect.width))}
            height={String(Math.round(rect.height))}
            engine={settings.engine}
            surface-fn={settings.surfaceFn}
            ior={String(settings.ior)}
            thickness={String(settings.thickness)}
            bezel={String(settings.bezel)}
            radius={String(settings.radius)}
            blur={String(settings.blur)}
            tint-color={settings.tintColor}
            tint-opacity={String(settings.tintOpacity)}
            specular-opacity={String(settings.specularOpacity)}
            specular-saturation={String(settings.specularSaturation)}
            shadow-blur={String(settings.shadowBlur)}
            shadow-spread={String(settings.shadowSpread)}
          />
        </div>
      )}

      {/* Panneau de réglages */}
      {target && (
        <div
          data-lg-studio="true"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            bottom: 16,
            width: 260,
            zIndex: 100000,
            background: '#0b0f1a',
            color: '#e5e7eb',
            border: '1px solid #1f2937',
            borderRadius: 16,
            padding: 16,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            fontFamily: '-apple-system, sans-serif',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700 }}>Réglages du verre</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.keys(PRESETS).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => patch(PRESETS[name])}
                style={{
                  flex: '1 1 40%',
                  background: '#1f2937',
                  color: '#e5e7eb',
                  border: 'none',
                  borderRadius: 8,
                  padding: '6px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Moteur de rendu</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['svg', 'webgl'] as Engine[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => patch({ engine: e })}
                  style={{
                    flex: 1,
                    background: settings.engine === e ? '#a3e635' : '#1f2937',
                    color: settings.engine === e ? '#111827' : '#e5e7eb',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {e === 'svg' ? 'SVG' : 'WebGL'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Profil de surface</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {(
                [
                  ['convex_squircle', 'Squircle'],
                  ['convex_circle', 'Cercle'],
                  ['concave', 'Concave'],
                  ['lip', 'Lèvre'],
                ] as [SurfaceFn, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => patch({ surfaceFn: val })}
                  style={{
                    background: settings.surfaceFn === val ? '#a3e635' : '#1f2937',
                    color: settings.surfaceFn === val ? '#111827' : '#e5e7eb',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 4px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Slider label="Indice de réfraction" value={settings.ior} min={1} max={3} step={0.05} onChange={(v) => patch({ ior: v })} />
          <Slider label="Épaisseur" value={settings.thickness} min={10} max={200} onChange={(v) => patch({ thickness: v })} />
          <Slider label="Largeur de la lunette" value={settings.bezel} min={5} max={100} onChange={(v) => patch({ bezel: v })} />
          <Slider label="Rayon de courbure" value={settings.radius} min={0} max={80} onChange={(v) => patch({ radius: v })} />
          <Slider label="Flou de l'arrière-plan" value={settings.blur} min={0} max={30} onChange={(v) => patch({ blur: v })} />
          <Slider label="Opacité de la teinte" value={settings.tintOpacity} min={0} max={100} unit="%" onChange={(v) => patch({ tintOpacity: v })} />
          <Slider
            label="Lumière spéculaire"
            value={settings.specularOpacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => patch({ specularOpacity: v })}
          />
          <Slider label="Saturation spéculaire" value={settings.specularSaturation} min={0} max={20} onChange={(v) => patch({ specularSaturation: v })} />
          <Slider label="Flou d'ombre" value={settings.shadowBlur} min={0} max={60} onChange={(v) => patch({ shadowBlur: v })} />
          <Slider label="Étalement d'ombre" value={settings.shadowSpread} min={-30} max={30} onChange={(v) => patch({ shadowSpread: v })} />

          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
            <span style={{ color: '#9ca3af' }}>Couleur de teinte</span>
            <input
              type="color"
              value={settings.tintColor}
              onChange={(e) => patch({ tintColor: e.target.value })}
              style={{ width: '100%', height: 28, background: 'none', border: 'none' }}
            />
          </label>

          <button
            type="button"
            onClick={copySettings}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            {copied ? '✓ Copié !' : 'Copier les réglages'}
          </button>
        </div>
      )}
    </div>
  )
}
