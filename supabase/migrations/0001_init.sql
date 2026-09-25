-- archery-tms v2 — initial schema
-- Target archery, AAI / World Archery.
--
-- Two decisions are baked in here and are expensive to change later:
--   1. Phase lives on `divisions`, not on `tournaments`. Recurve men can cut
--      while compound women are still shooting qualification.
--   2. Bow styles, genders and age classes are seeded rows, not CHECK enums.
--      An AAI rulebook revision is a data change, not a migration.

-- Hosted migrations run without `extensions` on the search_path, so extension
-- types are schema-qualified.
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- ---------------------------------------------------------------- identity

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- event

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue text,
  start_date date not null,
  end_date date,
  owner_id uuid not null references auth.users(id),
  -- Free text so an organiser can record which AAI circular governs the event.
  rules_reference text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email extensions.citext not null,
  role text not null check (role in ('ADMIN','OFFICIAL','JUDGE','COACH')),
  club text,
  status text not null default 'INVITED'
    check (status in ('INVITED','ACTIVE','REVOKED')),
  invited_by uuid references auth.users(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (tournament_id, invited_email)
);

create index on memberships (tournament_id, role) where status = 'ACTIVE';
create index on memberships (user_id) where status = 'ACTIVE';

-- ---------------------------------------------------------------- divisions

-- Seeded per tournament from a template. Changing AAI age classes means
-- editing the seed, not altering a constraint.
create table categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  bow_style text not null,              -- RECURVE, COMPOUND, BAREBOW, INDIAN
  gender text not null,                 -- M, W, X
  age_class text not null,              -- SUB_JUNIOR, CADET, JUNIOR, SENIOR, MASTER
  display_name text not null,
  -- Which qualification round this category shoots. Matches a code in
  -- src/lib/rules/catalogue.ts — validated in the application, not here,
  -- so adding a round does not require a migration.
  round_code text not null,
  -- Which elimination format. Also a catalogue code.
  match_format_code text not null,
  sort_order int not null default 0,
  unique (tournament_id, bow_style, gender, age_class)
);

create table divisions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  event_kind text not null default 'INDIVIDUAL'
    check (event_kind in ('INDIVIDUAL','TEAM','MIXED_TEAM')),
  phase text not null default 'SETUP'
    check (phase in ('SETUP','REGISTRATION','ALLOCATION','QUALIFICATION','CUT','ELIMINATION','COMPLETE')),
  phase_changed_at timestamptz not null default now(),
  phase_changed_by uuid references auth.users(id),
  bracket_size int,
  unique (tournament_id, category_id, event_kind)
);

create index on divisions (tournament_id, phase);

-- ---------------------------------------------------------------- entrants

create table archers (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id uuid references divisions(id) on delete set null,
  membership_id uuid references memberships(id),   -- the coach who entered them
  full_name text not null,
  club text,
  state text,
  -- Denormalised from the category so a late division change is traceable.
  bow_style text not null,
  gender text not null,
  age_class text not null,
  created_via text not null default 'MANUAL'
    check (created_via in ('MANUAL','CSV','XLSX','PDF')),
  import_batch_id uuid,
  bale_number int,
  slot_index int,
  seed_rank int,
  registration_locked boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index on archers (tournament_id) where deleted_at is null;
create index on archers (division_id) where deleted_at is null;
create index on archers (membership_id);

create table teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id uuid not null references divisions(id) on delete cascade,
  name text not null,
  club text,
  seed_rank int,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  archer_id uuid not null references archers(id) on delete cascade,
  position int not null,
  primary key (team_id, archer_id)
);

-- ---------------------------------------------------------------- allocation

create table judge_assignments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  bale_number int not null,
  created_at timestamptz not null default now(),
  unique (tournament_id, bale_number, membership_id)
);

-- ---------------------------------------------------------------- scoring

