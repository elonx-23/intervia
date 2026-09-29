// Le sous-chemin "/css" du package n'expose pas de types dans son export map
// — TS (moduleResolution "bundler") respecte l'export map à la lettre, donc
// ne retombe pas sur la déclaration globale `*.css` de vite/client pour un
// import de sous-chemin de paquet (contrairement à un import CSS relatif).
declare module '@ozcanyldzhn/liquid-glass-js/css'
