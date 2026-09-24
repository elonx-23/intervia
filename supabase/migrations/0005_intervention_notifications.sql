-- PSE Gestion — notifications liées aux interventions (assignation + urgent)
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

  perform public._notify_technicien(
    p_technicien_id,
    'intervention_assignee',
    'Nouvelle intervention',
    trim(v_row.client_first_name || ' ' || v_row.client_last_name) || ' — ' || coalesce(v_row.intervention_type, ''),
    jsonb_build_object('intervention_id', v_row.id, 'address', v_row.address)
  );

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

  if p_technicien_id is not null then
    perform public._notify_technicien(
      p_technicien_id,
      'intervention_assignee',
      'Nouvelle intervention',
      trim(v_row.client_first_name || ' ' || v_row.client_last_name) || ' — ' || coalesce(v_row.intervention_type, ''),
      jsonb_build_object('intervention_id', v_row.id, 'address', v_row.address)
    );
  end if;

  return v_row;
end;
$$;

create or replace function public.broadcast_urgent_notification(p_session_id uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  t record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  for t in select id from public.technicians where active = true loop
    perform public._notify_technicien(t.id, 'urgent', p_title, p_body, '{}'::jsonb);
  end loop;
end;
$$;

grant execute on function public.broadcast_urgent_notification(uuid, text, text) to anon, authenticated;
