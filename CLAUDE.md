# archery-tms v2

Tournament management system for target archery under AAI / World Archery rules.
Ground-up rebuild of `Iamyashsiwach/Archery-tms` (v1 is archived; do not port its
access-control or workflow code — only the domain ideas carried over).

## Why v2 exists

v1 was a client-only Next.js + Supabase app with no auth. The admin PIN shipped in
the browser bundle as `NEXT_PUBLIC_ADMIN_PIN`, the judge code was fetched to the
client and compared in JS, and every table had a `using (true)` RLS policy. Anyone
who opened the public leaderboard could read the anon key and rewrite scores and
medals. The domain logic was good; the security and workflow layers were not.

## Locked decisions

Do not relitigate these without asking Yash.

1. **Server-only writes.** No write reaches the database except through a server
   action that re-checks identity and phase. Nothing under `src/components` may
   call `supabase.from(...).insert|update|delete`.
2. **Phase gates permission.** Every write is a function of `(role, phase, table)`.
   There is no unconditional write.
3. **Phase lives on `divisions`, not `tournaments`.** Recurve men can cut while
   compound women are still in qualification. This is required for international-
   format events.
4. **Categories are data, not enums.** Bow style, gender and age class are seeded
   rows in `categories`. An AAI rulebook revision is a seed change, not a migration.
5. **Derived data is never client-written.** `results` and `matches` totals are
   computed server-side from `ends`. Arrows are stored as shot so any total can be
   recomputed; never trust a stored total as the source of truth.
6. **Imports never insert directly.** CSV, XLSX and PDF all land in
   `import_batches` / `import_rows`, get reviewed by a human, then commit.
7. **Magic-link auth, no passwords.** Supabase Auth email OTP. Coaches and judges
   at a district meet will not manage passwords and we will not store them.
8. **Offline-first scoring.** Judge score entry buffers to IndexedDB and syncs.
   Outdoor ranges have no signal. This is not optional.
9. **Fail closed.** RLS is enabled on every table. A table with no policy denies
   everything. Never add a permissive policy "temporarily".
10. **Serverless.** Vercel Functions and CDN in front, Supabase (Postgres, Auth,
    Storage, Realtime) behind. No long-running process, no self-managed server,
    no in-memory state. See "Serverless rules" below.

## Roles

| Role | Can do |
|---|---|
| `ADMIN` | Everything, plus grant `ADMIN` |
| `OFFICIAL` | Invite people, allocate targets, advance and reopen phases, resolve disputes |
| `JUDGE` | Enter ends for assigned bales only, record match results |
| `COACH` | Add and edit their own archers during `REGISTRATION` only |
| anonymous | Read-only display pages. Must never see emails or phone numbers. |

Archers do not have accounts. They are rows owned by a coach.

## Phase machine

```
SETUP → REGISTRATION → ALLOCATION → QUALIFICATION → CUT → ELIMINATION → COMPLETE
```

Per division. Transitions go through one server action with preconditions:

- `REGISTRATION → ALLOCATION` — at least one archer, coach rosters submitted or force-closed
- `ALLOCATION → QUALIFICATION` — every archer has a bale and slot, every bale in use has a judge
- `QUALIFICATION → CUT` — every archer has the full end count recorded
- `CUT → ELIMINATION` — brackets generated, seeds frozen
- `ELIMINATION → COMPLETE` — every match complete, medals assigned

Reopening is legal, officials only, requires a written reason of 10+ characters,
and always writes `audit_log` with action `PHASE_REOPEN`.

## What is already built

Build-order steps 1–8 are done. An event can run end to end: setup, invites,
registration and imports, allocation, offline scoring, the cut, brackets, medals.
`e2e/event.spec.ts` proves it on a production build.

### `src/lib/` — pure, no I/O

- `rules/` — the rules engine. **Single source of truth for scoring, ranking and
  brackets**; nothing else re-implements it. `types`, `catalogue` (rounds, match
  formats), `scoring` (arrow values, end validation, WA tiebreak, ranking
  shoot-offs), `matches` (set system, cumulative, shoot-offs incl. closest to
  centre), `brackets` (WA seeding, byes, `advance`, `medals`).
- `derive.ts` — reshapes database rows for the engine and back: standings from
  arrows, bracket payload, match state and advancement, placings, allocation.
