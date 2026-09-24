import { Bell, Building2, CreditCard, Database, Globe, Info, LogOut, MessageCircle, ShieldCheck, Sparkles, User, Users } from 'lucide-react'
import * as React from 'react'

import { SettingsGroupLabel, SettingsRow } from '@/components/SettingsRow'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/layout/Page'
import { LogoutDialog } from '@/components/layout/LogoutDialog'
import { TeamSwitcher } from '@/components/settings/TeamSwitcher'
import { useAuth } from '@/lib/auth'
import { subscribeToPush } from '@/lib/notifications'
import { friendlyError } from '@/lib/errors'

export default function Settings() {
  const { session } = useAuth()
  const isAdmin = session?.role === 'admin'
  const [pushMsg, setPushMsg] = React.useState<string | null>(null)
  const [pushLoading, setPushLoading] = React.useState(false)
  const [logoutOpen, setLogoutOpen] = React.useState(false)

  const enablePush = async () => {
    if (!session) return
    setPushLoading(true)
    setPushMsg(null)
    try {
      await subscribeToPush(session.sessionId)
      setPushMsg('Notifications push activées sur cet appareil.')
    } catch (e) {
      setPushMsg(friendlyError(e, "Impossible d'activer les notifications push."))
    } finally {
      setPushLoading(false)
    }
  }

  return (
    <Page title="Réglages">
      <div className="flex flex-col gap-5">
        <TeamSwitcher />

        <div className="flex flex-col gap-2">
          <SettingsGroupLabel>Général</SettingsGroupLabel>
          <SettingsRow to="/reglages/compte" icon={User} label="Mon compte" />
          <SettingsRow to="/reglages/theme" icon={Sparkles} label="Thème" />

          <div className="flex flex-col gap-1.5 rounded-2xl border border-white/60 bg-card/85 p-4 backdrop-blur-md dark:border-white/10">
            <div className="flex items-center gap-3">
              <Bell className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-sm font-medium">Notifications push</span>
              <Button variant="outline" size="sm" onClick={enablePush} disabled={pushLoading}>
                {pushLoading ? '…' : 'Activer'}
              </Button>
            </div>
            {pushMsg && <p className="pl-8 text-xs text-muted-foreground">{pushMsg}</p>}
          </div>

          <SettingsRow to="/reglages/notifications" icon={Bell} label="Notifications" />
          <SettingsRow to="/reglages/nous-contacter" icon={MessageCircle} label="Nous contacter" />
          <SettingsRow to="/reglages/a-propos" icon={Info} label="À propos" />
        </div>

        <div className="flex flex-col gap-2">
          <SettingsGroupLabel>Abonnement</SettingsGroupLabel>
          <SettingsRow to="/reglages/abonnement" icon={CreditCard} label="Abonnement" value="Gratuit" />
        </div>

        {isAdmin && (
          <div className="flex flex-col gap-2">
            <SettingsGroupLabel>Administration</SettingsGroupLabel>
            <SettingsRow to="/techniciens" icon={Users} label="Techniciens" />
            <SettingsRow to="/reglages/entreprise" icon={Building2} label="Entreprise" />
            <SettingsRow to="/reglages/integrations" icon={Sparkles} label="Intégrations" />
            <SettingsRow to="/reglages/region" icon={Globe} label="Région" />
            <SettingsRow to="/reglages/sauvegardes" icon={Database} label="Sauvegardes" />
            <SettingsRow to="/reglages/securite" icon={ShieldCheck} label="Sécurité" />
          </div>
        )}

        <Button variant="outline" className="text-destructive" onClick={() => setLogoutOpen(true)}>
          <LogOut className="size-4" />
          Se déconnecter
        </Button>
      </div>

      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </Page>
  )
}
