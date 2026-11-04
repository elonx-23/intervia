import PublicDocument from './PublicDocument'

// Lien « Consulter (et signer) la facture » reçu par email.
export default function ViewFacture() {
  return <PublicDocument kind="facture" />
}
