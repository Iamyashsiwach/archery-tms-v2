-- RLS test plan for 0002_policies.sql
--
-- Paste the whole file into the Supabase SQL editor and run it.
-- It returns one row per check, failures first. Every row must have pass = true.
--
-- Nothing persists. Fixtures are created inside one function call and rolled
-- back before it returns, and every individual attempt is rolled back too, so
-- checks cannot affect each other. Safe to run against a database with data.
--
-- How a check works: the SQL is run as `anon` or as `authenticated` with a JWT
-- for a fixture user, exactly as PostgREST would. `got` is the number of rows
-- written or read, or -1 when Postgres refused outright (RLS check failure,
-- missing grant, or the archers column trigger).
--   allow → got > 0
--   deny  → got <= 0   (refused, or the policy hid every row)
-- Any other error is shown in `got` and always fails: it means the statement
-- was authorized and something unrelated stopped it.
-- Every "deny" on a write has a matching "allow" so a policy set that blocks
-- everything cannot pass.

create or replace function pg_temp.sub(p_sql text, p_ids jsonb) returns text
language plpgsql as $$
declare k text; v text;
begin
  for k, v in select * from jsonb_each_text(p_ids) loop
    p_sql := replace(p_sql, '{' || k || '}', quote_literal(v));
  end loop;
  return p_sql;
end $$;

create or replace function pg_temp.attempt(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare n bigint; err text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object(
      'sub', p_user,
      'role', case when p_user is null then 'anon' else 'authenticated' end)::text, true);
    if p_user is null then set local role anon; else set local role authenticated; end if;

    if p_sql ~* '^\s*select' then
      execute format('select count(*) from (%s) q', p_sql) into n;
    else
      execute p_sql;
      get diagnostics n = row_count;
    end if;

    raise exception 'attempt_rollback';
  exception
    when insufficient_privilege then n := -1;
    -- Anything else means the statement got past authorization and was stopped
    -- by something unrelated (a constraint, a bad fixture). That is never a pass.
    when others then
      if sqlerrm <> 'attempt_rollback' then err := 'ERROR ' || sqlstate || ': ' || sqlerrm; end if;
  end;
  return coalesce(err, n::text);
end $$;

create or replace function pg_temp.rls_suite()
returns table (n int, pass boolean, test text, expected text, got text)
language plpgsql as $suite$
declare
  ids jsonb;
  report jsonb := '[]';
  c record;
  g text;
