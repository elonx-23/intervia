// Fichier séparé de liquid-glass-js.d.ts : `declare module 'react' {...}`
// exige que ce fichier soit un vrai module (présence d'un import), ce qui
// empêche par ailleurs `declare module '@ozcanyldzhn/liquid-glass-js/css'`
// de rester une déclaration ambiante globale s'il partage le même fichier
// (bug vécu, vérifié en le séparant). Élément web natif du paquet — son
// wrapper React (`/react`) est cassé au runtime (ses types promettent
// `LiquidGlassReact`, le bundle compilé ne l'exporte pas), donc on pilote
// directement l'élément web `<liquid-glass>`. Attributs en chaînes, comme
// de vrais attributs HTML, pas des props React typées. React 19 lit les
// éléments intrinsèques via `React.JSX`.
import type * as React from 'react'
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'liquid-glass': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        width?: string
        height?: string
        radius?: string
        ior?: string
        thickness?: string
        bezel?: string
        blur?: string
        'tint-color'?: string
        'tint-opacity'?: string
        'specular-opacity'?: string
        'specular-saturation'?: string
        'shadow-blur'?: string
        'shadow-spread'?: string
        'shadow-color'?: string
        'outer-shadow-blur'?: string
        'scale-ratio'?: string
        engine?: string
        'surface-fn'?: string
      }
    }
  }
}