-- One row per end. Arrows are stored as shot, so a total can always be
-- recomputed from the arrows rather than trusted as a stored number.
create table ends (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id uuid not null references divisions(id) on delete cascade,
  archer_id uuid references archers(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  stage text not null check (stage in ('QUALIFICATION','ELIMINATION','SHOOT_OFF')),
  -- Null for qualification; the bracket match for elimination ends.
  match_id uuid,
  distance_index int not null default 0,
  end_number int not null,
  arrows jsonb not null,
  total int not null,
  ten_count int not null default 0,
  x_count int not null default 0,
  entered_by uuid references memberships(id),
  verified_by uuid references memberships(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (archer_id is not null or team_id is not null)
);

create unique index on ends (archer_id, stage, distance_index, end_number)
  where archer_id is not null and match_id is null;
create index on ends (division_id, stage);
create index on ends (match_id);

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id uuid not null references divisions(id) on delete cascade,
  round text not null check (round in ('R64','R32','R16','QF','SF','BRONZE','FINAL')),
  match_number int not null,
  seed1 int,
  seed2 int,
  archer1_id uuid references archers(id),
  archer2_id uuid references archers(id),
  team1_id uuid references teams(id),
  team2_id uuid references teams(id),
  set_points_1 int not null default 0,
  set_points_2 int not null default 0,
  total_1 int not null default 0,
  total_2 int not null default 0,
  winner_archer_id uuid references archers(id),
  winner_team_id uuid references teams(id),
  decided_by text check (decided_by in ('POINTS','SETS','SHOOT_OFF','BYE')),
  status text not null default 'PENDING'
    check (status in ('PENDING','ACTIVE','SHOOT_OFF','COMPLETE')),
  created_at timestamptz not null default now(),
  unique (division_id, round, match_number)
);

create index on matches (division_id, status);

alter table ends
  add constraint ends_match_fk foreign key (match_id) references matches(id) on delete cascade;

-- Derived. Never written by a client — only by the recalculation function.
create table results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id uuid not null references divisions(id) on delete cascade,
  archer_id uuid references archers(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  qualification_total int not null default 0,
  qualification_tens int not null default 0,
  qualification_xs int not null default 0,
  qualification_rank int,
  needs_shoot_off boolean not null default false,
  final_rank int,
  medal text check (medal is null or medal in ('GOLD','SILVER','BRONZE')),
  updated_at timestamptz not null default now(),
  check (archer_id is not null or team_id is not null)
);

create unique index on results (division_id, archer_id) where archer_id is not null;
create unique index on results (division_id, team_id) where team_id is not null;

-- ---------------------------------------------------------------- imports

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,
  source text not null check (source in ('MANUAL','CSV','XLSX','PDF')),
  original_filename text,
  storage_path text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','PARSING','REVIEW','COMMITTED','FAILED')),
  row_count int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_index int not null,
  raw jsonb not null,
  parsed jsonb,
  errors text[] not null default '{}',
  action text not null default 'CREATE' check (action in ('CREATE','SKIP')),
  archer_id uuid references archers(id),
  unique (batch_id, row_index)
);

alter table archers
  add constraint archers_import_fk
  foreign key (import_batch_id) references import_batches(id) on delete set null;

-- ---------------------------------------------------------------- audit

create table audit_log (
  id bigserial primary key,
  tournament_id uuid references tournaments(id) on delete cascade,
  division_id uuid references divisions(id) on delete set null,
  actor_id uuid references auth.users(id),
  action text not null,
  entity text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index on audit_log (tournament_id, created_at desc);

-- ------------------------------------------------- helpers for RLS policies

create or replace function current_role_in(p_tournament uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.tournament_id = p_tournament
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
      and m.role = any(p_roles)
  );
$$;

create or replace function division_phase(p_division uuid)
returns text language sql stable security definer set search_path = public as $$
  select phase from divisions where id = p_division;
$$;

create or replace function judge_owns_bale(p_tournament uuid, p_bale int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from judge_assignments ja
    join memberships m on m.id = ja.membership_id
    where ja.tournament_id = p_tournament
      and ja.bale_number = p_bale
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  );
$$;

-- --------------------------------------------------------------------- RLS
-- Enabled with no policies: everything is denied until 0002 adds them.
-- This is deliberate. An unfinished policy set must fail closed.

alter table profiles          enable row level security;
alter table tournaments       enable row level security;
alter table memberships       enable row level security;
alter table categories        enable row level security;
alter table divisions         enable row level security;
alter table archers           enable row level security;
alter table teams             enable row level security;
alter table team_members      enable row level security;
alter table judge_assignments enable row level security;
alter table ends              enable row level security;
alter table matches           enable row level security;
alter table results           enable row level security;
alter table import_batches    enable row level security;
alter table import_rows       enable row level security;
alter table audit_log         enable row level security;
