-- Platform probe only. Creates temporary tables, touches no existing rows,
-- and rolls the entire transaction back. This is NOT an app migration.
begin;
create temporary table champions_phase01_owners (id uuid primary key) on commit drop;
create temporary table champions_phase01_rows (
  id integer primary key,
  owner_id uuid not null references champions_phase01_owners(id),
  points integer not null check (points between 0 and 32)
) on commit drop;
insert into champions_phase01_owners values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into champions_phase01_rows values
  (1, '00000000-0000-4000-8000-000000000001', 0),
  (2, '00000000-0000-4000-8000-000000000002', 32);

do $$ begin
  begin
    insert into champions_phase01_rows values (3, '00000000-0000-4000-8000-000000000001', 33);
    raise exception 'CHECK constraint did not reject 33';
  exception when check_violation then null; end;
  begin
    insert into champions_phase01_rows values (1, '00000000-0000-4000-8000-000000000001', 0);
    raise exception 'PRIMARY KEY did not reject duplicate';
  exception when unique_violation then null; end;
  begin
    insert into champions_phase01_rows values (3, '00000000-0000-4000-8000-000000000003', 0);
    raise exception 'FOREIGN KEY did not reject unknown owner';
  exception when foreign_key_violation then null; end;
end $$;

alter table champions_phase01_rows enable row level security;
create policy own_rows on champions_phase01_rows for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
grant select on champions_phase01_rows to anon;
grant select, insert, update, delete on champions_phase01_rows to authenticated;

set local role anon;
do $$ begin
  if (select count(*) from pg_temp.champions_phase01_rows) <> 0 then
    raise exception 'Anonymous role can read protected rows';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
set local role authenticated;
do $$ begin
  if (select count(*) from pg_temp.champions_phase01_rows) <> 1 then
    raise exception 'Owner isolation failed';
  end if;
  if exists (select 1 from pg_temp.champions_phase01_rows where id = 2) then
    raise exception 'Other owner row is visible';
  end if;
  begin
    update pg_temp.champions_phase01_rows
      set owner_id = '00000000-0000-4000-8000-000000000002' where id = 1;
    raise exception 'RLS allowed ownership reassignment';
  exception when insufficient_privilege then null; end;
  begin
    insert into pg_temp.champions_phase01_rows values (3, '00000000-0000-4000-8000-000000000002', 1);
    raise exception 'RLS allowed insert for other owner';
  exception when insufficient_privilege then null; end;
  update pg_temp.champions_phase01_rows set points = 1 where id = 1;
  if not exists (select 1 from pg_temp.champions_phase01_rows where id = 1 and points = 1) then
    raise exception 'Own update failed';
  end if;
end $$;
reset role;
rollback;
select 'PASS: temporary CHECK/PK/FK, anonymous deny, owner SELECT/UPDATE/INSERT and WITH CHECK; rolled back' as result;
