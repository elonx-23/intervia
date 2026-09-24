import * as React from 'react'

// Le thème est piloté par la classe .dark sur <html> (voir lib/theme.ts),
// jamais par une media query seule — un MutationObserver plutôt qu'un effet
// à une seule lecture, pour rester correct si l'utilisateur change de thème
// pendant qu'un composant qui en dépend (ex. la boîte de QR code) est déjà
// ouvert.
export function useIsDark() {
  const [isDark, setIsDark] = React.useState(() => document.documentElement.classList.contains('dark'))

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}
