-- PSE Gestion — Phase 7 : statistiques

-- Petit helper : total HT d'un tableau d'articles jsonb [{quantity, unitPrice}]
create or replace function public.documents_items_total(p_items jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(sum((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item;
$$;

create or replace function public.get_admin_stats(p_session_id uuid, p_from date, p_to date)
returns table (
  total_interventions bigint,
  ca numeric,
  en_cours bigint,
  terminees bigint,
  factures_impayees bigint,
  ca_impaye numeric
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
  select
    (select count(*) from public.interventions i where i.created_at::date between p_from and p_to),
    (select coalesce(sum(public.documents_items_total(d.items) * (1 + d.vat_rate / 100)), 0) from public.documents d
      where d.kind = 'facture' and d.issue_date between p_from and p_to),
    (select count(*) from public.interventions i where i.status = 'en_cours'),
    (select count(*) from public.interventions i where i.status in ('terminee', 'validee') and i.created_at::date between p_from and p_to),
    (select count(*) from public.documents d where d.kind = 'facture' and d.status = 'emise'),
    (select coalesce(sum(public.documents_items_total(d.items) * (1 + d.vat_rate / 100)), 0) from public.documents d
      where d.kind = 'facture' and d.status = 'emise');
end;
$$;

create or replace function public.get_technicien_stats(p_session_id uuid, p_from date, p_to date)
returns table (
  total_interventions bigint,
  ca numeric,
  terminees bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'technicien' then
    raise exception 'Accès refusé';
  end if;

  return query
  select
    (select count(*) from public.interventions i where i.technicien_id = caller.technicien_id and i.created_at::date between p_from and p_to),
    (select coalesce(sum(i.amount), 0) from public.interventions i
      where i.technicien_id = caller.technicien_id and i.status in ('terminee', 'validee', 'facturee')
      and i.created_at::date between p_from and p_to),
    (select count(*) from public.interventions i where i.technicien_id = caller.technicien_id and i.status in ('terminee', 'validee') and i.created_at::date between p_from and p_to);
end;
$$;

create or replace function public.list_unpaid_documents(p_session_id uuid)
returns setof public.documents
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
    return query select * from public.documents where kind = 'facture' and status = 'emise' order by created_at desc;
  else
    return query
      select d.* from public.documents d
      join public.interventions i on i.id = d.intervention_id
      where d.kind = 'facture' and d.status = 'emise' and i.technicien_id = caller.technicien_id
      order by d.created_at desc;
  end if;
end;
$$;

create or replace function public.list_releve_interventions(p_session_id uuid, p_from date, p_to date)
returns setof public.interventions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'technicien' then
    raise exception 'Accès refusé';
  end if;

  return query
    select * from public.interventions
    where technicien_id = caller.technicien_id
      and status in ('terminee', 'validee')
      and created_at::date between p_from and p_to
    order by created_at asc;
end;
$$;

grant execute on function public.get_admin_stats(uuid, date, date) to anon, authenticated;
grant execute on function public.get_technicien_stats(uuid, date, date) to anon, authenticated;
grant execute on function public.list_unpaid_documents(uuid) to anon, authenticated;
grant execute on function public.list_releve_interventions(uuid, date, date) to anon, authenticated;
