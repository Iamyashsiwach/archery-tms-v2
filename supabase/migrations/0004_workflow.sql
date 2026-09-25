-- archery-tms v2 — the workflow layer
--
-- What an event needs beyond 0001–0003:
--   1. ends carry their own arithmetic
--   2. elimination targets, shoot-offs, ranking shoot-off outcomes
--   3. an audit row for every change, written by the database itself
--   4. people: create a tournament, invite, revoke
--   5. imports staged by coaches and committed atomically
--   6. the judge's closest-to-centre call
--   7. derived writes and phase transitions, service role only
--
-- Functions in section 7 trust their payload because only server code holding
-- the service-role key can call them, after requireMembership. The rules engine
-- (src/lib/rules) stays the single implementation of scoring, ranking and
-- brackets; these functions only persist its output atomically.

-- ---------------------------------------------------------------- 1. ends

-- Totals are derived from the arrows as shot, so no client can store a total
-- that disagrees with its arrows. Legal values match arrowPoints() in
-- src/lib/rules/scoring.ts: "X", "M" or an integer 0–10.
create or replace function ends_derive_totals() returns trigger
language plpgsql set search_path = public as $$
declare
  a jsonb;
  v int;
begin
  if jsonb_typeof(new.arrows) is distinct from 'array' or jsonb_array_length(new.arrows) = 0 then
    raise exception 'arrows must be a non-empty array' using errcode = 'check_violation';
  end if;

  new.total := 0;
  new.ten_count := 0;
  new.x_count := 0;

  for a in select value from jsonb_array_elements(new.arrows) loop
    if a = '"X"' then
      v := 10;
      new.x_count := new.x_count + 1;
    elsif a = '"M"' then
      v := 0;
    elsif jsonb_typeof(a) = 'number' and a::text ~ '^([0-9]|10)$' then
      v := a::text::int;
    else
      raise exception 'illegal arrow value %', a using errcode = 'check_violation';
    end if;
    if v = 10 then new.ten_count := new.ten_count + 1; end if;
    new.total := new.total + v;
  end loop;

  return new;
end $$;

create trigger ends_derive_totals before insert or update on ends
  for each row execute function ends_derive_totals();

-- Retries and a second device must not double-count a match end.
create unique index ends_match_end_unique on ends (match_id, archer_id, stage, end_number)
  where match_id is not null and archer_id is not null;

-- ---------------------------------------------------------------- 2. matches, results

alter table matches
  -- Elimination is usually shot on different targets from qualification.
  add column bale_number int,
  -- The judge's call when a shoot-off is level on score: which side is closer.
  add column closest_to_centre smallint check (closest_to_centre in (1, 2));

-- Outcome of a ranking shoot-off among archers level on total, tens and Xs:
-- 1 = best within that group. Officials record it in CUT; recalculation keeps it.
alter table results add column shoot_off_position int check (shoot_off_position > 0);

-- Judges score matches on the match's target when one is set, otherwise on the
-- archer's qualification target. SHOOT_OFF ends belong to a match.
drop policy ends_judge_insert on ends;
create policy ends_judge_insert on ends for insert to authenticated
  with check (
    current_role_in(tournament_id, array['JUDGE'])
    and entered_by in (
      select m.id from memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE'
        and m.tournament_id = ends.tournament_id
    )
    and verified_by is null and verified_at is null
    and team_id is null
    and exists (
      select 1 from archers a
      where a.id = ends.archer_id
        and a.tournament_id = ends.tournament_id
        and a.division_id = ends.division_id
        and a.deleted_at is null
        and (
          (ends.stage = 'QUALIFICATION' and ends.match_id is null
            and division_phase(ends.division_id) = 'QUALIFICATION'
            and judge_owns_bale(ends.tournament_id, a.bale_number))
          or
          (ends.stage in ('ELIMINATION', 'SHOOT_OFF')
            and division_phase(ends.division_id) = 'ELIMINATION'
            and exists (
              select 1 from matches mt
              where mt.id = ends.match_id
                and mt.division_id = ends.division_id
                and ends.archer_id in (mt.archer1_id, mt.archer2_id)
                and mt.status <> 'COMPLETE'
                and judge_owns_bale(ends.tournament_id, coalesce(mt.bale_number, a.bale_number))
            ))
        )
    )
  );

