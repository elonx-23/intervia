-- PSE Gestion — Phase 8 : gestion des techniciens (admin)
create or replace function public.create_technician(
  p_session_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_username text,
  p_code text
)
returns public.technicians
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.technicians;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  insert into public.technicians (first_name, last_name, phone)
  values (p_first_name, p_last_name, p_phone)
  returning * into v_row;

  insert into public.access_codes (username, code, role, technicien_id, label)
  values (p_username, p_code, 'technicien', v_row.id, p_first_name || ' ' || p_last_name);

  return v_row;
end;
$$;

create or replace function public.update_technician(
  p_session_id uuid,
  p_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text
)
returns public.technicians
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.technicians;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  update public.technicians
    set first_name = p_first_name, last_name = p_last_name, phone = p_phone
    where id = p_id
    returning * into v_row;

  if v_row is null then
    raise exception 'Technicien introuvable';
  end if;

  update public.access_codes set label = p_first_name || ' ' || p_last_name where technicien_id = p_id;

  return v_row;
end;
$$;

create or replace function public.set_technician_active(p_session_id uuid, p_id uuid, p_active boolean)
returns public.technicians
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.technicians;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  update public.technicians set active = p_active where id = p_id returning * into v_row;
  if v_row is null then
    raise exception 'Technicien introuvable';
  end if;

  update public.access_codes set active = p_active where technicien_id = p_id;

  return v_row;
end;
$$;

create or replace function public.delete_technician(p_session_id uuid, p_id uuid)
returns void
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

  delete from public.access_codes where technicien_id = p_id;
  delete from public.technicians where id = p_id;
end;
$$;

create or replace function public.regenerate_technician_code(p_session_id uuid, p_id uuid, p_code text)
returns void
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

  update public.access_codes set code = p_code where technicien_id = p_id;
end;
$$;

create or replace function public.list_technicians_with_codes(p_session_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  phone text,
  active boolean,
  created_at timestamptz,
  username text,
  code text
)
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

  return query
    select t.id, t.first_name, t.last_name, t.phone, t.active, t.created_at, ac.username, ac.code
    from public.technicians t
    left join public.access_codes ac on ac.technicien_id = t.id
    order by t.first_name, t.last_name;
end;
$$;

grant execute on function public.create_technician(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_technician(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.set_technician_active(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.delete_technician(uuid, uuid) to anon, authenticated;
grant execute on function public.regenerate_technician_code(uuid, uuid, text) to anon, authenticated;
grant execute on function public.list_technicians_with_codes(uuid) to anon, authenticated;