begin
  select jsonb_object_agg(k, gen_random_uuid()) into ids
  from unnest(array[
    'U_OFF','U_JUDGE','U_COACH','U_COACH2','U_REVOKED','U_OUT',
    'T1','T2',
    'M_OFF','M_JUDGE','M_COACH','M_COACH2','M_REVOKED','M_OUT',
    'C_SETUP','C_REG','C_ALLOC','C_QUAL','C_ELIM','C_T2_REG','C_T2_QUAL',
    'D_SETUP','D_REG','D_ALLOC','D_QUAL','D_ELIM','D_T2_REG','D_T2_QUAL',
    'A_REG_OWN','A_REG_OTHER','A_REG_LOCKED','A_DELETED','A_ALLOC',
    'A_QUAL_B1','A_QUAL_B2','A_ELIM_1','A_ELIM_2','A_ELIM_3','A_T2_QUAL',
    'MATCH','E1','IB'
  ]) k;

  begin
    -- ------------------------------------------------------------ fixtures
    -- T1 is published and has one division in each phase that matters.
    -- T2 is a different, unpublished event whose only official is U_OUT.
    -- The judge is assigned bale 1 in T1. Coach owns most T1 archers.
    execute pg_temp.sub($f$
      insert into auth.users (id, email) values
        ({U_OFF}, 'rls-official@test.invalid'), ({U_JUDGE}, 'rls-judge@test.invalid'),
        ({U_COACH}, 'rls-coach@test.invalid'), ({U_COACH2}, 'rls-coach2@test.invalid'),
        ({U_REVOKED}, 'rls-revoked@test.invalid'), ({U_OUT}, 'rls-outsider@test.invalid');

      insert into profiles (id, full_name, phone) values
        ({U_OFF}, 'Test Official', '+91 90000 00001'),
        ({U_COACH}, 'Test Coach', '+91 90000 00003');

      insert into tournaments (id, name, start_date, owner_id, is_published) values
        ({T1}, 'RLS test — published', current_date, {U_OFF}, true),
        ({T2}, 'RLS test — other event', current_date, {U_OUT}, false);

      insert into memberships (id, tournament_id, user_id, invited_email, role, status) values
        ({M_OFF},     {T1}, {U_OFF},     'rls-official@test.invalid', 'OFFICIAL', 'ACTIVE'),
        ({M_JUDGE},   {T1}, {U_JUDGE},   'rls-judge@test.invalid',    'JUDGE',    'ACTIVE'),
        ({M_COACH},   {T1}, {U_COACH},   'rls-coach@test.invalid',    'COACH',    'ACTIVE'),
        ({M_COACH2},  {T1}, {U_COACH2},  'rls-coach2@test.invalid',   'COACH',    'ACTIVE'),
        ({M_REVOKED}, {T1}, {U_REVOKED}, 'rls-revoked@test.invalid',  'COACH',    'REVOKED'),
        ({M_OUT},     {T2}, {U_OUT},     'rls-outsider@test.invalid', 'OFFICIAL', 'ACTIVE');

      insert into categories (id, tournament_id, bow_style, gender, age_class, display_name, round_code, match_format_code) values
        ({C_SETUP},   {T1}, 'RECURVE', 'M', 'SUB_JUNIOR', 'c-setup', 'WA720_70', 'RECURVE_INDIVIDUAL'),
        ({C_REG},     {T1}, 'RECURVE', 'M', 'CADET',      'c-reg',   'WA720_70', 'RECURVE_INDIVIDUAL'),
        ({C_ALLOC},   {T1}, 'RECURVE', 'M', 'JUNIOR',     'c-alloc', 'WA720_70', 'RECURVE_INDIVIDUAL'),
        ({C_QUAL},    {T1}, 'RECURVE', 'M', 'SENIOR',     'c-qual',  'WA720_70', 'RECURVE_INDIVIDUAL'),
        ({C_ELIM},    {T1}, 'RECURVE', 'M', 'MASTER',     'c-elim',  'WA720_70', 'RECURVE_INDIVIDUAL'),
        ({C_T2_REG},  {T2}, 'RECURVE', 'M', 'SENIOR',     'c-t2-reg',  'WA720_70', 'RECURVE_INDIVIDUAL'),
        ({C_T2_QUAL}, {T2}, 'RECURVE', 'W', 'SENIOR',     'c-t2-qual', 'WA720_70', 'RECURVE_INDIVIDUAL');

      insert into divisions (id, tournament_id, category_id, phase) values
        ({D_SETUP}, {T1}, {C_SETUP}, 'SETUP'),
        ({D_REG},   {T1}, {C_REG},   'REGISTRATION'),
        ({D_ALLOC}, {T1}, {C_ALLOC}, 'ALLOCATION'),
        ({D_QUAL},  {T1}, {C_QUAL},  'QUALIFICATION'),
        ({D_ELIM},  {T1}, {C_ELIM},  'ELIMINATION'),
        ({D_T2_REG},  {T2}, {C_T2_REG},  'REGISTRATION'),
        ({D_T2_QUAL}, {T2}, {C_T2_QUAL}, 'QUALIFICATION');

      insert into archers (id, tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class,
                           bale_number, slot_index, registration_locked, deleted_at) values
        ({A_REG_OWN},    {T1}, {D_REG},   {M_COACH},  'Own archer',         'RECURVE','M','CADET',  null, null, false, null),
        ({A_REG_OTHER},  {T1}, {D_REG},   {M_COACH2}, 'Other coach archer', 'RECURVE','M','CADET',  null, null, false, null),
        ({A_REG_LOCKED}, {T1}, {D_REG},   {M_COACH},  'Submitted archer',   'RECURVE','M','CADET',  null, null, true,  null),
        ({A_DELETED},    {T1}, {D_REG},   {M_COACH},  'Withdrawn archer',   'RECURVE','M','CADET',  null, null, false, now()),
        ({A_ALLOC},      {T1}, {D_ALLOC}, {M_COACH},  'Awaiting target',    'RECURVE','M','JUNIOR', null, null, true,  null),
        ({A_QUAL_B1},    {T1}, {D_QUAL},  {M_COACH},  'Bale one archer',    'RECURVE','M','SENIOR', 1, 1, true, null),
        ({A_QUAL_B2},    {T1}, {D_QUAL},  {M_COACH},  'Bale two archer',    'RECURVE','M','SENIOR', 2, 1, true, null),
        ({A_ELIM_1},     {T1}, {D_ELIM},  {M_COACH},  'Finalist one',       'RECURVE','M','MASTER', 1, 1, true, null),
        ({A_ELIM_2},     {T1}, {D_ELIM},  {M_COACH2}, 'Finalist two',       'RECURVE','M','MASTER', 1, 2, true, null),
        ({A_ELIM_3},     {T1}, {D_ELIM},  {M_COACH2}, 'Not in the final',   'RECURVE','M','MASTER', 1, 3, true, null),
        ({A_T2_QUAL},    {T2}, {D_T2_QUAL}, null,     'Other event archer', 'RECURVE','W','SENIOR', 1, 1, true, null);

      insert into judge_assignments (tournament_id, membership_id, bale_number) values ({T1}, {M_JUDGE}, 1);

      insert into matches (id, tournament_id, division_id, round, match_number, archer1_id, archer2_id, status)
        values ({MATCH}, {T1}, {D_ELIM}, 'FINAL', 1, {A_ELIM_1}, {A_ELIM_2}, 'ACTIVE');

      insert into ends (id, tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
        values ({E1}, {T1}, {D_QUAL}, {A_QUAL_B1}, 'QUALIFICATION', 1, '[10,9,9,8,8,7]', 51, {M_JUDGE});

      insert into results (tournament_id, division_id, archer_id, qualification_total)
        values ({T1}, {D_QUAL}, {A_QUAL_B1}, 51);

      insert into import_batches (id, tournament_id, membership_id, source) values ({IB}, {T1}, {M_COACH}, 'CSV');
      insert into import_rows (batch_id, row_index, raw) values ({IB}, 0, '["row"]');
      insert into audit_log (tournament_id, action) values ({T1}, 'RLS_TEST');
    $f$, ids);

    -- ------------------------------------------------------------ checks
    for c in select * from (values

      -- COACH ------------------------------------------------------------
      ('coach: register own archer in REGISTRATION division', 'U_COACH', 'allow',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T1}, {D_REG}, {M_COACH}, 'New', 'RECURVE', 'M', 'CADET')$q$),
      ('coach: register into ALLOCATION division', 'U_COACH', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T1}, {D_ALLOC}, {M_COACH}, 'New', 'RECURVE', 'M', 'JUNIOR')$q$),
      ('coach: register into QUALIFICATION division', 'U_COACH', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T1}, {D_QUAL}, {M_COACH}, 'New', 'RECURVE', 'M', 'SENIOR')$q$),
      ('coach: register with no division', 'U_COACH', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T1}, null, {M_COACH}, 'New', 'RECURVE', 'M', 'CADET')$q$),
      ('coach: register under another coach''s membership', 'U_COACH', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T1}, {D_REG}, {M_COACH2}, 'New', 'RECURVE', 'M', 'CADET')$q$),
      ('coach: register with a bale already set', 'U_COACH', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class, bale_number)
          values ({T1}, {D_REG}, {M_COACH}, 'New', 'RECURVE', 'M', 'CADET', 1)$q$),
      ('coach: register into another event''s REGISTRATION division', 'U_COACH', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T1}, {D_T2_REG}, {M_COACH}, 'New', 'RECURVE', 'M', 'SENIOR')$q$),
      ('coach: register into another event using own membership', 'U_COACH', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T2}, {D_T2_REG}, {M_COACH}, 'New', 'RECURVE', 'M', 'SENIOR')$q$),
      ('coach (revoked): register with revoked membership', 'U_REVOKED', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T1}, {D_REG}, {M_REVOKED}, 'New', 'RECURVE', 'M', 'CADET')$q$),
      ('coach: edit own unlocked archer in REGISTRATION', 'U_COACH', 'allow',
       $q$update archers set full_name = 'Renamed' where id = {A_REG_OWN}$q$),
      ('coach: submit own archer (lock)', 'U_COACH', 'allow',
       $q$update archers set registration_locked = true where id = {A_REG_OWN}$q$),
      ('coach: edit another coach''s archer', 'U_COACH', 'deny',
       $q$update archers set full_name = 'Renamed' where id = {A_REG_OTHER}$q$),
      ('coach: edit own archer after submitting', 'U_COACH', 'deny',
       $q$update archers set full_name = 'Renamed' where id = {A_REG_LOCKED}$q$),
      ('coach: edit own archer once division is in ALLOCATION', 'U_COACH', 'deny',
       $q$update archers set full_name = 'Renamed' where id = {A_ALLOC}$q$),
      ('coach: move own archer into ALLOCATION division', 'U_COACH', 'deny',
       $q$update archers set division_id = {D_ALLOC} where id = {A_REG_OWN}$q$),
      ('coach: hand own archer to another coach', 'U_COACH', 'deny',
       $q$update archers set membership_id = {M_COACH2} where id = {A_REG_OWN}$q$),
      ('coach: set bale on own archer', 'U_COACH', 'deny',
       $q$update archers set bale_number = 1 where id = {A_REG_OWN}$q$),
      ('coach: hard delete own archer', 'U_COACH', 'deny',
       $q$delete from archers where id = {A_REG_OWN}$q$),
      ('coach: read own membership', 'U_COACH', 'allow',
       $q$select 1 from memberships where id = {M_COACH}$q$),
      ('coach: read other people''s memberships', 'U_COACH', 'deny',
       $q$select 1 from memberships where id <> {M_COACH}$q$),
      ('coach: read official''s profile (phone)', 'U_COACH', 'deny',
       $q$select 1 from profiles where id = {U_OFF}$q$),
      ('coach: read another event''s archers', 'U_COACH', 'deny',
       $q$select 1 from archers where tournament_id = {T2}$q$),
      ('coach: insert an end', 'U_COACH', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_QUAL_B1}, 'QUALIFICATION', 2, '[10,9,9,8,8,7]', 51, {M_COACH})$q$),
      ('coach: advance a division phase', 'U_COACH', 'deny',
       $q$update divisions set phase = 'ALLOCATION' where id = {D_REG}$q$),
      ('coach: create a team', 'U_COACH', 'deny',
       $q$insert into teams (tournament_id, division_id, name) values ({T1}, {D_REG}, 'Team')$q$),
      ('coach: stage an import row directly', 'U_COACH', 'deny',
       $q$insert into import_rows (batch_id, row_index, raw) values ({IB}, 1, '["row"]')$q$),
      ('coach: read own import batch', 'U_COACH', 'allow',
       $q$select 1 from import_rows where batch_id = {IB}$q$),
      ('coach: read audit log', 'U_COACH', 'deny',
       $q$select 1 from audit_log$q$),

      -- JUDGE ------------------------------------------------------------
      ('judge: qualification end, own bale, QUALIFICATION division', 'U_JUDGE', 'allow',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_QUAL_B1}, 'QUALIFICATION', 2, '[10,9,9,8,8,7]', 51, {M_JUDGE})$q$),
      ('judge: qualification end, bale not assigned', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_QUAL_B2}, 'QUALIFICATION', 1, '[10,9,9,8,8,7]', 51, {M_JUDGE})$q$),
      ('judge: qualification end in an ELIMINATION division', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_ELIM}, {A_ELIM_3}, 'QUALIFICATION', 1, '[10,9,9,8,8,7]', 51, {M_JUDGE})$q$),
      ('judge: qualification end claiming the wrong division', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_ELIM_3}, 'QUALIFICATION', 1, '[10,9,9,8,8,7]', 51, {M_JUDGE})$q$),
      ('judge: qualification end carrying a match_id', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, match_id, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_QUAL_B1}, 'QUALIFICATION', {MATCH}, 2, '[10,9,9,8,8,7]', 51, {M_JUDGE})$q$),
      ('judge: elimination end for a match participant', 'U_JUDGE', 'allow',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, match_id, end_number, arrows, total, entered_by)
          values ({T1}, {D_ELIM}, {A_ELIM_1}, 'ELIMINATION', {MATCH}, 1, '[10,9,9]', 28, {M_JUDGE})$q$),
      ('judge: elimination end with no match_id', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_ELIM}, {A_ELIM_1}, 'ELIMINATION', 1, '[10,9,9]', 28, {M_JUDGE})$q$),
      ('judge: elimination end for an archer not in that match', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, match_id, end_number, arrows, total, entered_by)
          values ({T1}, {D_ELIM}, {A_ELIM_3}, 'ELIMINATION', {MATCH}, 1, '[10,9,9]', 28, {M_JUDGE})$q$),
      ('judge: elimination end in a QUALIFICATION division', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, match_id, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_QUAL_B1}, 'ELIMINATION', {MATCH}, 1, '[10,9,9]', 28, {M_JUDGE})$q$),
      ('judge: SHOOT_OFF end (no policy yet)', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, match_id, end_number, arrows, total, entered_by)
          values ({T1}, {D_ELIM}, {A_ELIM_1}, 'SHOOT_OFF', {MATCH}, 1, '[10]', 10, {M_JUDGE})$q$),
      ('judge: end attributed to the official', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_QUAL_B1}, 'QUALIFICATION', 2, '[10,9,9,8,8,7]', 51, {M_OFF})$q$),
      ('judge: end marked verified on entry', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by, verified_by, verified_at)
          values ({T1}, {D_QUAL}, {A_QUAL_B1}, 'QUALIFICATION', 2, '[10,9,9,8,8,7]', 51, {M_JUDGE}, {M_JUDGE}, now())$q$),
      ('judge: end in another event on the same bale number', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T2}, {D_T2_QUAL}, {A_T2_QUAL}, 'QUALIFICATION', 1, '[10,9,9,8,8,7]', 51, {M_JUDGE})$q$),
      ('judge: end under own event for another event''s archer', 'U_JUDGE', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_T2_QUAL}, 'QUALIFICATION', 1, '[10,9,9,8,8,7]', 51, {M_JUDGE})$q$),
      ('judge: rewrite an existing end', 'U_JUDGE', 'deny',
       $q$update ends set arrows = '["X","X","X","X","X","X"]', total = 60 where id = {E1}$q$),
      ('judge: delete an end', 'U_JUDGE', 'deny',
       $q$delete from ends where id = {E1}$q$),
      ('judge: allocate a bale', 'U_JUDGE', 'deny',
       $q$update archers set bale_number = 1, slot_index = 1 where id = {A_ALLOC}$q$),
      ('judge: set a match winner', 'U_JUDGE', 'deny',
       $q$update matches set winner_archer_id = {A_ELIM_1}, status = 'COMPLETE' where id = {MATCH}$q$),
      ('judge: award a medal in results', 'U_JUDGE', 'deny',
       $q$update results set medal = 'GOLD' where archer_id = {A_QUAL_B1}$q$),
      ('judge: assign self another bale', 'U_JUDGE', 'deny',
       $q$insert into judge_assignments (tournament_id, membership_id, bale_number) values ({T1}, {M_JUDGE}, 2)$q$),
      ('judge: read ends in own event', 'U_JUDGE', 'allow',
       $q$select 1 from ends where tournament_id = {T1}$q$),

      -- OFFICIAL ---------------------------------------------------------
      ('official: edit own tournament', 'U_OFF', 'allow',
       $q$update tournaments set venue = 'Main range' where id = {T1}$q$),
      ('official: edit another event', 'U_OFF', 'deny',
       $q$update tournaments set venue = 'Hijacked' where id = {T2}$q$),
      ('official: create a tournament', 'U_OFF', 'deny',
       $q$insert into tournaments (name, start_date, owner_id) values ('New', current_date, {U_OFF})$q$),
      ('official: delete own tournament', 'U_OFF', 'deny',
       $q$delete from tournaments where id = {T1}$q$),
      ('official: add a category', 'U_OFF', 'allow',
       $q$insert into categories (tournament_id, bow_style, gender, age_class, display_name, round_code, match_format_code)
          values ({T1}, 'COMPOUND', 'W', 'SENIOR', 'New', 'WA720_50_80CM', 'COMPOUND_INDIVIDUAL')$q$),
      ('official: add a category to another event', 'U_OFF', 'deny',
       $q$insert into categories (tournament_id, bow_style, gender, age_class, display_name, round_code, match_format_code)
          values ({T2}, 'COMPOUND', 'W', 'SENIOR', 'New', 'WA720_50_80CM', 'COMPOUND_INDIVIDUAL')$q$),
      ('official: edit a category whose divisions are all SETUP', 'U_OFF', 'allow',
       $q$update categories set round_code = 'WA720_60' where id = {C_SETUP}$q$),
      ('official: change round of a category in QUALIFICATION', 'U_OFF', 'deny',
       $q$update categories set round_code = 'WA720_60' where id = {C_QUAL}$q$),
      ('official: delete a category with scored divisions', 'U_OFF', 'deny',
       $q$delete from categories where id = {C_QUAL}$q$),
      ('official: add a SETUP division', 'U_OFF', 'allow',
       $q$insert into divisions (tournament_id, category_id, event_kind) values ({T1}, {C_SETUP}, 'TEAM')$q$),
      ('official: add a division straight into QUALIFICATION', 'U_OFF', 'deny',
       $q$insert into divisions (tournament_id, category_id, event_kind, phase) values ({T1}, {C_SETUP}, 'TEAM', 'QUALIFICATION')$q$),
      ('official: add a division using another event''s category', 'U_OFF', 'deny',
       $q$insert into divisions (tournament_id, category_id, event_kind) values ({T1}, {C_T2_REG}, 'TEAM')$q$),
      ('official: edit a SETUP division', 'U_OFF', 'allow',
       $q$update divisions set bracket_size = 16 where id = {D_SETUP}$q$),
      ('official: advance phase SETUP → REGISTRATION directly', 'U_OFF', 'deny',
       $q$update divisions set phase = 'REGISTRATION' where id = {D_SETUP}$q$),
      ('official: reopen QUALIFICATION → REGISTRATION directly', 'U_OFF', 'deny',
       $q$update divisions set phase = 'REGISTRATION' where id = {D_QUAL}$q$),
      ('official: delete a division in QUALIFICATION', 'U_OFF', 'deny',
       $q$delete from divisions where id = {D_QUAL}$q$),
      ('official: assign a judge to a bale', 'U_OFF', 'allow',
       $q$insert into judge_assignments (tournament_id, membership_id, bale_number) values ({T1}, {M_JUDGE}, 2)$q$),
      ('official: assign a coach as judge', 'U_OFF', 'deny',
       $q$insert into judge_assignments (tournament_id, membership_id, bale_number) values ({T1}, {M_COACH}, 2)$q$),
      ('official: assign judges in another event', 'U_OFF', 'deny',
       $q$insert into judge_assignments (tournament_id, membership_id, bale_number) values ({T2}, {M_OUT}, 2)$q$),
      ('official: remove a judge assignment', 'U_OFF', 'allow',
       $q$delete from judge_assignments where membership_id = {M_JUDGE}$q$),
      ('official: set bale and slot in ALLOCATION', 'U_OFF', 'allow',
       $q$update archers set bale_number = 3, slot_index = 2 where id = {A_ALLOC}$q$),
      ('official: rename an archer while allocating', 'U_OFF', 'deny',
       $q$update archers set full_name = 'Renamed', bale_number = 3 where id = {A_ALLOC}$q$),
      ('official: move an archer to another division while allocating', 'U_OFF', 'deny',
       $q$update archers set division_id = {D_REG} where id = {A_ALLOC}$q$),
      ('official: set bale during REGISTRATION', 'U_OFF', 'deny',
       $q$update archers set bale_number = 3 where id = {A_REG_OWN}$q$),
      ('official: move bale during QUALIFICATION', 'U_OFF', 'deny',
       $q$update archers set bale_number = 3 where id = {A_QUAL_B1}$q$),
      ('official: register an archer', 'U_OFF', 'deny',
       $q$insert into archers (tournament_id, division_id, membership_id, full_name, bow_style, gender, age_class)
          values ({T1}, {D_REG}, {M_OFF}, 'New', 'RECURVE', 'M', 'CADET')$q$),
      ('official: insert an end', 'U_OFF', 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total, entered_by)
          values ({T1}, {D_QUAL}, {A_QUAL_B1}, 'QUALIFICATION', 2, '[10,9,9,8,8,7]', 51, {M_OFF})$q$),
      ('official: delete an end', 'U_OFF', 'deny',
       $q$delete from ends where id = {E1}$q$),
      ('official: write results', 'U_OFF', 'deny',
       $q$insert into results (tournament_id, division_id, archer_id) values ({T1}, {D_QUAL}, {A_QUAL_B2})$q$),
      ('official: update results', 'U_OFF', 'deny',
       $q$update results set medal = 'GOLD' where tournament_id = {T1}$q$),
      ('official: write audit log', 'U_OFF', 'deny',
       $q$insert into audit_log (tournament_id, action) values ({T1}, 'FORGED')$q$),
      ('official: erase audit log', 'U_OFF', 'deny',
       $q$delete from audit_log where tournament_id = {T1}$q$),
      ('official: set a match winner', 'U_OFF', 'deny',
       $q$update matches set winner_archer_id = {A_ELIM_2} where id = {MATCH}$q$),
      ('official: invite by inserting a membership', 'U_OFF', 'deny',
       $q$insert into memberships (tournament_id, invited_email, role) values ({T1}, 'new@test.invalid', 'ADMIN')$q$),
      ('official: promote a coach to ADMIN', 'U_OFF', 'deny',
       $q$update memberships set role = 'ADMIN' where id = {M_COACH}$q$),
      ('official: read memberships in own event', 'U_OFF', 'allow',
       $q$select 1 from memberships where tournament_id = {T1}$q$),
      ('official: read memberships in another event', 'U_OFF', 'deny',
       $q$select 1 from memberships where tournament_id = {T2}$q$),
      ('official: read a coach''s profile in own event', 'U_OFF', 'allow',
       $q$select 1 from profiles where id = {U_COACH}$q$),
      ('official: read audit log of own event', 'U_OFF', 'allow',
       $q$select 1 from audit_log where tournament_id = {T1}$q$),
      ('official: edit another person''s profile', 'U_OFF', 'deny',
       $q$update profiles set phone = null where id = {U_COACH}$q$),
      ('official: edit own profile', 'U_OFF', 'allow',
       $q$update profiles set phone = null where id = {U_OFF}$q$),

      -- OUTSIDER (official of T2 only) -----------------------------------
      ('outsider: read T1 archers', 'U_OUT', 'deny',
       $q$select 1 from archers where tournament_id = {T1}$q$),
      ('outsider: read T1 profiles', 'U_OUT', 'deny',
       $q$select 1 from profiles where id in ({U_OFF}, {U_COACH})$q$),
      ('outsider: allocate a T1 archer', 'U_OUT', 'deny',
       $q$update archers set bale_number = 9 where id = {A_ALLOC}$q$),
      ('outsider: assign a T1 judge', 'U_OUT', 'deny',
       $q$insert into judge_assignments (tournament_id, membership_id, bale_number) values ({T1}, {M_JUDGE}, 9)$q$),

      -- ANON: public views -----------------------------------------------
      ('anon: public_tournaments shows published event', null, 'allow',
       $q$select 1 from public_tournaments where id = {T1}$q$),
      ('anon: public_tournaments hides unpublished event', null, 'deny',
       $q$select 1 from public_tournaments where id = {T2}$q$),
      ('anon: public_divisions', null, 'allow',
       $q$select 1 from public_divisions where tournament_id = {T1}$q$),
      ('anon: public_archers', null, 'allow',
       $q$select 1 from public_archers where tournament_id = {T1}$q$),
      ('anon: public_archers hides unpublished event', null, 'deny',
       $q$select 1 from public_archers where tournament_id = {T2}$q$),
      ('anon: public_archers hides withdrawn archer', null, 'deny',
       $q$select 1 from public_archers where id = {A_DELETED}$q$),
      ('anon: public_ends', null, 'allow',
       $q$select 1 from public_ends where tournament_id = {T1}$q$),
      ('anon: public_matches', null, 'allow',
       $q$select 1 from public_matches where tournament_id = {T1}$q$),
      ('anon: public_results', null, 'allow',
       $q$select 1 from public_results where tournament_id = {T1}$q$),
      ('anon: write through public_tournaments', null, 'deny',
       $q$update public_tournaments set name = 'Hijacked' where id = {T1}$q$),
      ('authenticated: write through public_tournaments', 'U_COACH', 'deny',
       $q$update public_tournaments set name = 'Hijacked' where id = {T1}$q$),
      ('authenticated: insert through public_tournaments', 'U_COACH', 'deny',
       $q$insert into public_tournaments (name, start_date) values ('Fake', current_date)$q$),

      -- ANON: writes -----------------------------------------------------
      ('anon: insert an end', null, 'deny',
       $q$insert into ends (tournament_id, division_id, archer_id, stage, end_number, arrows, total)
          values ({T1}, {D_QUAL}, {A_QUAL_B1}, 'QUALIFICATION', 2, '[10,9,9,8,8,7]', 51)$q$),
      ('anon: award a medal', null, 'deny',
       $q$update results set medal = 'GOLD'$q$),
      ('anon: advance a phase', null, 'deny',
       $q$update divisions set phase = 'COMPLETE'$q$)

    ) v(test, who, expected, sql)
    loop
      g := pg_temp.attempt((ids ->> c.who)::uuid, pg_temp.sub(c.sql, ids));
      report := report || jsonb_build_object('test', c.test, 'expected', c.expected, 'got', g);
    end loop;

    -- ANON: every base table, generated so a new table cannot be missed.
    for c in select tablename from pg_tables where schemaname = 'public' order by tablename loop
      g := pg_temp.attempt(null, format('select 1 from public.%I', c.tablename));
      report := report || jsonb_build_object('test', 'anon: read base table ' || c.tablename, 'expected', 'deny', 'got', g);
    end loop;

    raise exception 'suite_rollback';
  exception when raise_exception then
    if sqlerrm <> 'suite_rollback' then raise; end if;
  end;

  -- ------------------------------------------------------------ catalog
  -- Structural guarantees. `got` is the number of violations.
  report := report
    || jsonb_build_object('test', 'catalog: every public table has RLS enabled', 'expected', 'deny', 'got',
         (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity))
    || jsonb_build_object('test', 'catalog: no write policy is using (true) / with check (true)', 'expected', 'deny', 'got',
         (select count(*) from pg_policies where schemaname = 'public' and cmd <> 'SELECT'
            and (qual = 'true' or with_check = 'true')))
    || jsonb_build_object('test', 'catalog: every policy is scoped to authenticated only', 'expected', 'deny', 'got',
         (select count(*) from pg_policies where schemaname = 'public' and roles <> '{authenticated}'))
    || jsonb_build_object('test', 'catalog: anon holds no privilege on any base table', 'expected', 'deny', 'got',
         (select count(*) from information_schema.role_table_grants g
            join pg_tables t on t.schemaname = g.table_schema and t.tablename = g.table_name
          where g.grantee = 'anon' and g.table_schema = 'public'))
    || jsonb_build_object('test', 'catalog: no client role can write results or audit_log', 'expected', 'deny', 'got',
         (select count(*) from information_schema.role_table_grants
          where table_schema = 'public' and table_name in ('results', 'audit_log')
            and grantee in ('anon', 'authenticated', 'PUBLIC')
            and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')))
    || jsonb_build_object('test', 'catalog: public views are select-only for client roles', 'expected', 'deny', 'got',
         (select count(*) from information_schema.role_table_grants
          where table_schema = 'public' and table_name like 'public\_%'
            and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT'))
    || jsonb_build_object('test', 'catalog: public views expose no contact or attribution column', 'expected', 'deny', 'got',
         (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name like 'public\_%'
            and column_name in ('invited_email', 'email', 'phone', 'user_id', 'owner_id',
                                'membership_id', 'entered_by', 'verified_by', 'actor_id', 'state')));

  return query
    select (x.ord)::int,
           case when x.e ->> 'got' !~ '^-?\d+$' then false
                when x.e ->> 'expected' = 'allow' then (x.e ->> 'got')::bigint > 0
                else (x.e ->> 'got')::bigint <= 0 end,
           x.e ->> 'test', x.e ->> 'expected', x.e ->> 'got'
    from jsonb_array_elements(report) with ordinality as x(e, ord);
end $suite$;

select * from pg_temp.rls_suite() order by pass, n;
