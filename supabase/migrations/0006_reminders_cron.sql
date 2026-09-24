-- PSE Gestion — rappels automatiques (4 messages / 10 min) + message quotidien 19h
-- Architecture : la logique "in-app" (compteur + ligne notifications) tourne
-- entièrement en SQL via pg_cron, sans dépendre d'une edge function déployée.
-- La livraison push (VAPID) est un layer séparé : la colonne pushed_at repère
-- les notifications pas encore envoyées en push ; une edge function
-- (send-push-notification) les traite quand elle est déployée.
alter table public.notifications add column pushed_at timestamptz;

create table public.app_settings (
  key text primary key,
  value text
);

alter table public.app_settings enable row level security;
-- Pas de policy anon/authenticated : lu uniquement par les fonctions
-- SECURITY DEFINER ci-dessous (URL des edge functions, etc.), jamais exposé
-- au client.

create or replace function public.run_intervention_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i record;
  v_label text;
begin
  for i in
    select * from public.interventions
    where status = 'assignee'
      and technicien_id is not null
      and reminder_count < 3
      and assigned_at <= now() - (interval '10 minutes' * (reminder_count + 1))
  loop
    v_label := 'Rappel ' || (i.reminder_count + 1) || '/3 : ' ||
      trim(i.client_first_name || ' ' || i.client_last_name) || ' attend toujours';

    perform public._notify_technicien(
      i.technicien_id,
      'reminder',
      '⏰ ' || v_label,
      coalesce(i.address, ''),
      jsonb_build_object('intervention_id', i.id)
    );

    update public.interventions set reminder_count = reminder_count + 1 where id = i.id;
  end loop;
end;
$$;

create or replace function public.run_daily_service_message()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  messages text[] := array[
    'Le service est ouvert ! Prêt à cartonner aujourd''hui ? 💪',
    'C''est parti pour une nouvelle journée de dépannage ! 🔧',
    'Le service démarre — à toi de jouer ! ⚡',
    'Nouvelle journée, nouvelles interventions. On y va ! 🚀',
    'Service ouvert — reste joignable, les clients comptent sur toi 📞',
    'C''est l''heure ! Le service PSE est lancé pour la journée 🛠️',
    'Journée qui commence, énergie à fond ! Le service est ouvert 🔥'
  ];
  t record;
begin
  for t in select id from public.technicians where active = true loop
    perform public._notify_technicien(
      t.id, 'daily_message', 'Service ouvert', messages[1 + floor(random() * array_length(messages, 1))::int]
    );
  end loop;
end;
$$;

create extension if not exists pg_cron;

select cron.schedule('pse-intervention-reminders', '*/10 * * * *', $$select public.run_intervention_reminders();$$);
-- 19h heure française = 17h ou 18h UTC selon l'heure d'été/hiver ; 18h UTC
-- couvre l'heure d'été (CEST, UTC+2). À ajuster en hiver (CET, UTC+1) si besoin,
-- ou remplacer par une logique tenant compte du fuseau Europe/Paris.
select cron.schedule('pse-daily-service-message', '0 17 * * *', $$select public.run_daily_service_message();$$);
