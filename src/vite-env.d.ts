/// <reference types="vite/client" />

// pdfjs-dist charge son worker via une URL d'asset Vite — `new URL(spécificateur,
// import.meta.url)` fonctionne en build mais pas de façon fiable en dev avec
// un spécificateur de paquet npm, d'où l'import `?url` explicite à la place.
declare module '*?url' {
  const url: string
  export default url
}
