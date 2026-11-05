// Où mène une notification quand on l'ouvre (dans l'app ou depuis la
// notification du téléphone) — d'après son type et ses données.
export function notificationUrl(type, data = {}) {
  const d = data ?? {}
  if (d.url) return d.url
  if (d.intervention_id && ['intervention_assignee', 'fiche_depuis_appel'].includes(type)) return `/interventions/${d.intervention_id}`
  if (d.document_id && type === 'devis_signe') return `/devis/${d.document_id}/modifier`
  if (d.document_id && ['facture_signee', 'facture_creee'].includes(type)) return `/factures/${d.document_id}/modifier`
  if (type === 'paiement_recu') return '/paiements'
  if (type === 'nouvelle_connexion') return '/reglages/securite'
  return '/notifications'
}
