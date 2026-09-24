// Génère une carte de déformation (displacement map) pour une vraie lentille
// convexe : chaque pixel encode un vecteur (canal R = X, canal G = Y) qui dit
// à feDisplacementMap "va chercher le pixel source à cette position décalée"
// au lieu de simplement flouter. Le vecteur pointe vers le centre avec une
// intensité croissante vers le bord (profil de loupe classique) — c'est ce
// qui donne l'impression de vraie courbure optique, pas un flou teinté.
export function generateLensDisplacementMap(size = 160, strength = 1): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(size, size)
  const center = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)
      const maxDist = center
      const i = (y * size + x) * 4

      if (dist < maxDist) {
        const t = dist / maxDist
        // Profil de loupe : quasi nul au centre, monte vers le bord (t^1.6),
        // puis retombe légèrement pile au bord pour éviter une cassure nette.
        const falloff = Math.pow(t, 1.6) * (1 - Math.pow(t, 6) * 0.35)
        const nx = dist === 0 ? 0 : dx / dist
        const ny = dist === 0 ? 0 : dy / dist
        // Vecteur pointant vers le CENTRE (magnitude négative) : les bords du
        // cercle vont chercher des pixels plus proches du centre → effet
        // grossissant/bombé au lieu d'un simple flou.
        const dispX = -nx * falloff * strength
        const dispY = -ny * falloff * strength

        imageData.data[i] = Math.round(128 + dispX * 127)
        imageData.data[i + 1] = Math.round(128 + dispY * 127)
        imageData.data[i + 2] = 128
        imageData.data[i + 3] = 255
      } else {
        imageData.data[i] = 128
        imageData.data[i + 1] = 128
        imageData.data[i + 2] = 128
        imageData.data[i + 3] = 255
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL()
}
