-- PSE Gestion — Phase 3/4/5 : devis + factures (table unifiée "documents")
create sequence public.devis_ref_seq;
create sequence public.facture_ref_seq;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('devis', 'facture')),
  number text not null unique,
  intervention_id uuid references public.interventions(id) on delete set null,
  client_first_name text not null default '',
  client_last_name text not null default '',
  phone text,
  address text,
  email text,
  items jsonb not null default '[]'::jsonb,
  vat_rate numeric(5, 2) not null default 20,
  notes text,
  issue_date date not null default current_date,
  validity_date date,
  status text not null default 'brouillon',
  photos_before jsonb not null default '[]'::jsonb,
  photos_after jsonb not null default '[]'::jsonb,
  public_token uuid not null default gen_random_uuid() unique,
  signed_at timestamptz,
  signature_data text,
  paid_at timestamptz,
  payment_method text,
  source_devis_id uuid references public.documents(id) on delete set null,
  created_by uuid references public.access_codes(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint documents_status_check check (
    (kind = 'devis' and status in ('brouillon', 'envoye', 'signe', 'expire'))
    or (kind = 'facture' and status in ('emise', 'payee'))
  )
);

create index documents_kind_idx on public.documents (kind, created_at desc);
create index documents_intervention_idx on public.documents (intervention_id);

alter table public.documents enable row level security;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

-- NB : pas de session Supabase Auth (auth custom par code), donc on ne peut
-- pas restreindre l'upload à "l'utilisateur propriétaire" via storage RLS.
-- Compromis assumé : la clé anon peut écrire/lire dans ce bucket. À durcir
-- plus tard en faisant passer les uploads par une edge function qui vérifie
-- p_session_id, si besoin.
create policy "documents bucket insert" on storage.objects for insert to anon with check (bucket_id = 'documents');
create policy "documents bucket select" on storage.objects for select to anon using (bucket_id = 'documents');
create policy "documents bucket delete" on storage.objects for delete to anon using (bucket_id = 'documents');

create or replace function public._next_number(p_kind text)
returns text
language sql
as $$
  select case
    when p_kind = 'devis' then 'DEV-' || lpad(nextval('public.devis_ref_seq')::text, 5, '0')
    else 'FAC-' || lpad(nextval('public.facture_ref_seq')::text, 5, '0')
  end;
$$;

