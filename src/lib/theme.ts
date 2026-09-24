export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'pse_theme'

export function getStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // localStorage indisponible — on retombe sur "system"
  }
  return 'system'
}

// Pose/retire la classe .dark sur <html> — c'est elle que tout le CSS de
// l'app (voir index.css) utilise pour basculer les couleurs, pas un
// attribut ou un data-* séparé.
export function applyTheme(pref: ThemePreference) {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const isDark = pref === 'dark' || (pref === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', isDark)
}

export function setTheme(pref: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    // pas bloquant si localStorage est indisponible (navigation privée…)
  }
  applyTheme(pref)
}

// Appelé une fois au tout début du chargement de l'app (voir main.tsx) pour
// éviter le flash de thème clair avant que React ne s'hydrate.
export function initTheme() {
  const pref = getStoredTheme()
  applyTheme(pref)
  if (pref === 'system' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getStoredTheme() === 'system') applyTheme('system')
    })
  }
}