-- Officials assign elimination targets. The trigger keeps them to that column.
create policy matches_official_bale on matches for update to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL']) and division_phase(division_id) = 'ELIMINATION')
  with check (current_role_in(tournament_id, array['ADMIN','OFFICIAL']) and division_phase(division_id) = 'ELIMINATION');

create or replace function matches_official_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_role_in(old.tournament_id, array['ADMIN','OFFICIAL'])
     and (to_jsonb(new) - 'bale_number') is distinct from (to_jsonb(old) - 'bale_number') then
    raise exception 'officials may only change bale_number on matches'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger matches_official_columns before update on matches
  for each row execute function matches_official_columns();

create or replace view public_matches with (security_barrier) as
  select m.id, m.tournament_id, m.division_id, m.round, m.match_number, m.seed1, m.seed2,
         m.archer1_id, m.archer2_id, m.team1_id, m.team2_id,
         m.set_points_1, m.set_points_2, m.total_1, m.total_2,
         m.winner_archer_id, m.winner_team_id, m.decided_by, m.status, m.bale_number
  from matches m
  join tournaments t on t.id = m.tournament_id
  where t.is_published;

-- ---------------------------------------------------------------- 3. audit

-- Every change to these tables is recorded by the database, so no server action
-- can forget to audit and no direct API call can skip it. Service-role
-- functions name the person they act for in app.actor.
create or replace function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  -- Rows removed by a cascade go with their parent; auditing them would point
  -- audit_log at a tournament that is being deleted.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  insert into audit_log (tournament_id, division_id, actor_id, action, entity, entity_id, before, after)
  values (
    -- A deleted tournament or division cannot be referenced; `before` keeps its id.
    coalesce((rec->>'tournament_id')::uuid, case when tg_table_name = 'tournaments' and tg_op <> 'DELETE' then (rec->>'id')::uuid end),
    coalesce((rec->>'division_id')::uuid, case when tg_table_name = 'divisions' and tg_op <> 'DELETE' then (rec->>'id')::uuid end),
    coalesce(auth.uid(), nullif(current_setting('app.actor', true), '')::uuid),
    tg_op,
    tg_table_name,
    (rec->>'id')::uuid,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end $$;

create trigger audit_tournaments after insert or update or delete on tournaments
  for each row execute function audit_row_change();
create trigger audit_categories after insert or update or delete on categories
  for each row execute function audit_row_change();
create trigger audit_divisions after insert or update or delete on divisions
  for each row execute function audit_row_change();
create trigger audit_archers after insert or update or delete on archers
  for each row execute function audit_row_change();
create trigger audit_judge_assignments after insert or update or delete on judge_assignments
  for each row execute function audit_row_change();
create trigger audit_matches after insert or update or delete on matches
  for each row execute function audit_row_change();
-- Ends are append-only facts with entered_by; only corrections are audited.
create trigger audit_ends after update or delete on ends
  for each row execute function audit_row_change();

-- ---------------------------------------------------------------- 4. people

-- Any signed-in user can start a tournament and becomes its ADMIN. Other
-- tournaments stay invisible to them, so this opens nothing else.
create or replace function create_tournament(
  p_name text, p_start_date date, p_venue text default null, p_end_date date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_id uuid;
begin
  select email into v_email from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'sign_in_required' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_name), '') = '' or p_start_date is null then
    raise exception 'name_and_date_required' using errcode = 'check_violation';
  end if;

  insert into tournaments (name, venue, start_date, end_date, owner_id)
  values (trim(p_name), nullif(trim(p_venue), ''), p_start_date, p_end_date, auth.uid())
  returning id into v_id;

  insert into memberships (tournament_id, user_id, invited_email, role, status, invited_by, accepted_at)
  values (v_id, auth.uid(), v_email, 'ADMIN', 'ACTIVE', auth.uid(), now());

  return v_id;
end $$;

