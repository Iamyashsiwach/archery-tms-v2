-- archery-tms v2 — row level security
--
-- Server actions are the first lock; these policies are the second. They are
-- written so that a leaked key or a buggy server action still cannot move a
-- score, a medal or a phase.
--
-- Every write policy is role (current_role_in) AND phase (division_phase)
-- AND "every referenced row belongs to the same tournament". The last part is
-- not optional: the foreign keys in 0001 do not pin divisions, memberships or
-- matches to a tournament, so without it a coach in one event could register
-- into another event's division.
--
-- ADMIN is treated as OFFICIAL here. What ADMIN adds on top — granting ADMIN —
-- is a memberships write, and memberships are service-role only.
--
-- Deliberately service-role only (no write policy): tournaments insert/delete,
-- memberships, profiles of other users, teams, team_members, matches, results,
-- import_batches, import_rows, audit_log, ends update/delete, archers delete,
-- and every divisions.phase change.

-- ------------------------------------------------------------------ grants

-- Supabase grants anon and authenticated ALL on public tables by default.
-- RLS already denies them, but revoking means a policy added by mistake later
-- still cannot open these up. TRUNCATE is not subject to RLS at all.
revoke all on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;
revoke insert, update, delete on results, audit_log from authenticated;
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------- identity

create policy profiles_select on profiles for select to authenticated
  using (
    id = auth.uid()
    -- Officials see the people in their event, including phone numbers.
    or exists (
      select 1 from memberships m
      where m.user_id = profiles.id
        and current_role_in(m.tournament_id, array['ADMIN','OFFICIAL'])
    )
  );

create policy profiles_insert_self on profiles for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------- event