- `roster-import.ts` — CSV parsing, header/value recognition, division matching.
- `phases.ts`, `safe-next.ts`, `site-url.ts`, `database.types.ts` (generated: `npm run db:types`).

Inner ten (`"X"`) scores 10 and counts as both a ten and an X. Tens include both
outer and inner. Getting this wrong breaks every tiebreak.

### `supabase/migrations/`

- `0001_init.sql` — schema and the RLS helpers `current_role_in`, `division_phase`, `judge_owns_bale`.
- `0002_policies.sql` — RLS for role × phase × table; same-tournament pins; anon reads `public_*` views only.
- `0003_accept_membership.sql` — `accept_membership(id)`.
- `0004_workflow.sql` — ends totals derived from arrows by trigger; match targets
  and shoot-offs; an audit trigger on every core table; `create_tournament`,
  `invite_member`, `revoke_member`, `commit_import`, `record_closest_to_centre`
  (security definer, role checked inside); coach-owned import staging;
  `write_results`, `apply_match`, `transition_division` (**service role only**:
  they persist what the rules engine computed, so no user may call them).

`supabase/rls_test.sql` (202 checks) proves the database layer. Run it after any
migration: `psql "$DB_URL" -f supabase/rls_test.sql` locally, or paste into the
SQL editor. Every row must pass; add checks with every policy or function change.

### `src/server/` — server-only

- `supabase.ts` — user-session client (RLS applies), anon client (public pages, invite emails).
- `auth.ts` — `requireUser`, `requireMembership`, `assertPhase`, `assertBaleAssigned`,
  and `run()`, which turns `ActionError` refusals into `?error=` on the page.
- `derived.ts` — the only user of `admin.ts` (service role): recalculates standings
  and matches, records ranking shoot-offs, and runs phase transitions.
- `pdf-roster.ts` — reads a PDF entry form with `claude-opus-5` (structured output,
  server-side refusal fallback). Needs `ANTHROPIC_API_KEY`; refused politely without it.

### Pages (`src/app/`)

`/` (your tournaments, profile, create) · `/login`, `/auth/confirm`, `/accept/[id]` ·
`/t/[id]` overview with per-role phase guidance and officials' phase controls ·
`setup` · `people` · `roster` + `imports/[batchId]` · `allocation` · `score`
(judges; offline) · `results` (ranking shoot-offs in CUT) · `/display/[id]`
(public, CDN-cached). Judges sync through `POST /api/ends`.

## Working on it

Needs Node ≥ 22 (`nvm use` reads `.nvmrc`) and Docker.

```bash
npx supabase start          # local Postgres, Auth, API and a Mailpit inbox (http://127.0.0.1:54324)
cp .env.local.example .env.local   # fill from `npx supabase status -o env`
npm run dev
npm test                    # unit tests (rules engine, derive, imports, redirects)
npm run e2e                 # full-event dry run on a production build
npx supabase db reset       # reapply migrations to a clean local database
npm run db:types            # regenerate src/lib/database.types.ts after a migration
```

Sign in locally with any address; the email (with its code) lands in Mailpit.

## Production checklist

Supabase project `otzelfycaedgnldvmxps` is a Vercel Marketplace resource
(`supabase-almond-battery`, free plan, region `iad1`, same as the Vercel functions).

0. **The free plan pauses the project after about a week without activity, and a
   paused project blocks every Vercel deployment** (`BUILD_FAILED: Resource
   provisioning failed`, before any build step runs). Restore it in the Supabase
   dashboard before deploying or running an event; consider Pro for event weeks.
1. `npx supabase login`, `npx supabase link --project-ref otzelfycaedgnldvmxps`,
   `npx supabase db push` — applies the migrations.
2. Auth settings: `npx supabase config diff --project-ref otzelfycaedgnldvmxps`,
   review, then `config push` (sets Site URL, redirect URLs and the sign-in email
   template from `config.toml` and its `[remotes.production]` override). Or set the
   same four values in the dashboard.
3. Vercel env: the Supabase integration already provides
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `SUPABASE_SECRET_KEY`. Add `ANTHROPIC_API_KEY` to enable PDF import.
4. Run `supabase/rls_test.sql` against production: every row must pass.
5. Before a real event: custom SMTP in Supabase (the built-in sender allows ~2
   emails an hour).

