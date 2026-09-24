// Motif décoratif façon "papier peint" d'icônes outils/serrurerie en ligne
// fine (clé, cadenas, clé à molette, pince, ampoule, vis) — inspiré d'une
// texture envoyée par le client pour l'en-tête des fiches devis/facture.
// Généré en SVG pur (pas d'image importée), répété en tuile via CSS.
const TILE = `
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
  <g fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
    <!-- cle -->
    <g transform="translate(20,25) rotate(-18)">
      <circle cx="10" cy="10" r="9" />
      <circle cx="10" cy="10" r="3" />
      <line x1="19" y1="10" x2="46" y2="10" />
      <line x1="40" y1="10" x2="40" y2="17" />
      <line x1="46" y1="10" x2="46" y2="19" />
    </g>
    <!-- cadenas -->
    <g transform="translate(120,15) rotate(6)">
      <path d="M6,20 a14,14 0 0 1 28,0" />
      <rect x="2" y="20" width="36" height="28" rx="5" />
      <circle cx="20" cy="33" r="3.5" />
      <line x1="20" y1="36.5" x2="20" y2="42" />
    </g>
    <!-- cle a molette -->
    <g transform="translate(30,95) rotate(35)">
      <path d="M0,10 a10,10 0 1 1 20,0 a10,10 0 0 1 -8,9.8 L36,60 a6,6 0 0 1 -10,4 L4,20 a10,10 0 0 1 -4,-10 Z" />
      <circle cx="10" cy="10" r="3.5" />
    </g>
    <!-- pince -->
    <g transform="translate(150,90) rotate(-10)">
      <line x1="0" y1="45" x2="22" y2="0" />
      <line x1="22" y1="45" x2="0" y2="0" />
      <circle cx="11" cy="22" r="3" />
      <path d="M-3,45 l6,10 M25,45 l-6,10" />
    </g>
    <!-- ampoule -->
    <g transform="translate(95,140)">
      <circle cx="12" cy="12" r="12" />
      <line x1="8" y1="24" x2="16" y2="24" />
      <line x1="9" y1="29" x2="15" y2="29" />
      <line x1="12" y1="-9" x2="12" y2="-2" />
      <line x1="-5" y1="12" x2="2" y2="12" />
      <line x1="22" y1="12" x2="29" y2="12" />
    </g>
    <!-- vis -->
    <g transform="translate(180,160) rotate(20)">
      <ellipse cx="10" cy="6" rx="9" ry="5" />
      <line x1="3" y1="9" x2="17" y2="9" />
      <line x1="10" y1="11" x2="10" y2="40" />
      <line x1="7" y1="17" x2="13" y2="14" />
      <line x1="7" y1="25" x2="13" y2="22" />
      <line x1="7" y1="33" x2="13" y2="30" />
    </g>
    <!-- ecrou -->
    <g transform="translate(55,175) scale(0.9)">
      <path d="M12,0 L24,7 L24,21 L12,28 L0,21 L0,7 Z" />
      <circle cx="12" cy="14" r="5" />
    </g>
    <!-- eclair -->
    <g transform="translate(185,45) rotate(-8)">
      <path d="M10,0 L0,20 L8,20 L2,40 L22,14 L13,14 Z" />
    </g>
  </g>
</svg>
`.trim()

// btoa() seul corrompt les caractères hors Latin1 (accents) — un octet
// UTF-8 isolé comme 0xE9 n'est pas un caractère UTF-8 valide, ce qui rend
// l'image entière invalide pour le navigateur (échec silencieux, aucune
// erreur visible). On repasse par les octets UTF-8 réels avant btoa().
export function toolPatternDataUri() {
  const bytes = new TextEncoder().encode(TILE)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  const encoded = btoa(binary)
  return `url("data:image/svg+xml;base64,${encoded}")`
}
