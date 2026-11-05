import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './lib/theme.ts'

// Avant tout rendu React, pour éviter un flash de thème clair au chargement
// si l'utilisateur a choisi le mode sombre.
initTheme()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw-push.js').catch(() => {})
    // Toucher une notification quand l'app est ouverte : aller au bon écran.
    navigator.serviceWorker.addEventListener('message', (e) => {
      const url = e.data?.type === 'navigate' ? e.data.url : null
      if (typeof url === 'string' && url.startsWith('/')) window.location.assign(url)
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
