-- PSE Gestion — déclenchement périodique de la livraison push (edge function)
-- No-op tant que app_settings n'a pas été rempli après déploiement des edge
-- functions (voir README "Déploiement des edge functions").
create extension if not exists pg_net;

create or replace function public.trigger_push_delivery()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_url text;
  v_service_key text;
begin
  select value into v_base_url from public.app_settings where key = 'functions_base_url';
  select value into v_service_key from public.app_settings where key = 'service_role_key';

  if v_base_url is null or v_service_key is null then
    return;
  end if;

  perform net.http_post(
    url := v_base_url || '/send-push-notification',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_service_key, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule('pse-push-delivery', '* * * * *', $$select public.trigger_push_delivery();$$);
