// Chemins "racine" de chaque onglet de la barre du bas — toute autre page
// (fiche, devis/facture ouverts, réglages, etc.) est une page "empilée"
// qu'on ferme avec une croix plutôt qu'un onglet qu'on visite. Utilisé à la
// fois par AppLayout (afficher ou non la barre) et par Header (croix ou
// icônes notif/réglages) pour que les deux restent toujours d'accord sur
// quelle page est "racine", sans se passer de prop entre eux.
const ADMIN_TAB_ROOTS = ['/', '/interventions', '/devis', '/factures']
const TECHNICIEN_TAB_ROOTS = ['/', '/devis', '/factures', '/statistiques']

export function isTabRootPath(pathname: string, isAdmin: boolean) {
  const roots = isAdmin ? ADMIN_TAB_ROOTS : TECHNICIEN_TAB_ROOTS
  return roots.includes(pathname)
}
