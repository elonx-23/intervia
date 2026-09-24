-- PSE Gestion — Phase 2 : fiches d'intervention
create sequence public.intervention_ref_seq;

create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('INT-' || lpad(nextval('public.intervention_ref_seq')::text, 5, '0')),
  client_first_name text not null default '',
  client_last_name text not null default '',
  phone text,
  address text,
  intervention_type text not null default '',
  description text,
  amount numeric(10, 2),
  status text not null default 'en_attente'
    check (status in ('en_attente', 'assignee', 'acceptee', 'en_cours', 'terminee', 'validee', 'facturee')),
  technicien_id uuid references public.technicians(id) on delete set null,
  photos jsonb not null default '[]'::jsonb,
  reminder_count int not null default 0,
  created_by uuid references public.access_codes(id) on delete set null,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  validated_at timestamptz
);

create index interventions_status_idx on public.interventions (status);
create index interventions_technicien_idx on public.interventions (technicien_id);

alter table public.interventions enable row level security;
-- Pas de policy anon/authenticated : tout passe par les RPC SECURITY DEFINER
-- ci-dessous, qui vérifient le rôle/la propriété via p_session_id.

-- Retourne (role, technicien_id) pour une session active, ou rien si invalide.
create or replace function public._caller(p_session_id uuid)
returns table (role text, technicien_id uuid)
language sql
security definer
set search_path = public
as $$
  select ac.role, ac.technicien_id
  from public.access_codes ac
  where ac.id = p_session_id and ac.active = true;
$$;

create or replace function public.list_interventions(p_session_id uuid)
returns setof public.interventions
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
    return query select * from public.interventions order by created_at desc;
  else
    return query
      select * from public.interventions
      where technicien_id = caller.technicien_id
      order by created_at desc;
  end if;
end;
$$;

create or replace function public.get_intervention(p_session_id uuid, p_id uuid)
returns public.interventions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.interventions;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  select * into v_row from public.interventions where id = p_id;
  if v_row is null then
    raise exception 'Intervention introuvable';
  end if;
  if caller.role <> 'admin' and v_row.technicien_id is distinct from caller.technicien_id then
    raise exception 'Accès refusé';
  end if;

  return v_row;
end;
$$;

create or replace function public.create_intervention(
  p_session_id uuid,
  p_client_first_name text,
  p_client_last_name text,
  p_phone text,
  p_address text,
  p_intervention_type text,
  p_description text,
  p_amount numeric,
  p_technicien_id uuid
)
returns public.interventions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.interventions;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  insert into public.interventions (
    client_first_name, client_last_name, phone, address, intervention_type,
    description, amount, technicien_id, status, assigned_at, created_by
  ) values (
    p_client_first_name, p_client_last_name, p_phone, p_address, p_intervention_type,
    p_description, p_amount, p_technicien_id,
    case when p_technicien_id is not null then 'assignee' else 'en_attente' end,
    case when p_technicien_id is not null then now() else null end,
    p_session_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.assign_intervention(p_session_id uuid, p_id uuid, p_technicien_id uuid)
returns public.interventions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.interventions;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  update public.interventions
    set technicien_id = p_technicien_id,
        status = 'assignee',
        assigned_at = now(),
        reminder_count = 0
    where id = p_id
    returning * into v_row;

  if v_row is null then
    raise exception 'Intervention introuvable';
  end if;

  return v_row;
end;
$$;

create or replace function public.update_intervention_status(p_session_id uuid, p_id uuid, p_status text)
returns public.interventions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.interventions;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  select * into v_row from public.interventions where id = p_id;
  if v_row is null then
    raise exception 'Intervention introuvable';
  end if;
  if caller.role <> 'admin' and v_row.technicien_id is distinct from caller.technicien_id then
    raise exception 'Accès refusé';
  end if;
  if p_status not in ('en_attente', 'assignee', 'acceptee', 'en_cours', 'terminee', 'validee', 'facturee') then
    raise exception 'Statut invalide';
  end if;

  update public.interventions
    set status = p_status,
        accepted_at = case when p_status = 'acceptee' then now() else accepted_at end,
        started_at = case when p_status = 'en_cours' then now() else started_at end,
        completed_at = case when p_status = 'terminee' then now() else completed_at end,
        validated_at = case when p_status = 'validee' then now() else validated_at end
    where id = p_id
    returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_intervention(
  p_session_id uuid,
  p_id uuid,
  p_client_first_name text,
  p_client_last_name text,
  p_phone text,
  p_address text,
  p_intervention_type text,
  p_description text,
  p_amount numeric
)
returns public.interventions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.interventions;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  update public.interventions
    set client_first_name = p_client_first_name,
        client_last_name = p_client_last_name,
        phone = p_phone,
        address = p_address,
        intervention_type = p_intervention_type,
        description = p_description,
        amount = p_amount
    where id = p_id
    returning * into v_row;

  if v_row is null then
    raise exception 'Intervention introuvable';
  end if;

  return v_row;
end;
$$;

create or replace function public.list_technicians(p_session_id uuid)
returns setof public.technicians
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  return query select * from public.technicians order by first_name, last_name;
end;
$$;

grant execute on function public.list_technicians(uuid) to anon, authenticated;
grant execute on function public.list_interventions(uuid) to anon, authenticated;
grant execute on function public.get_intervention(uuid, uuid) to anon, authenticated;
grant execute on function public.create_intervention(uuid, text, text, text, text, text, text, numeric, uuid) to anon, authenticated;
grant execute on function public.assign_intervention(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.update_intervention_status(uuid, uuid, text) to anon, authenticated;
grant execute on function public.update_intervention(uuid, uuid, text, text, text, text, text, text, numeric) to anon, authenticated;
