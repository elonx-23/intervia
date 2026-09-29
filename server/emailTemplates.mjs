// Habillage commun à tous les emails envoyés par l'app (vérification de
// compte, réinitialisation de mot de passe, devis/factures, rapports
// d'intervention) — avant ce fichier, chaque route construisait son propre
// petit bout de HTML (juste "Bonjour X, <bouton>"), sans identité visuelle.
// Un seul wrapper ici garantit que tout email a le même en-tête "Intervia"
// et le même rappel no-reply, même si le contenu au milieu change.

const BRAND_COLOR = '#2563eb'
const TEXT_COLOR = '#1e1e23'
const MUTED_COLOR = '#6b6b78'
const BORDER_COLOR = '#e5e7eb'
const BG_COLOR = '#f3f4f6'

// `from` est maintenant une boîte no-reply@intervia.info dédiée — le
// destinataire doit comprendre qu'il ne sert à rien de répondre ici, plutôt
// que de découvrir un email qui ne repart jamais.
export function wrapEmail({ preheader, bodyHtml }) {
  return `
    <div style="background: ${BG_COLOR}; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
      ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>` : ''}
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid ${BORDER_COLOR};">
        <div style="padding: 24px 28px; border-bottom: 1px solid ${BORDER_COLOR};">
          <span style="font-size: 18px; font-weight: 700; color: ${BRAND_COLOR}; letter-spacing: -0.02em;">Intervia</span>
        </div>
        <div style="padding: 28px; color: ${TEXT_COLOR}; font-size: 14px; line-height: 1.55;">
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
      <a href="${link}" style="background: ${BRAND_COLOR}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 999px; font-weight: 600; font-size: 14px; display: inline-block;">${label}</a>
    </p>`
}

export function fallbackLink(link) {
  return `
    <p style="color: ${MUTED_COLOR}; font-size: 12px; margin-top: 24px;">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br />
      <a href="${link}" style="color: ${BRAND_COLOR}; word-break: break-all;">${link}</a>
    </p>`
}
