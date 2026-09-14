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

### `src/lib/rules/` — complete, 34 passing tests

Pure functions, no I/O, no Supabase imports. Keep it that way.

- `types.ts` — `Arrow` (`"X" | "M" | number`), `End`, `RoundSpec`, `MatchSpec`, `MatchState`
- `catalogue.ts` — round definitions (WA 720 at each distance, WA 1440 M/W, indoor 18m/25m, Indian Round) and the six match formats (recurve/compound × individual/team/mixed team)
- `scoring.ts` — arrow values, end validation (arrow count, legal zones, descending order), totals, `rankDivision` with the WA tiebreak (total → tens → inner tens), `applyRankingShootOff`
- `matches.ts` — `evaluateMatch` covering set system and cumulative, with shoot-off resolution including the judge's closest-to-centre call
- `brackets.ts` — `generateBracket` for fields of 4 to 64 with standard WA seeding and byes, `advance`, `medals`
- `rules.test.ts` — run with `node --test` after `tsc`

Inner ten (`"X"`) scores 10 and counts as both a ten and an X. Tens include both
outer and inner. Getting this wrong breaks every tiebreak.

### `supabase/migrations/0001_init.sql`

Full schema: `profiles`, `tournaments`, `memberships`, `categories`, `divisions`,
`archers`, `teams`, `team_members`, `judge_assignments`, `ends`, `matches`,
`results`, `import_batches`, `import_rows`, `audit_log`. RLS enabled with zero
policies. Helper functions `current_role_in`, `division_phase`, `judge_owns_bale`
exist for policies to use.

## What is next, in order

1. `0002_policies.sql` — RLS policies mirroring the role × phase × table matrix
2. Auth scaffold — `@supabase/ssr`, middleware, `/accept/[membershipId]`
3. `src/server/` — `requireUser`, `requireMembership`, `assertPhase`, `assertBaleAssigned`
4. Phase transition actions with preconditions and audit writes
5. People page — invite by email, assign judges to bales
6. Entry pipeline — manual, then CSV/XLSX, then PDF via the Anthropic API
7. Role-aware UI with built-in guidance
8. Offline score queue

Do not skip ahead to UI. Steps 1–4 are what make the system trustworthy.

## Conventions

- Next.js App Router, React 19, TypeScript strict, Tailwind 4, Supabase
- Every server action: `requireMembership` → `assertPhase` → zod parse → mutate → audit
- Use the user's session via `@supabase/ssr` so RLS applies as a second lock.
  Service role is only for recalculation and phase transitions, and never imported
  into anything under `src/components`.
- Guidance strings live in one file, `src/content/guidance.ts`, not inline in components
- Judge UI is thumb-first: 56px minimum touch targets, works at 360px width

## Open questions for Yash

These are guesses in the code right now. Ask before relying on them.

1. **Indian Round spec** — currently templated as 50m and 30m, 36 arrows each,
   122cm face. Needs the real figures from the AAI circular.
2. **Age classes** — currently sub-junior, cadet, junior, senior, master. Confirm
   the set and the cutoff ages for AAI-affiliated events.

Yash is a competitive archer and an NSNIS Patiala certified coach. On rules
questions he is the authority — ask him rather than inferring from the web.
