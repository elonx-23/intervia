// Habillage commun à tous les emails envoyés par l'app (vérification de
// compte, réinitialisation de mot de passe, devis/factures, rapports
// d'intervention) — avant ce fichier, chaque route construisait son propre
// petit bout de HTML (juste "Bonjour X, <bouton>"), sans identité visuelle.
// Un seul wrapper ici garantit que tout email a le même en-tête "Intervia"
// et le même rappel no-reply, même si le contenu au milieu change.

const BRAND_COLOR = '#2563eb'
const BRAND_COLOR_DARK = '#1d4ed8'
const TEXT_COLOR = '#1e1e23'
const MUTED_COLOR = '#6b6b78'
const BORDER_COLOR = '#e5e7eb'
const BG_COLOR = '#f3f4f6'

// `from` est maintenant une boîte no-reply@intervia.info dédiée — le
// destinataire doit comprendre qu'il ne sert à rien de répondre ici, plutôt
// que de découvrir un email qui ne repart jamais.
//
// Bandeau d'en-tête en dégradé bleu (plutôt qu'un simple texte sur fond
// blanc) : ces emails sont envoyés par les clients de l'app (une entreprise
// de dépannage) à LEURS PROPRES clients — ils doivent avoir une vraie
// identité visuelle soignée, pas un email "technique" austère.
export function wrapEmail({ preheader, bodyHtml }) {
  return `
    <div style="background: ${BG_COLOR}; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>` : ''}
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 18px; overflow: hidden; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 1px 3px rgba(16,24,40,0.04), 0 8px 24px -8px rgba(16,24,40,0.10);">
        <div style="padding: 22px 28px; background: linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_COLOR_DARK});">
          <span style="font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">Intervia</span>
        </div>
        <div style="padding: 30px 28px; color: ${TEXT_COLOR}; font-size: 14px; line-height: 1.6;">
          ${bodyHtml}
        </div>
        <div style="padding: 16px 28px; background: ${BG_COLOR}; border-top: 1px solid ${BORDER_COLOR}; color: ${MUTED_COLOR}; font-size: 11.5px; line-height: 1.5;">
          Cet email a été envoyé automatiquement par Intervia — merci de ne pas y répondre directement.
        </div>
      </div>
    </div>`
}

export function ctaButton(label, link) {
  return `
    <p style="text-align: center; margin: 26px 0;">
      <a href="${link}" style="background: linear-gradient(135deg, ${BRAND_COLOR}, ${BRAND_COLOR_DARK}); color: #ffffff; text-decoration: none; padding: 13px 30px; border-radius: 999px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 12px -2px rgba(37,99,235,0.4);">${label}</a>
    </p>`
}

export function fallbackLink(link) {
  return `
    <p style="color: ${MUTED_COLOR}; font-size: 12px; margin-top: 24px;">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
      <a href="${link}" style="color: ${BRAND_COLOR}; word-break: break-all;">${link}</a>
    </p>`
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Textes par défaut du message accompagnant l'envoi d'un devis/facture —
// personnalisables par équipe (Réglages → Emails, admin uniquement). Les
// 4 scénarios distincts demandés : un devis pas encore signé n'appelle pas
// le même ton qu'une facture déjà réglée.
export const DEFAULT_EMAIL_TEXTS = {
  devis: 'Voici votre devis {numero} ({montant} € TTC), joint à cet email au format PDF.',
  devisSigne: 'Voici votre devis signé {numero} ({montant} € TTC), joint à cet email au format PDF.',
  facture: 'Voici votre facture {numero} ({montant} € TTC), jointe à cet email au format PDF.',
  factureAcquittee:
    'Votre facture {numero} ({montant} € TTC) a bien été réglée — vous la trouverez ci-jointe, avec la mention acquittée.',
}

// Remplace {numero}/{montant}/{client}/{entreprise} dans un texte saisi par
// un admin — le texte lui-même est échappé avant substitution (jamais de
// confiance dans du texte libre inséré tel quel dans un email HTML), puis
// {numero}/{montant} ressortent en gras pour rester lisibles au milieu de
// la phrase, comme dans les textes par défaut ci-dessus.
export function fillEmailText(template, { numero, montant, client, entreprise }) {
  return escapeHtml(template)
    .replace(/\{numero\}/g, `<strong>${escapeHtml(numero)}</strong>`)
    .replace(/\{montant\}/g, `<strong>${escapeHtml(montant)}</strong>`)
    .replace(/\{client\}/g, escapeHtml(client ?? ''))
    .replace(/\{entreprise\}/g, escapeHtml(entreprise ?? ''))
    .replace(/\n/g, '<br>')
}
