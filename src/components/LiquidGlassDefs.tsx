// Filtre SVG partagé par le reste de l'app — le filtre de déformation
// optique "lentille" (feDisplacementMap piloté par une carte générée en
// JS) qui vivait ici a été retiré : il provoquait un rendu corrompu
// (pavé de pixels multicolores figés sous l'en-tête) sur certaines pages
// en usage réel, un risque trop élevé pour un effet purement décoratif.
// `.glass`/`.glass-strong` retombent sur leur flou/saturation classiques
// partout, comme c'était déjà le cas sur Safari/WebKit.
export function LiquidGlassDefs() {
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
      </defs>
    </svg>
  )
}
