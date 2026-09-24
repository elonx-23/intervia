// PSE Gestion — envoie un devis/facture par email au client (lien public).
// Utilise Resend (https://resend.com). Variables requises :
//   RESEND_API_KEY, RESEND_FROM (ex: "PSE Dépannage <contact@pse-depannage.fr>")
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_BASE_URL (ex: "https://pse-gestion.example.com")
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { documentId } = await req.json()
  const { data: doc, error } = await supabase.from('documents').select('*').eq('id', documentId).single()

  if (error || !doc) {
    return new Response(JSON.stringify({ error: 'Document introuvable' }), { status: 404 })
  }
  if (!doc.email) {
    return new Response(JSON.stringify({ error: "Le client n'a pas d'email renseigné" }), { status: 400 })
  }

  const baseUrl = Deno.env.get('APP_BASE_URL') ?? ''
  const path = doc.kind === 'devis' ? 'signer' : 'facture'
  const link = `${baseUrl}/${path}/${doc.public_token}`
  const label = doc.kind === 'devis' ? 'devis' : 'facture'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM'),
      to: doc.email,
      subject: `Votre ${label} PSE Dépannage — ${doc.number}`,
      html: `<p>Bonjour ${doc.client_first_name},</p><p>Voici votre ${label} <strong>${doc.number}</strong> :</p><p><a href="${link}">${link}</a></p><p>PSE Dépannage</p>`,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return new Response(JSON.stringify({ error: `Échec envoi email: ${body}` }), { status: 502 })
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
