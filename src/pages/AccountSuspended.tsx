import { MoonStar } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export default function AccountSuspended() {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <MoonStar className="size-12 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Compte en veille</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Ton compte a été désactivé par un administrateur. Contacte-le pour le réactiver.
      </p>
      <Button variant="outline" onClick={logout}>
        Se déconnecter
      </Button>
    </div>
  )
}