## Conventions

- Next.js App Router, React 19, TypeScript strict, Tailwind 4, Supabase
- Every server action: `requireMembership` → `assertPhase` → zod parse → mutate.
  Judges' ends arrive through `POST /api/ends` instead — a route, so a scoring page
  cached before a deploy still has a valid URL — with the same checks and RLS.
  Audit is written by the database (trigger or function), so no action can skip it.
- Use the user's session so RLS applies as a second lock. The service role is
  used only in `src/server/derived.ts`, for derived data and phase transitions,
  and never imported under `src/app` or `src/components`.
- Guidance strings live in one file, `src/content/guidance.ts`, not inline in components
- Judge UI is thumb-first: 56px minimum touch targets, works at 360px width
- Relative imports under `src/lib` have no `.js` suffix: Turbopack cannot resolve it.

## Serverless rules

A function can start cold, run in parallel with itself, time out, or be killed
mid-request. Design for that.

- **Stateless requests.** No module-level caches of user data, no in-memory queues
  or timers. State lives in Postgres or the client (IndexedDB).
- **Postgres over HTTP.** Use supabase-js (PostgREST). If a raw connection is ever
  needed, use the Supavisor transaction pooler (port 6543), never a pool in a function.
- **Atomic writes live in Postgres.** Anything that must not half-apply — phase
  transitions, results, match advancement, import commit — is one Postgres function.
  Separate supabase-js calls are separate transactions.
- **Idempotent writes.** Retries are normal: client-generated end ids, unique
  constraints; `/api/ends` treats a repeat of a stored id as saved.
- **Nothing outlives a request unannounced.** Long work is a status machine:
  a PDF import sets `status = 'PARSING'`, Claude reads it in `after()`, and the
  review page refreshes until it is `REVIEW` or `FAILED`. Uploads go through the
  server action up to 4 MB (Vercel caps bodies at 4.5 MB); move to Supabase
  Storage signed uploads if larger files are ever needed.
- **Public pages are cached, not computed per view.** `/display` is ISR (30 s) and
  refreshed with `revalidatePath` when ends are written; it is outside the proxy
  matcher. Live push, if needed, is Supabase Realtime Broadcast — never a socket server.
- **Schedules are platform jobs.** Invite expiry and cleanup use `pg_cron` or Vercel
  Cron, not a process.
- **Co-locate.** Vercel function region matches the Supabase project region. Use
  Supabase asymmetric JWT signing keys so `getClaims()` in the proxy verifies
  locally instead of calling Auth on every request.

## Decisions taken without Yash (defaults — overturn freely)

Built while he was away, each chosen to fail closed. Each is small to change.

1. **Elimination targets** — `matches.bale_number`, set by officials in Allocation;
   until set, a match is judged on the first archer's qualification target.
2. **Shoot-offs** — a match shoot-off is entered by that match's judge as
   `SHOOT_OFF` ends, with a closest-to-centre call when level. A ranking shoot-off
   is recorded by an official in CUT as the finishing order of the tied archers.
3. **Ties before the bracket** — any tie at a rank inside the bracket blocks
   eliminations until a shoot-off is recorded (WA may allow lots for seeding-only ties).
4. **Bale moves during qualification** — not allowed directly; reopen to Allocation
   (reason required, audited), move, and advance again.
5. **Final ranks** — only the medallists and fourth get `final_rank`; others keep
   their qualification rank.
6. **Who creates tournaments** — any signed-in user, who becomes its ADMIN.
7. **Who imports** — coaches only, into their own roster (matches the role table).
8. **Reopening eliminations** — allowed only before any match end is recorded.
9. **Targets** — auto-allocation puts four archers on a target.

## Open questions for Yash

1. **Indian Round spec** — templated as 50 m and 30 m, 36 arrows each, 122 cm face.
2. **Age classes** — sub-junior, cadet, junior, senior, master: confirm set and cut-offs.
3. **Team and mixed-team events** — not built: how are team targets and judges assigned?
4. **The nine defaults above** — confirm or correct, especially 2, 3 and 4.

Yash is a competitive archer and an NSNIS Patiala certified coach. On rules
questions he is the authority — ask him rather than inferring from the web.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
