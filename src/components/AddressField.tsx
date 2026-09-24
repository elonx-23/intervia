import * as React from 'react'

import { Input } from '@/components/ui/input'

interface AddressSuggestion {
  label: string
  name: string
  postcode: string
  city: string
}

// Autocomplétion d'adresse via l'API Adresse du gouvernement français
// (api-adresse.data.gouv.fr — Base Adresse Nationale) : gratuite, sans clé,
// CORS ouvert. En tapant, propose des adresses réelles avec ville et code
// postal déjà inclus dans le libellé, pas besoin de champs séparés.
export function AddressField({
  value,
  onChange,
  onSelect,
  disabled,
}: {
  value: string
  onChange: (address: string) => void
  onSelect?: (details: { label: string; postcode: string; city: string }) => void
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([])
  const containerRef = React.useRef<HTMLDivElement>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const requestIdRef = React.useRef(0)

  React.useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const handleChange = (v: string) => {
    onChange(v)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 3) {
      setSuggestions([])
      return
    }
    const requestId = ++requestIdRef.current
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(v)}&limit=5`)
        const data = await res.json()
        if (requestId !== requestIdRef.current) return
        const features = Array.isArray(data?.features) ? data.features : []
        setSuggestions(
          features.map(
            (f: { properties?: { label?: string; name?: string; postcode?: string; city?: string } }) => ({
              label: f.properties?.label ?? '',
              // "name" = juste numéro + rue (sans ville/code postal), contrairement
              // à "label" qui les inclut déjà — évite de les avoir en double une
              // fois que "onSelect" les a mis dans leurs propres champs.
              name: f.properties?.name ?? f.properties?.label ?? '',
              postcode: f.properties?.postcode ?? '',
              city: f.properties?.city ?? '',
            }),
          ),
        )
      } catch {
        if (requestId === requestIdRef.current) setSuggestions([])
      }
    }, 300)
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        placeholder="Numéro, rue, ville…"
      />
      {open && suggestions.length > 0 && (
        <div className="glass-strong absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl p-1">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s.name)
                onSelect?.(s)
                setSuggestions([])
                setOpen(false)
              }}
              className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/10"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
