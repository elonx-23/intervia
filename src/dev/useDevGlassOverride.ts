import * as React from 'react'
import type { GlassSettings } from './liquidGlassConfig'

// Relit un réglage sauvegardé par LiquidGlassStudio pour une clé donnée, en
// dev uniquement — jamais en production (voir le montage conditionnel dans
// App.tsx, et le composant qui appelle ce hook doit lui-même être un import
// dynamique gated par import.meta.env.DEV : ce hook seul ne suffit pas à
// garder le paquet liquid-glass-js hors du bundle de prod). N'enregistre
// l'élément web `<liquid-glass>` (import du paquet) que si un réglage a
// vraiment été trouvé — pas de coût si l'outil n'a jamais servi.
export function useDevGlassOverride(key: string): GlassSettings | null {
  const [settings, setSettings] = React.useState<GlassSettings | null>(null)

  React.useEffect(() => {
    if (!import.meta.env.DEV) return
    let cancelled = false
    import('./liquidGlassConfig').then(({ getGlassConfig }) => {
      if (cancelled) return
      const saved = getGlassConfig(key)
      if (!saved) return
      Promise.all([import('@ozcanyldzhn/liquid-glass-js'), import('@ozcanyldzhn/liquid-glass-js/css')]).then(() => {
        if (!cancelled) setSettings(saved)
      })
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return settings
}
