-- Read-only inspection for Supabase SQL Editor. No user rows, passwords or tokens.
-- Supabase owns auth.*; never rename, drop or directly rewrite those tables.
select table_schema, table_name
from information_schema.tables
where table_schema in ('auth', 'public') and table_type = 'BASE TABLE'
order by table_schema, table_name;

select schemaname, tablename, rowsecurity
from pg_tables where schemaname = 'public' order by tablename;

select schemaname, tablename, policyname, roles, cmd
from pg_policies where schemaname = 'public' order by tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select count(*) as total_accounts,
       count(*) filter (where email_confirmed_at is not null) as confirmed_accounts,
       count(*) filter (where email_confirmed_at is null) as unconfirmed_accounts
from auth.users;
