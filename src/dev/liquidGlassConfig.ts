// Pont entre l'outil de réglage (LiquidGlassStudio) et les vrais composants
// (BottomNav) : "Appliquer" écrit ici, les composants relisent au montage.
// localStorage plutôt qu'un state React partagé — persiste après un
// rechargement, ce qui est nécessaire puisque "Appliquer" recharge la page
// pour que le composant réel se remonte avec le nouveau réglage.

export interface GlassSettings {
  engine: 'svg' | 'webgl'
  surfaceFn: 'convex_squircle' | 'convex_circle' | 'concave' | 'lip'
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

const PREFIX = 'lg-studio:'

export function getGlassConfig(key: string): GlassSettings | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as GlassSettings) : null
  } catch {
    return null
  }
}

export function setGlassConfig(key: string, settings: GlassSettings) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(settings))
  } catch {
    // stockage indisponible (navigation privée...) — l'outil reste
    // utilisable en aperçu, juste "Appliquer" n'aura pas d'effet persistant
  }
}

export function clearGlassConfig(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // idem
  }
}
