import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

export function DemoBanner() {
  const { demoMode, session, setDemoRole } = useAuth()

  if (!demoMode) return null

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border bg-warning/20 px-4 py-1.5 text-xs">
      <span>Mode démo — sans connexion Supabase</span>
      <div className="flex gap-1">
        {(['admin', 'technicien'] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => setDemoRole(role)}
            className={cn(
              'rounded-full border border-border px-2 py-0.5',
              session?.role === role && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            {role === 'admin' ? 'Admin' : 'Technicien'}
          </button>
        ))}
      </div>
    </div>
  )
}
