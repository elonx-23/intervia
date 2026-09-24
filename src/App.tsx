import * as React from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth } from '@/components/layout/RequireAuth'
import { LiquidGlassDefs } from '@/components/LiquidGlassDefs'
import { Splash } from '@/components/Splash'
import { AuthProvider, useAuth } from '@/lib/auth'

// Un import statique par page mettait TOUT (Dashboard, Statistiques,
// Clients, Paiements, Sauvegardes…) dans le même gros chunk JS, chargé au
// premier écran même pour un technicien qui ne visitera jamais ces pages
// admin — le build le signalait déjà ("chunks larger than 500 kB"). Chaque
// page devient son propre chunk, téléchargé seulement quand la route est
// réellement visitée : premier chargement (et chaque nouvel écran PWA)
// nettement plus léger, surtout utile sur un réseau mobile.
const ForgotPassword = React.lazy(() => import('@/pages/ForgotPassword'))
const Inscription = React.lazy(() => import('@/pages/Inscription'))
const Landing = React.lazy(() => import('@/pages/Landing'))
const Login = React.lazy(() => import('@/pages/Login'))
const NoTeamYet = React.lazy(() => import('@/pages/NoTeamYet'))
const NotFound = React.lazy(() => import('@/pages/NotFound'))
const RapportCreate = React.lazy(() => import('@/pages/RapportCreate'))
const ResetPassword = React.lazy(() => import('@/pages/ResetPassword'))
const TeamPayment = React.lazy(() => import('@/pages/TeamPayment'))
const VerifyEmail = React.lazy(() => import('@/pages/VerifyEmail'))
const DevisList = React.lazy(() => import('@/pages/Documents').then((m) => ({ default: m.DevisList })))
const FacturesList = React.lazy(() => import('@/pages/Documents').then((m) => ({ default: m.FacturesList })))
const DevisEdit = React.lazy(() => import('@/pages/DevisEdit'))
const FactureEdit = React.lazy(() => import('@/pages/FactureEdit'))
const InterventionCreate = React.lazy(() => import('@/pages/InterventionCreate'))
const InterventionDetail = React.lazy(() => import('@/pages/InterventionDetail'))
const Interventions = React.lazy(() => import('@/pages/Interventions'))
const MentionsLegales = React.lazy(() => import('@/pages/MentionsLegales'))
const Notifications = React.lazy(() => import('@/pages/Notifications'))
const Settings = React.lazy(() => import('@/pages/Settings'))
const AboutSettings = React.lazy(() => import('@/pages/settings/AboutSettings'))
const AccountSettings = React.lazy(() => import('@/pages/settings/AccountSettings'))
const BackupSettings = React.lazy(() => import('@/pages/settings/BackupSettings'))
const CompanySettings = React.lazy(() => import('@/pages/settings/CompanySettings'))
const ContactSettings = React.lazy(() => import('@/pages/settings/ContactSettings'))
const IntegrationsSettings = React.lazy(() => import('@/pages/settings/IntegrationsSettings'))
const NotificationSettings = React.lazy(() => import('@/pages/settings/NotificationSettings'))
const PrivacySettings = React.lazy(() => import('@/pages/settings/PrivacySettings'))
const RegionSettings = React.lazy(() => import('@/pages/settings/RegionSettings'))
const SecuritySettings = React.lazy(() => import('@/pages/settings/SecuritySettings'))
const SubscriptionSettings = React.lazy(() => import('@/pages/settings/SubscriptionSettings'))
const TermsSettings = React.lazy(() => import('@/pages/settings/TermsSettings'))
const ThemeSettings = React.lazy(() => import('@/pages/settings/ThemeSettings'))
const Statistiques = React.lazy(() => import('@/pages/Statistiques'))
const Dashboard = React.lazy(() => import('@/pages/admin/Dashboard'))
const Clients = React.lazy(() => import('@/pages/admin/Clients'))
const ClientDetail = React.lazy(() => import('@/pages/admin/ClientDetail'))
const Paiements = React.lazy(() => import('@/pages/admin/Paiements'))
const Techniciens = React.lazy(() => import('@/pages/admin/Techniciens'))
const SignDevis = React.lazy(() => import('@/pages/public/SignDevis'))
const ViewFacture = React.lazy(() => import('@/pages/public/ViewFacture'))

// Fallback minimal pendant le téléchargement du chunk de la page — la
// bascule de route étant déjà quasi instantanée en local/4G, ce n'est visible
// qu'une fraction de seconde ; pas la peine d'un skeleton par page.
function RouteFallback() {
  return <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Chargement…</div>
}

function HomeRoute() {
  const { session } = useAuth()
  return session?.role === 'admin' ? <Dashboard /> : <Interventions />
}

function AppRoutes() {
  const { session } = useAuth()
  const isAdmin = session?.role === 'admin'

  return (
    <React.Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/bienvenue" element={<Landing />} />
        <Route path="/inscription" element={<Inscription />} />
        <Route path="/verifier-email/:token" element={<VerifyEmail />} />
        <Route path="/equipe/paiement" element={<TeamPayment />} />
        <Route path="/apercu-abonnement" element={<NoTeamYet />} />
        <Route path="/login" element={<Login />} />
        <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
        <Route path="/reinitialiser-mot-de-passe/:token" element={<ResetPassword />} />
        <Route path="/signer/:token" element={<SignDevis />} />
        <Route path="/facture/:token" element={<ViewFacture />} />
        <Route path="/mentions-legales" element={<MentionsLegales />} />
        <Route path="/reglages/conditions" element={<TermsSettings />} />
        <Route path="/reglages/confidentialite" element={<PrivacySettings />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/interventions/:id" element={<InterventionDetail />} />
            <Route path="/devis" element={<DevisList />} />
            <Route path="/factures" element={<FacturesList />} />
            <Route path="/statistiques" element={<Statistiques />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/devis/:id/modifier" element={<DevisEdit />} />
            <Route path="/factures/:id/modifier" element={<FactureEdit />} />
            <Route path="/rapports/nouveau" element={<RapportCreate />} />

            <Route path="/reglages" element={<Settings />} />
            <Route path="/reglages/compte" element={<AccountSettings />} />
            <Route path="/reglages/theme" element={<ThemeSettings />} />
            <Route path="/reglages/notifications" element={<NotificationSettings />} />
            <Route path="/reglages/nous-contacter" element={<ContactSettings />} />
            <Route path="/reglages/a-propos" element={<AboutSettings />} />
            <Route path="/reglages/abonnement" element={<SubscriptionSettings />} />

            {isAdmin && (
              <>
                <Route path="/interventions" element={<Interventions />} />
                <Route path="/interventions/nouvelle" element={<InterventionCreate />} />
                <Route path="/techniciens" element={<Techniciens />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:key" element={<ClientDetail />} />
                <Route path="/paiements" element={<Paiements />} />
                <Route path="/reglages/entreprise" element={<CompanySettings />} />
                <Route path="/reglages/integrations" element={<IntegrationsSettings />} />
                <Route path="/reglages/region" element={<RegionSettings />} />
                <Route path="/reglages/securite" element={<SecuritySettings />} />
                <Route path="/reglages/sauvegardes" element={<BackupSettings />} />
              </>
            )}
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </React.Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-backdrop" aria-hidden="true" />
      <LiquidGlassDefs />
      <Splash />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
