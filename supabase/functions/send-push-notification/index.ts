// PSE Gestion — envoie en push (Web Push / VAPID) les notifications pas
// encore livrées (notifications.pushed_at is null), puis marque pushed_at.
// Supprime les abonnements expirés (410/404).
//
// Variables d'environnement requises (Supabase → Edge Functions → Secrets) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (fournies automatiquement par Supabase)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex: "mailto:contact@pse-depannage.fr")
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@pse-depannage.fr',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async () => {
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let sent = 0
  let failed = 0

  for (const n of notifications ?? []) {
    let query = supabase.from('push_subscriptions').select('*').eq('recipient_role', n.recipient_role)
    query = n.recipient_technicien_id
      ? query.eq('recipient_technicien_id', n.recipient_technicien_id)
      : query.is('recipient_technicien_id', null)

    const { data: subs } = await query

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({ title: n.title, body: n.body, data: n.data }),
        )
        sent++
      } catch (e) {
        failed++
        const status = (e as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }

    await supabase.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', n.id)
  }

  return new Response(JSON.stringify({ processed: notifications?.length ?? 0, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
