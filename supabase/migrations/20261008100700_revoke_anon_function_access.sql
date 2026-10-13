-- Signed-out visitors (the anon role) could call every API function.
--
-- Each migration ran `revoke all ... from public` and granted `authenticated`,
-- but Supabase's default privileges also grant EXECUTE on every new function
-- in the public schema to anon directly, and revoking from public does not
-- touch that grant. Every function checks the caller itself, so nothing
-- leaked (they return [], null or "Sign in first."), but signed-out visitors
-- should not reach them at all. Found by the API test sweep
-- (supabase/tests/api_test.py).
--
-- The one function the sign-up form calls before there is a session,
-- is_username_available, keeps its anon grant.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proowner = current_user::regrole
      and p.proname <> 'is_username_available'
      -- Extension functions (pg_trgm) belong to their extension.
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('revoke execute on function %s from anon', f.sig);
  end loop;
end;
$$;

-- Functions created by later migrations start without the anon grant.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
