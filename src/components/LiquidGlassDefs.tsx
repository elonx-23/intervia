import * as React from 'react'

import { generateLensDisplacementMap } from '@/lib/lensDisplacementMap'

// Vraie déformation optique du contenu derrière les surfaces en verre (pas
// juste un flou teinté) : un filtre SVG qui va littéralement chercher les
// pixels à une position décalée selon une carte de déformation en forme de
// loupe. Marche sur Chrome/Chromium ; ignoré silencieusement sur Safari/
// WebKit (backdrop-filter + SVG displacement n'y fonctionne pas — bug
// WebKit connu, bugs.webkit.org #245510) — dans ce cas .glass retombe sur
// son flou/saturation habituels, sans erreur ni élément cassé.
export function LiquidGlassDefs() {
  const [mapUrl, setMapUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    setMapUrl(generateLensDisplacementMap())

    const isChromium = 'chrome' in window
    if (isChromium) {
      document.documentElement.classList.add('lens-capable')
    }
  }, [])

  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {/* Fines rayures bleues déformées par du bruit fractal : on obtient
            des veines ondulées façon acier damas/forgé, entièrement en CSS +
            SVG (pas d'image externe) — utilisé sur l'en-tête devis/facture. */}
        <filter id="damascus-blue" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="softSource" />
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.025" numOctaves="2" seed="7" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
          <feDisplacementMap in="softSource" in2="softNoise" scale="65" xChannelSelector="R" yChannelSelector="G" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation="0.6" />
        </filter>
        {mapUrl && (
          <>
            <filter
              id="liquid-glass-lens"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              primitiveUnits="objectBoundingBox"
            >
              <feImage href={mapUrl} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="0.35" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter
              id="liquid-glass-lens-strong"
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
              primitiveUnits="objectBoundingBox"
            >
              <feImage href={mapUrl} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="0.55" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </>
        )}
      </defs>
    </svg>
  )
}
