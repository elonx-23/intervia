import { Check } from 'lucide-react'
import * as React from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Page } from '@/components/layout/Page'
import { getStoredTheme, setTheme, type ThemePreference } from '@/lib/theme'

const OPTIONS: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'Automatique', description: "Suit le réglage de l'appareil" },
  { value: 'light', label: 'Clair', description: 'Toujours en mode jour' },
  { value: 'dark', label: 'Sombre', description: 'Toujours en mode nuit' },
]

export default function ThemeSettings() {
  const [value, setValue] = React.useState<ThemePreference>(getStoredTheme())

  const choose = (v: ThemePreference) => {
    setValue(v)
    setTheme(v)
  }

  return (
    <Page title="Thème">
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => (
          <button key={opt.value} type="button" onClick={() => choose(opt.value)} className="text-left">
            <Card className="liquid py-3">
              <CardContent className="flex items-center gap-3 px-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
                {value === opt.value && <Check className="size-5 shrink-0 text-primary" />}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </Page>
  )
}