-- Officials invite OFFICIAL, JUDGE and COACH; only an ADMIN invites an ADMIN.
-- Re-inviting a revoked or expired address reuses its row.
create or replace function invite_member(
  p_tournament uuid, p_email text, p_role text, p_club text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  m memberships;
begin
  if not current_role_in(p_tournament, array['ADMIN','OFFICIAL'])
     or (p_role = 'ADMIN' and not current_role_in(p_tournament, array['ADMIN'])) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_role is null or p_role not in ('ADMIN','OFFICIAL','JUDGE','COACH') then
    raise exception 'invalid_role' using errcode = 'check_violation';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'check_violation';
  end if;

  select * into m from memberships
  -- lower() on both sides: citext = text would compare case-sensitively.
  where tournament_id = p_tournament and lower(invited_email::text) = v_email
  for update;
  if m.status = 'ACTIVE' then
    raise exception 'already_member' using errcode = 'check_violation';
  end if;

  insert into memberships (tournament_id, invited_email, role, club, status, invited_by, invited_at, expires_at)
  values (p_tournament, v_email, p_role, nullif(trim(p_club), ''), 'INVITED', auth.uid(), now(), now() + interval '14 days')
  on conflict (tournament_id, invited_email) do update
    set role = excluded.role, club = excluded.club, status = 'INVITED', user_id = null,
        invited_by = excluded.invited_by, invited_at = excluded.invited_at,
        expires_at = excluded.expires_at, accepted_at = null, revoked_at = null
  returning * into m;

  insert into audit_log (tournament_id, actor_id, action, entity, entity_id, after)
  values (p_tournament, auth.uid(), 'MEMBERSHIP_INVITE', 'memberships', m.id, to_jsonb(m));

  return m.id;
end $$;

-- Nobody revokes themselves (no locking yourself out), and only an ADMIN
-- revokes an ADMIN.
create or replace function revoke_member(p_membership uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m memberships;
begin
  select * into m from memberships where id = p_membership for update;
  if m.id is null
     or not current_role_in(m.tournament_id, array['ADMIN','OFFICIAL'])
     or (m.role = 'ADMIN' and not current_role_in(m.tournament_id, array['ADMIN']))
     or m.user_id is not distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if m.status = 'REVOKED' then
    return;
  end if;

  update memberships set status = 'REVOKED', revoked_at = now() where id = m.id;

  insert into audit_log (tournament_id, actor_id, action, entity, entity_id, before)
  values (m.tournament_id, auth.uid(), 'MEMBERSHIP_REVOKE', 'memberships', m.id, to_jsonb(m));
end $$;

-- ---------------------------------------------------------------- 5. imports

-- A coach stages rows in their own batch until it is committed. Nothing here
-- creates an archer; commit_import does, after a human has reviewed the rows.
create policy import_batches_coach_insert on import_batches for insert to authenticated
  with check (
    membership_id in (
      select m.id from memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
        and m.tournament_id = import_batches.tournament_id
    )
    and status in ('DRAFT','PARSING','REVIEW') and committed_at is null
  );

create policy import_batches_coach_update on import_batches for update to authenticated
  using (
    membership_id in (
      select m.id from memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
        and m.tournament_id = import_batches.tournament_id
    )
    and status <> 'COMMITTED'
  )
  with check (
    membership_id in (
      select m.id from memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
        and m.tournament_id = import_batches.tournament_id
    )
    and status <> 'COMMITTED' and committed_at is null
  );

create policy import_rows_coach_write on import_rows for all to authenticated
  using (
    exists (
      select 1 from import_batches b
      join memberships m on m.id = b.membership_id
      where b.id = import_rows.batch_id and b.status in ('DRAFT','PARSING','REVIEW')
        and m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
    )
  )
  with check (
    archer_id is null
    and exists (
      select 1 from import_batches b
      join memberships m on m.id = b.membership_id
      where b.id = import_rows.batch_id and b.status in ('DRAFT','PARSING','REVIEW')
        and m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
    )
  );

-- Creates one archer per reviewed row, all or nothing. Bow style, gender and
-- age class come from the chosen division's category, as for manual entry.
create or replace function commit_import(p_batch uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  b import_batches;
  r import_rows;
  div record;
  v_archer uuid;
  n int := 0;
begin
  select * into b from import_batches where id = p_batch for update;
  if b.id is null or not exists (
    select 1 from memberships m
    where m.id = b.membership_id and m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
  ) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if b.status <> 'REVIEW' then
    raise exception 'batch_not_in_review' using errcode = 'check_violation';
  end if;

  for r in select * from import_rows where batch_id = b.id and action = 'CREATE' order by row_index loop
    if coalesce(trim(r.parsed->>'full_name'), '') = '' then
      raise exception 'row % has no name', r.row_index + 1 using errcode = 'check_violation';
    end if;

    select d.id, c.bow_style, c.gender, c.age_class into div
    from divisions d join categories c on c.id = d.category_id
    where d.id::text = r.parsed->>'division_id'
      and d.tournament_id = b.tournament_id
      and d.phase = 'REGISTRATION' and d.event_kind = 'INDIVIDUAL';
    if not found then
      raise exception 'row % has no division open for registration', r.row_index + 1 using errcode = 'check_violation';
    end if;

    insert into archers (tournament_id, division_id, membership_id, full_name, club, state,
                         bow_style, gender, age_class, created_via, import_batch_id)
    values (b.tournament_id, div.id, b.membership_id, trim(r.parsed->>'full_name'),
            nullif(trim(r.parsed->>'club'), ''), nullif(trim(r.parsed->>'state'), ''),
            div.bow_style, div.gender, div.age_class, b.source, b.id)
    returning id into v_archer;

    update import_rows set archer_id = v_archer where id = r.id;
    n := n + 1;
  end loop;

  update import_batches set status = 'COMMITTED', committed_at = now(), row_count = n where id = b.id;

  insert into audit_log (tournament_id, actor_id, action, entity, entity_id, after)
  values (b.tournament_id, auth.uid(), 'IMPORT_COMMIT', 'import_batches', b.id, jsonb_build_object('archers', n));

  return n;
end $$;

-- ---------------------------------------------------------------- 6. judge's call

create or replace function record_closest_to_centre(p_match uuid, p_side smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  mt matches;
  v_bale int;
begin
  select * into mt from matches where id = p_match for update;
  select bale_number into v_bale from archers where id = mt.archer1_id;
  if mt.id is null
     or division_phase(mt.division_id) is distinct from 'ELIMINATION'
     or mt.status = 'COMPLETE'
     or not current_role_in(mt.tournament_id, array['JUDGE'])
     or not judge_owns_bale(mt.tournament_id, coalesce(mt.bale_number, v_bale)) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_side is null or p_side not in (1, 2) then
    raise exception 'invalid_side' using errcode = 'check_violation';
  end if;

  update matches set closest_to_centre = p_side where id = mt.id;
end $$;

-- ---------------------------------------------------------------- 7. service role only

-- Qualification standings computed by the rules engine. Ranks freeze once
-- elimination starts. final_rank, medal and shoot_off_position are kept.
create or replace function write_results(p_division uuid, p_rows jsonb) returns void
language plpgsql set search_path = public as $$
declare
  d divisions;
begin
  select * into d from divisions where id = p_division;
  if d.phase is distinct from 'QUALIFICATION' and d.phase is distinct from 'CUT' then
    raise exception 'results_frozen' using errcode = 'check_violation';
  end if;

  delete from results
  where division_id = d.id and archer_id is not null
    and archer_id not in (select (r->>'archer_id')::uuid from jsonb_array_elements(p_rows) r);

  insert into results (tournament_id, division_id, archer_id, qualification_total, qualification_tens,
                       qualification_xs, qualification_rank, needs_shoot_off, updated_at)
  select d.tournament_id, d.id, (r->>'archer_id')::uuid, (r->>'total')::int, (r->>'tens')::int,
         (r->>'xs')::int, (r->>'rank')::int, (r->>'needs_shoot_off')::boolean, now()
  from jsonb_array_elements(p_rows) r
  on conflict (division_id, archer_id) where archer_id is not null do update
    set qualification_total = excluded.qualification_total,
        qualification_tens = excluded.qualification_tens,
        qualification_xs = excluded.qualification_xs,
        qualification_rank = excluded.qualification_rank,
        needs_shoot_off = excluded.needs_shoot_off,
        updated_at = now();
end $$;

-- A match's state as evaluated by the rules engine, plus the bracket slots its
-- result fills (winner onward, semifinal losers into bronze).
create or replace function apply_match(p_match uuid, p_state jsonb, p_patches jsonb default '[]') returns void
language plpgsql set search_path = public as $$
declare
  mt matches;
begin
  select * into mt from matches where id = p_match for update;
  if mt.id is null or division_phase(mt.division_id) is distinct from 'ELIMINATION' then
    raise exception 'match_not_open' using errcode = 'check_violation';
  end if;

  update matches set
    set_points_1 = (p_state->>'set_points_1')::int,
    set_points_2 = (p_state->>'set_points_2')::int,
    total_1 = (p_state->>'total_1')::int,
    total_2 = (p_state->>'total_2')::int,
    status = p_state->>'status',
    winner_archer_id = (p_state->>'winner_archer_id')::uuid,
    decided_by = p_state->>'decided_by'
  where id = mt.id;

  update matches m set
    archer1_id = case when p ? 'archer1_id' then (p->>'archer1_id')::uuid else m.archer1_id end,
    archer2_id = case when p ? 'archer2_id' then (p->>'archer2_id')::uuid else m.archer2_id end
  from jsonb_array_elements(p_patches) p
  where m.division_id = mt.division_id and m.match_number = (p->>'match_number')::int;
end $$;

-- The one way a division changes phase. Forward moves check the preconditions
-- in CLAUDE.md; a move back one phase is a reopen and needs a written reason.
-- p_actor is the official the server verified; it is checked again here.
-- p_payload carries what only the rules engine can compute:
--   QUALIFICATION → CUT     { expected_ends }
--   CUT → ELIMINATION       { bracket_size, seeds: [{archer_id, seed}], matches: [...] }
--   ELIMINATION → COMPLETE  { placings: [{archer_id, final_rank, medal}] }
--   REGISTRATION → ALLOCATION { force_close: true } to lock rosters not yet submitted
create or replace function transition_division(
  p_division uuid, p_to text, p_actor uuid, p_reason text default null, p_payload jsonb default '{}'
) returns void
language plpgsql set search_path = public as $$
declare
  phases constant text[] := array['SETUP','REGISTRATION','ALLOCATION','QUALIFICATION','CUT','ELIMINATION','COMPLETE'];
  d divisions;
  from_i int;
  to_i int;
begin
  select * into d from divisions where id = p_division for update;
  if d.id is null or not exists (
    select 1 from memberships m
    where m.tournament_id = d.tournament_id and m.user_id = p_actor
      and m.status = 'ACTIVE' and m.role in ('ADMIN','OFFICIAL')
  ) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('app.actor', p_actor::text, true);
  from_i := array_position(phases, d.phase);
  to_i := array_position(phases, p_to);

  if to_i is not null and to_i = from_i - 1 then
    if length(trim(coalesce(p_reason, ''))) < 10 then
      raise exception 'reason_required' using errcode = 'check_violation';
    end if;
    if d.phase = 'ELIMINATION' then
      if exists (select 1 from ends where division_id = d.id and match_id is not null) then
        raise exception 'elimination_already_scored' using errcode = 'check_violation';
      end if;
      delete from matches where division_id = d.id;
      update archers set seed_rank = null where division_id = d.id and seed_rank is not null;
    elsif d.phase = 'COMPLETE' then
      update results set final_rank = null, medal = null where division_id = d.id;
    end if;

  elsif to_i is not null and to_i = from_i + 1 then
    if d.phase = 'REGISTRATION' then
      if not exists (select 1 from archers where division_id = d.id and deleted_at is null) then
        raise exception 'no_archers' using errcode = 'check_violation';
      end if;
      if exists (select 1 from archers where division_id = d.id and deleted_at is null and not registration_locked) then
        if coalesce((p_payload->>'force_close')::boolean, false) then
          update archers set registration_locked = true
          where division_id = d.id and deleted_at is null and not registration_locked;
        else
          raise exception 'rosters_not_submitted' using errcode = 'check_violation';
        end if;
      end if;

    elsif d.phase = 'ALLOCATION' then
      if exists (select 1 from archers where division_id = d.id and deleted_at is null
                 and (bale_number is null or slot_index is null)) then
        raise exception 'archers_without_target' using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from archers a
        where a.division_id = d.id and a.deleted_at is null
          and not exists (
            select 1 from judge_assignments ja join memberships m on m.id = ja.membership_id
            where ja.tournament_id = d.tournament_id and ja.bale_number = a.bale_number and m.status = 'ACTIVE'
          )
      ) then
        raise exception 'target_without_judge' using errcode = 'check_violation';
      end if;

    elsif d.phase = 'QUALIFICATION' then
      if coalesce((p_payload->>'expected_ends')::int, 0) < 1 then
        raise exception 'expected_ends_required' using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from archers a
        where a.division_id = d.id and a.deleted_at is null
          and (select count(*) from ends e where e.archer_id = a.id and e.stage = 'QUALIFICATION')
              < (p_payload->>'expected_ends')::int
      ) then
        raise exception 'ends_missing' using errcode = 'check_violation';
      end if;

    elsif d.phase = 'CUT' then
      if jsonb_array_length(coalesce(p_payload->'matches', '[]')) = 0 then
        raise exception 'bracket_required' using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from results
        where division_id = d.id and needs_shoot_off
          and qualification_rank <= coalesce((p_payload->>'bracket_size')::int, 64)
      ) then
        raise exception 'shoot_off_required' using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_payload->'matches') x
        cross join lateral (values (x->>'archer1_id'), (x->>'archer2_id')) v(archer_id)
        where v.archer_id is not null
          and not exists (select 1 from archers a where a.id::text = v.archer_id and a.division_id = d.id and a.deleted_at is null)
      ) then
        raise exception 'bracket_archer_outside_division' using errcode = 'check_violation';
      end if;

      update archers a set seed_rank = (s->>'seed')::int
      from jsonb_array_elements(p_payload->'seeds') s
      where a.id = (s->>'archer_id')::uuid and a.division_id = d.id;

      insert into matches (tournament_id, division_id, round, match_number, seed1, seed2,
                           archer1_id, archer2_id, winner_archer_id, decided_by, status)
      select d.tournament_id, d.id, x->>'round', (x->>'match_number')::int,
             (x->>'seed1')::int, (x->>'seed2')::int,
             (x->>'archer1_id')::uuid, (x->>'archer2_id')::uuid, (x->>'winner_archer_id')::uuid,
             x->>'decided_by', coalesce(x->>'status', 'PENDING')
      from jsonb_array_elements(p_payload->'matches') x;

      update divisions set bracket_size = (p_payload->>'bracket_size')::int where id = d.id;

    elsif d.phase = 'ELIMINATION' then
      if exists (select 1 from matches where division_id = d.id and status <> 'COMPLETE') then
        raise exception 'matches_not_complete' using errcode = 'check_violation';
      end if;
      update results r set final_rank = (x->>'final_rank')::int, medal = x->>'medal'
      from jsonb_array_elements(coalesce(p_payload->'placings', '[]')) x
      where r.division_id = d.id and r.archer_id = (x->>'archer_id')::uuid;
      if not exists (select 1 from results where division_id = d.id and medal = 'GOLD') then
        raise exception 'medals_required' using errcode = 'check_violation';
      end if;
    end if;

  else
    raise exception 'invalid_transition' using errcode = 'check_violation';
  end if;

  update divisions set phase = p_to, phase_changed_at = now(), phase_changed_by = p_actor where id = d.id;

  insert into audit_log (tournament_id, division_id, actor_id, action, entity, entity_id, before, after, reason)
  values (d.tournament_id, d.id, p_actor,
          case when to_i < from_i then 'PHASE_REOPEN' else 'PHASE_ADVANCE' end,
          'divisions', d.id, jsonb_build_object('phase', d.phase), jsonb_build_object('phase', p_to),
          nullif(trim(coalesce(p_reason, '')), ''));
end $$;

-- ---------------------------------------------------------------- grants

-- Supabase grants EXECUTE on new functions to anon and authenticated by default.
revoke execute on function
  write_results(uuid, jsonb),
  apply_match(uuid, jsonb, jsonb),
  transition_division(uuid, text, uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function
  write_results(uuid, jsonb),
  apply_match(uuid, jsonb, jsonb),
  transition_division(uuid, text, uuid, text, jsonb)
to service_role;

revoke execute on function
  create_tournament(text, date, text, date),
  invite_member(uuid, text, text, text),
  revoke_member(uuid),
  commit_import(uuid),
  record_closest_to_centre(uuid, smallint)
from public, anon;
grant execute on function
  create_tournament(text, date, text, date),
  invite_member(uuid, text, text, text),
  revoke_member(uuid),
  commit_import(uuid),
  record_closest_to_centre(uuid, smallint)
to authenticated, service_role;
