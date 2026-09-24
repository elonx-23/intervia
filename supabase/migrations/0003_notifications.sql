-- PSE Gestion — Phase 6 (base) : notifications in-app + abonnements push
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_role text not null check (recipient_role in ('admin', 'technicien')),
  recipient_technicien_id uuid references public.technicians(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_admin_idx on public.notifications (created_at desc) where recipient_role = 'admin';
create index notifications_technicien_idx on public.notifications (recipient_technicien_id, created_at desc);

alter table public.notifications enable row level security;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  recipient_role text not null check (recipient_role in ('admin', 'technicien')),
  recipient_technicien_id uuid references public.technicians(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Helpers internes (non exposés en RPC publique) utilisés par d'autres
-- fonctions SECURITY DEFINER pour créer des notifications.
create or replace function public._notify_admin(p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (recipient_role, type, title, body, data)
  values ('admin', p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public._notify_technicien(p_technicien_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (recipient_role, recipient_technicien_id, type, title, body, data)
  values ('technicien', p_technicien_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public.list_notifications(p_session_id uuid)
returns setof public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  if caller.role = 'admin' then
    return query select * from public.notifications where recipient_role = 'admin' order by created_at desc limit 200;
  else
    return query
      select * from public.notifications
      where recipient_role = 'technicien' and recipient_technicien_id = caller.technicien_id
      order by created_at desc limit 200;
  end if;
end;
$$;

create or replace function public.mark_notification_read(p_session_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  update public.notifications
    set read_at = now()
    where id = p_id
      and (
        (caller.role = 'admin' and recipient_role = 'admin')
        or (recipient_role = 'technicien' and recipient_technicien_id = caller.technicien_id)
      );
end;
$$;

create or replace function public.mark_all_notifications_read(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  if caller.role = 'admin' then
    update public.notifications set read_at = now() where recipient_role = 'admin' and read_at is null;
  else
    update public.notifications set read_at = now()
      where recipient_role = 'technicien' and recipient_technicien_id = caller.technicien_id and read_at is null;
  end if;
end;
$$;

create or replace function public.save_push_subscription(p_session_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  insert into public.push_subscriptions (recipient_role, recipient_technicien_id, endpoint, p256dh, auth)
  values (caller.role, caller.technicien_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        recipient_role = excluded.recipient_role, recipient_technicien_id = excluded.recipient_technicien_id;
end;
$$;

create or replace function public.remove_push_subscription(p_session_id uuid, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

grant execute on function public.list_notifications(uuid) to anon, authenticated;
grant execute on function public.mark_notification_read(uuid, uuid) to anon, authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to anon, authenticated;
grant execute on function public.save_push_subscription(uuid, text, text, text) to anon, authenticated;
grant execute on function public.remove_push_subscription(uuid, text) to anon, authenticated;
