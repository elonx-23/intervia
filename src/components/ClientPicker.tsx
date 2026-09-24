import { Search } from 'lucide-react'
import * as React from 'react'

import { Input } from '@/components/ui/input'
import { searchClients, type ClientMatch } from '@/lib/clients'
import { useAuth } from '@/lib/auth'

// Recherche parmi les clients déjà connus (devis/factures précédents) pour
// préremplir un nouveau document sans ressaisir les coordonnées — le
// technicien tape un nom ou un numéro, choisit une suggestion.
export function ClientPicker({ onPick }: { onPick: (client: ClientMatch) => void }) {
  const { session } = useAuth()
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<ClientMatch[]>([])
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!session || query.trim().length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      searchClients(session.sessionId, query)
        .then((r) => {
          if (!cancelled) setResults(r)
        })
        .catch(() => {})
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [session, query])

  React.useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher un client existant…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          className="pl-10"
        />
      </div>
      {open && results.length > 0 && (
        <div className="glass-strong absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl p-1">
          {results.map((c) => (
            <button
              key={c.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(c)
                setOpen(false)
                setQuery('')
              }}
              className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-primary/10"
            >
              <span className="text-sm font-medium">
                {[c.firstName, c.lastName].filter(Boolean).join(' ') || 'Client sans nom'}
              </span>
              {(c.phone || c.address) && (
                <span className="truncate text-xs text-muted-foreground">
                  {[c.phone, c.address].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