create policy tournaments_select on tournaments for select to authenticated
  using (current_role_in(id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

-- No insert: the creator has no membership until the tournament exists.
-- No delete: it cascades through ends and audit_log.
create policy tournaments_update on tournaments for update to authenticated
  using (current_role_in(id, array['ADMIN','OFFICIAL']))
  with check (current_role_in(id, array['ADMIN','OFFICIAL']));

create policy memberships_select on memberships for select to authenticated
  using (
    user_id = auth.uid()
    or current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
  );

-- ---------------------------------------------------------------- divisions

create policy categories_select on categories for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

create policy categories_insert on categories for insert to authenticated
  with check (current_role_in(tournament_id, array['ADMIN','OFFICIAL']));

-- A category's round and match format drive scoring. Once any of its divisions
-- has left SETUP it is frozen, and deleting it would cascade away real ends.
create policy categories_update on categories for update to authenticated
  using (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    and not exists (
      select 1 from divisions d
      where d.category_id = categories.id and d.phase <> 'SETUP'
    )
  )
  with check (current_role_in(tournament_id, array['ADMIN','OFFICIAL']));

create policy categories_delete on categories for delete to authenticated
  using (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    and not exists (
      select 1 from divisions d
      where d.category_id = categories.id and d.phase <> 'SETUP'
    )
  );

create policy divisions_select on divisions for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

-- Officials shape divisions in SETUP only, and can never write `phase` to
-- anything else: advancing goes through the transition action, which checks
-- preconditions and writes audit_log with the service role.
create policy divisions_insert on divisions for insert to authenticated
  with check (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    and phase = 'SETUP'
    and category_id in (select c.id from categories c where c.tournament_id = divisions.tournament_id)
  );

create policy divisions_update on divisions for update to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL']) and phase = 'SETUP')
  with check (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    and phase = 'SETUP'
    and category_id in (select c.id from categories c where c.tournament_id = divisions.tournament_id)
  );

create policy divisions_delete on divisions for delete to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL']) and phase = 'SETUP');

-- ---------------------------------------------------------------- entrants

create policy archers_select on archers for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

-- A coach's own archers, in a REGISTRATION division of the same tournament.
-- Bale, slot and seed are for officials and the cut, so a coach row carries
-- none. Setting registration_locked submits the entry; after that the coach
-- can no longer edit it.
create policy archers_coach_insert on archers for insert to authenticated
  with check (
    membership_id in (
      select m.id from memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
        and m.tournament_id = archers.tournament_id
    )
    and division_phase(division_id) = 'REGISTRATION'
    and division_id in (select d.id from divisions d where d.tournament_id = archers.tournament_id)
    and bale_number is null and slot_index is null and seed_rank is null
  );

create policy archers_coach_update on archers for update to authenticated
  using (
    membership_id in (
      select m.id from memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
        and m.tournament_id = archers.tournament_id
    )
    and division_phase(division_id) = 'REGISTRATION'
    and not registration_locked
  )
  with check (
    membership_id in (
      select m.id from memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE' and m.role = 'COACH'
        and m.tournament_id = archers.tournament_id
    )
    and division_phase(division_id) = 'REGISTRATION'
    and division_id in (select d.id from divisions d where d.tournament_id = archers.tournament_id)
    and bale_number is null and slot_index is null and seed_rank is null
  );

-- Target allocation. Which columns may change is enforced by the trigger below.
create policy archers_official_allocate on archers for update to authenticated
  using (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    and division_phase(division_id) = 'ALLOCATION'
  )
  with check (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    and division_phase(division_id) = 'ALLOCATION'
  );

-- RLS is row-level: it cannot say "officials may change these two columns and
-- nothing else". Without this an official could rename archers or move them
-- between divisions. Coaches and the service role are unaffected.
create or replace function archers_official_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_role_in(old.tournament_id, array['ADMIN','OFFICIAL'])
     and (to_jsonb(new) - 'bale_number' - 'slot_index')
         is distinct from (to_jsonb(old) - 'bale_number' - 'slot_index') then
    raise exception 'officials may only change bale_number and slot_index on archers'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger archers_official_columns before update on archers
  for each row execute function archers_official_columns();

create policy teams_select on teams for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

create policy team_members_select on team_members for select to authenticated
  using (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and current_role_in(t.tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH'])
    )
  );

-- ---------------------------------------------------------------- allocation

create policy judge_assignments_select on judge_assignments for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

create policy judge_assignments_insert on judge_assignments for insert to authenticated
  with check (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    and membership_id in (
      select m.id from memberships m
      where m.tournament_id = judge_assignments.tournament_id and m.role = 'JUDGE'
    )
  );

create policy judge_assignments_update on judge_assignments for update to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL']))
  with check (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    and membership_id in (
      select m.id from memberships m
      where m.tournament_id = judge_assignments.tournament_id and m.role = 'JUDGE'
    )
  );

create policy judge_assignments_delete on judge_assignments for delete to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL']));

-- ---------------------------------------------------------------- scoring

create policy ends_select on ends for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

-- Insert only. A correction is a new fact that needs an audit trail, so there
-- is no update or delete path through RLS.
create policy ends_judge_insert on ends for insert to authenticated
  with check (
    current_role_in(tournament_id, array['JUDGE'])
    -- Attribution cannot be forged or pre-verified.
    and entered_by in (
      select m.id from memberships m
      where m.user_id = auth.uid() and m.status = 'ACTIVE'
        and m.tournament_id = ends.tournament_id
    )
    and verified_by is null and verified_at is null
    -- Individual ends only until team bale ownership is defined.
    and team_id is null
    and exists (
      select 1 from archers a
      where a.id = ends.archer_id
        and a.tournament_id = ends.tournament_id
        and a.division_id = ends.division_id
        and a.deleted_at is null
        and judge_owns_bale(ends.tournament_id, a.bale_number)
    )
    and (
      (stage = 'QUALIFICATION' and match_id is null
        and division_phase(division_id) = 'QUALIFICATION')
      or
      (stage = 'ELIMINATION' and match_id is not null
        and division_phase(division_id) = 'ELIMINATION'
        and exists (
          select 1 from matches mt
          where mt.id = ends.match_id
            and mt.division_id = ends.division_id
            and ends.archer_id in (mt.archer1_id, mt.archer2_id)
        ))
    )
  );

create policy matches_select on matches for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

create policy results_select on results for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL','JUDGE','COACH']));

-- ---------------------------------------------------------------- imports

create policy import_batches_select on import_batches for select to authenticated
  using (
    current_role_in(tournament_id, array['ADMIN','OFFICIAL'])
    or membership_id in (select m.id from memberships m where m.user_id = auth.uid())
  );

-- Visible exactly when the parent batch is visible under the policy above.
create policy import_rows_select on import_rows for select to authenticated
  using (exists (select 1 from import_batches b where b.id = import_rows.batch_id));

-- ---------------------------------------------------------------- audit

create policy audit_log_select on audit_log for select to authenticated
  using (current_role_in(tournament_id, array['ADMIN','OFFICIAL']));

-- ------------------------------------------------------------ public read
-- anon never touches a table. These views run as their owner, so they bypass
-- RLS on purpose: the column list and the is_published filter are the policy.
-- A new column on a base table does not appear here until someone adds it.
-- Supabase's linter reports these as "security definer view"; that is intended.
-- security_barrier stops a caller's filter from seeing rows before is_published does.

create view public_tournaments with (security_barrier) as
  select t.id, t.name, t.venue, t.start_date, t.end_date
  from tournaments t
  where t.is_published;

create view public_divisions with (security_barrier) as
  select d.id, d.tournament_id, d.category_id, d.event_kind, d.phase, d.bracket_size,
         c.display_name, c.bow_style, c.gender, c.age_class,
         c.round_code, c.match_format_code, c.sort_order
  from divisions d
  join categories c on c.id = d.category_id
  join tournaments t on t.id = d.tournament_id
  where t.is_published;

create view public_archers with (security_barrier) as
  select a.id, a.tournament_id, a.division_id, a.full_name, a.club, a.bale_number, a.slot_index
  from archers a
  join tournaments t on t.id = a.tournament_id
  where t.is_published and a.deleted_at is null;

create view public_ends with (security_barrier) as
  select e.id, e.tournament_id, e.division_id, e.archer_id, e.team_id, e.match_id,
         e.stage, e.distance_index, e.end_number, e.arrows, e.total, e.ten_count, e.x_count
  from ends e
  join tournaments t on t.id = e.tournament_id
  where t.is_published;

create view public_matches with (security_barrier) as
  select m.id, m.tournament_id, m.division_id, m.round, m.match_number, m.seed1, m.seed2,
         m.archer1_id, m.archer2_id, m.team1_id, m.team2_id,
         m.set_points_1, m.set_points_2, m.total_1, m.total_2,
         m.winner_archer_id, m.winner_team_id, m.decided_by, m.status
  from matches m
  join tournaments t on t.id = m.tournament_id
  where t.is_published;

create view public_results with (security_barrier) as
  select r.id, r.tournament_id, r.division_id, r.archer_id, r.team_id,
         r.qualification_total, r.qualification_tens, r.qualification_xs,
         r.qualification_rank, r.needs_shoot_off, r.final_rank, r.medal, r.updated_at
  from results r
  join tournaments t on t.id = r.tournament_id
  where t.is_published;

-- Default privileges would give authenticated ALL on these, and a simple view
-- is auto-updatable: an INSERT through it would run as the owner and skip
-- every policy above. Read-only, explicitly.
revoke all on public_tournaments, public_divisions, public_archers,
              public_ends, public_matches, public_results
  from anon, authenticated;
grant select on public_tournaments, public_divisions, public_archers,
                public_ends, public_matches, public_results
  to anon, authenticated;
