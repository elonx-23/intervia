-- PSE Gestion — Phase 1 : techniciens + codes d'accès (auth custom)
create extension if not exists pgcrypto;

create table public.technicians (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  username text not null unique,
  role text not null check (role in ('admin', 'technicien')),
  technicien_id uuid references public.technicians(id) on delete set null,
  active boolean not null default true,
  label text,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS activé, sans policy pour anon/authenticated : tout accès passe par les
-- fonctions SECURITY DEFINER ci-dessous, pour ne jamais exposer la table
-- access_codes (et ses codes) directement au client.
alter table public.technicians enable row level security;
alter table public.access_codes enable row level security;

create or replace function public.verify_access_code(p_username text, p_code text)
returns table (
  session_id uuid,
  username text,
  role text,
  technicien_id uuid,
  technicien_first_name text,
  technicien_last_name text,
  label text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.access_codes ac
    set last_login_at = now()
    where ac.username = p_username
      and ac.code = p_code
      and ac.active = true;

  return query
    select ac.id, ac.username, ac.role, ac.technicien_id, t.first_name, t.last_name, ac.label
    from public.access_codes ac
    left join public.technicians t on t.id = ac.technicien_id
    where ac.username = p_username
      and ac.code = p_code
      and ac.active = true;
end;
$$;

create or replace function public.check_session_active(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select active from public.access_codes where id = p_session_id), false);
$$;

grant execute on function public.verify_access_code(text, text) to anon, authenticated;
grant execute on function public.check_session_active(uuid) to anon, authenticated;