create or replace function public._can_access_document(p_caller record, p_session_id uuid, p_doc public.documents)
returns boolean
language plpgsql
as $$
begin
  if p_caller.role = 'admin' then
    return true;
  end if;
  if p_doc.created_by = p_session_id then
    return true;
  end if;
  if p_doc.intervention_id is not null and exists (
    select 1 from public.interventions i where i.id = p_doc.intervention_id and i.technicien_id = p_caller.technicien_id
  ) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.create_document(
  p_session_id uuid,
  p_kind text,
  p_intervention_id uuid,
  p_client_first_name text,
  p_client_last_name text,
  p_phone text,
  p_address text,
  p_email text,
  p_items jsonb,
  p_vat_rate numeric,
  p_notes text,
  p_validity_date date,
  p_photos_before jsonb
)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.documents;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;
  if p_kind <> 'devis' then
    raise exception 'Seuls les devis peuvent être créés directement';
  end if;

  insert into public.documents (
    kind, number, intervention_id, client_first_name, client_last_name, phone, address, email,
    items, vat_rate, notes, validity_date, photos_before, status, created_by
  ) values (
    'devis', public._next_number('devis'), p_intervention_id, p_client_first_name, p_client_last_name,
    p_phone, p_address, p_email, coalesce(p_items, '[]'::jsonb), coalesce(p_vat_rate, 20), p_notes,
    p_validity_date, coalesce(p_photos_before, '[]'::jsonb), 'brouillon', p_session_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.update_document(
  p_session_id uuid,
  p_id uuid,
  p_client_first_name text,
  p_client_last_name text,
  p_phone text,
  p_address text,
  p_email text,
  p_items jsonb,
  p_vat_rate numeric,
  p_notes text,
  p_validity_date date,
  p_photos_before jsonb,
  p_photos_after jsonb
)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.documents;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  select * into v_row from public.documents where id = p_id;
  if v_row is null then
    raise exception 'Document introuvable';
  end if;
  if not public._can_access_document(caller, p_session_id, v_row) then
    raise exception 'Accès refusé';
  end if;

  update public.documents
    set client_first_name = p_client_first_name,
        client_last_name = p_client_last_name,
        phone = p_phone,
        address = p_address,
        email = p_email,
        items = coalesce(p_items, items),
        vat_rate = coalesce(p_vat_rate, vat_rate),
        notes = p_notes,
        validity_date = p_validity_date,
        photos_before = coalesce(p_photos_before, photos_before),
        photos_after = coalesce(p_photos_after, photos_after)
    where id = p_id
    returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.list_documents(p_session_id uuid, p_kind text)
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
    return query select * from public.documents where kind = p_kind order by created_at desc;
  else
    return query
      select d.* from public.documents d
      where d.kind = p_kind
        and (
          d.created_by = p_session_id
          or (d.intervention_id is not null and exists (
            select 1 from public.interventions i where i.id = d.intervention_id and i.technicien_id = caller.technicien_id
          ))
        )
      order by d.created_at desc;
  end if;
end;
$$;

create or replace function public.get_document(p_session_id uuid, p_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.documents;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  select * into v_row from public.documents where id = p_id;
  if v_row is null then
    raise exception 'Document introuvable';
  end if;
  if not public._can_access_document(caller, p_session_id, v_row) then
    raise exception 'Accès refusé';
  end if;

  return v_row;
end;
$$;

-- Accès public (page /signer/:token ou /facture/:token, sans session).
create or replace function public.get_document_by_token(p_token uuid)
returns public.documents
language sql
security definer
set search_path = public
as $$
  select * from public.documents where public_token = p_token;
$$;

create or replace function public.sign_document_public(p_token uuid, p_signature_data text)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.documents;
  v_client text;
  v_total numeric;
begin
  select * into v_row from public.documents where public_token = p_token and kind = 'devis';
  if v_row is null then
    raise exception 'Devis introuvable';
  end if;
  if v_row.status not in ('brouillon', 'envoye') then
    raise exception 'Ce devis ne peut plus être signé';
  end if;

  update public.documents
    set status = 'signe', signed_at = now(), signature_data = p_signature_data
    where id = v_row.id
    returning * into v_row;

  v_client := trim(v_row.client_first_name || ' ' || v_row.client_last_name);
  select coalesce(sum((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0)
    into v_total
    from jsonb_array_elements(v_row.items) as item;

  perform public._notify_admin(
    'devis_signe',
    '✅ Devis accepté !',
    v_client || ' — ' || round(v_total * (1 + v_row.vat_rate / 100), 2) || ' €',
    jsonb_build_object('document_id', v_row.id)
  );

  return v_row;
end;
$$;

create or replace function public.convert_devis_to_facture(p_session_id uuid, p_devis_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_devis public.documents;
  v_facture public.documents;
  v_client text;
  v_total numeric;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  select * into v_devis from public.documents where id = p_devis_id and kind = 'devis';
  if v_devis is null then
    raise exception 'Devis introuvable';
  end if;
  if v_devis.status <> 'signe' then
    raise exception 'Seul un devis signé peut être transformé en facture';
  end if;

  insert into public.documents (
    kind, number, intervention_id, client_first_name, client_last_name, phone, address, email,
    items, vat_rate, notes, photos_before, status, source_devis_id, created_by
  ) values (
    'facture', public._next_number('facture'), v_devis.intervention_id, v_devis.client_first_name,
    v_devis.client_last_name, v_devis.phone, v_devis.address, v_devis.email, v_devis.items,
    v_devis.vat_rate, v_devis.notes, v_devis.photos_before, 'emise', v_devis.id, p_session_id
  )
  returning * into v_facture;

  if v_devis.intervention_id is not null then
    update public.interventions set status = 'facturee' where id = v_devis.intervention_id;
  end if;

  v_client := trim(v_facture.client_first_name || ' ' || v_facture.client_last_name);
  select coalesce(sum((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0)
    into v_total
    from jsonb_array_elements(v_facture.items) as item;

  perform public._notify_admin(
    'facture_creee',
    '🧾 Facture à acquitter !',
    v_client || ' — ' || round(v_total * (1 + v_facture.vat_rate / 100), 2) || ' € — ' || v_facture.number,
    jsonb_build_object('document_id', v_facture.id)
  );

  return v_facture;
end;
$$;

create or replace function public.mark_facture_paid(p_session_id uuid, p_id uuid, p_payment_method text)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.documents;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null or caller.role <> 'admin' then
    raise exception 'Accès refusé';
  end if;

  update public.documents
    set status = 'payee', paid_at = now(), payment_method = p_payment_method
    where id = p_id and kind = 'facture'
    returning * into v_row;

  if v_row is null then
    raise exception 'Facture introuvable';
  end if;

  return v_row;
end;
$$;

create or replace function public.duplicate_document(p_session_id uuid, p_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_src public.documents;
  v_row public.documents;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  select * into v_src from public.documents where id = p_id;
  if v_src is null or not public._can_access_document(caller, p_session_id, v_src) then
    raise exception 'Accès refusé';
  end if;

  insert into public.documents (
    kind, number, intervention_id, client_first_name, client_last_name, phone, address, email,
    items, vat_rate, notes, validity_date, photos_before, status, created_by
  ) values (
    v_src.kind, public._next_number(v_src.kind), v_src.intervention_id, v_src.client_first_name,
    v_src.client_last_name, v_src.phone, v_src.address, v_src.email, v_src.items, v_src.vat_rate,
    v_src.notes, v_src.validity_date, v_src.photos_before,
    case when v_src.kind = 'devis' then 'brouillon' else 'emise' end, p_session_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_document(p_session_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller record;
  v_row public.documents;
begin
  select * into caller from public._caller(p_session_id);
  if caller is null then
    raise exception 'Session invalide';
  end if;

  select * into v_row from public.documents where id = p_id;
  if v_row is null or not public._can_access_document(caller, p_session_id, v_row) then
    raise exception 'Accès refusé';
  end if;

  delete from public.documents where id = p_id;
end;
$$;

grant execute on function public.create_document(uuid, text, uuid, text, text, text, text, text, jsonb, numeric, text, date, jsonb) to anon, authenticated;
grant execute on function public.update_document(uuid, uuid, text, text, text, text, text, jsonb, numeric, text, date, jsonb, jsonb) to anon, authenticated;
grant execute on function public.list_documents(uuid, text) to anon, authenticated;
grant execute on function public.get_document(uuid, uuid) to anon, authenticated;
grant execute on function public.get_document_by_token(uuid) to anon, authenticated;
grant execute on function public.sign_document_public(uuid, text) to anon, authenticated;
grant execute on function public.convert_devis_to_facture(uuid, uuid) to anon, authenticated;
grant execute on function public.mark_facture_paid(uuid, uuid, text) to anon, authenticated;
grant execute on function public.duplicate_document(uuid, uuid) to anon, authenticated;
grant execute on function public.delete_document(uuid, uuid) to anon, authenticated;
