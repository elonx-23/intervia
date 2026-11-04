import { Bell, Building2, CreditCard, Database, Globe, Info, LogOut, Mail, MessageCircle, Phone, Plug, ShieldCheck, Sparkles, User, Users } from 'lucide-react'
import * as React from 'react'

import { SettingsGroupLabel, SettingsRow } from '@/components/SettingsRow'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/layout/Page'
import { LogoutDialog } from '@/components/layout/LogoutDialog'
import { TeamSwitcher } from '@/components/settings/TeamSwitcher'
import { useAuth } from '@/lib/auth'
import { subscribeToPush } from '@/lib/notifications'
import { WhatsAppIcon } from '@/components/WhatsAppIcon'
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
          <SettingsRow to="/reglages/compte" tone="blue" icon={User} label="Mon compte" />
          <SettingsRow to="/reglages/theme" tone="violet" icon={Sparkles} label="Thème" />

          <div className="surface flex flex-col gap-1.5 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tone-red-soft text-tone-red-ink">
                <Bell className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">Notifications push</span>
              <Button variant="outline" size="sm" onClick={enablePush} disabled={pushLoading}>
                {pushLoading ? '…' : 'Activer'}
              </Button>
            </div>
            {pushMsg && <p className="pl-11 text-xs text-muted-foreground">{pushMsg}</p>}
          </div>

          <SettingsRow to="/reglages/notifications" tone="red" icon={Bell} label="Notifications" />
          <SettingsRow to="/reglages/nous-contacter" tone="cyan" icon={MessageCircle} label="Nous contacter" />
          <SettingsRow to="/reglages/a-propos" tone="slate" icon={Info} label="À propos" />
        </div>

        <div className="flex flex-col gap-2">
          <SettingsGroupLabel>Abonnement</SettingsGroupLabel>
          <SettingsRow to="/reglages/abonnement" tone="amber" icon={CreditCard} label="Abonnement" value="Gratuit" />
        </div>

        {isAdmin && (
          <div className="flex flex-col gap-2">
            <SettingsGroupLabel>Administration</SettingsGroupLabel>
            <SettingsRow to="/techniciens" tone="orange" icon={Users} label="Techniciens" />
            <SettingsRow to="/reglages/entreprise" tone="blue" icon={Building2} label="Entreprise" />
            <SettingsRow to="/reglages/emails" tone="violet" icon={Mail} label="Emails" />
            <SettingsRow to="/telephonie" tone="cyan" icon={Phone} label="Téléphonie" />
            <SettingsRow to="/reglages/whatsapp" tone="green" icon={WhatsAppIcon} label="WhatsApp" />
            <SettingsRow to="/reglages/integrations" tone="amber" icon={Plug} label="Intégrations" />
            <SettingsRow to="/reglages/region" tone="slate" icon={Globe} label="Région" />
            <SettingsRow to="/reglages/sauvegardes" tone="slate" icon={Database} label="Sauvegardes" />
            <SettingsRow to="/reglages/securite" tone="red" icon={ShieldCheck} label="Sécurité" />
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
