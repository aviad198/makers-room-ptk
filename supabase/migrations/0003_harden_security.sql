-- Security hardening flagged by the Supabase database linter.
--
-- Only needed for projects created before these fixes were folded into
-- 0001_init.sql. Safe (and a no-op) to run on a fresh database.

-- 0028/0029: handle_new_user() is SECURITY DEFINER and therefore exposed by
-- PostgREST at /rest/v1/rpc/handle_new_user. Only the auth.users trigger
-- should invoke it; that trigger runs as the table owner and is unaffected.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 0011: pin the search_path so a caller cannot influence the function.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 0014: keep extensions out of the public schema. The reservations exclusion
-- constraint references btree_gist operator classes by OID, so relocating the
-- extension does not affect it.
do $$
begin
  if exists (
    select 1
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'btree_gist'
       and n.nspname = 'public'
  ) then
    create schema if not exists extensions;
    execute 'alter extension btree_gist set schema extensions';
  end if;
end $$;
