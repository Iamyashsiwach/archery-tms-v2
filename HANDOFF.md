# Session handoff

> **Status 2026-09-25:** build-order steps 0–9 are done and step 10 (full dry run)
> passes locally. This file is kept for its background (sections 1–5, 9). For
> current state, decisions taken and what is left, `CLAUDE.md` is authoritative.

You are picking up a project mid-stream. Read this file and `CLAUDE.md` before
writing anything. Nothing in this repo is running yet.

---

## 1. Who you are working with

Yash. Software engineer, and separately a competitive archer with 7+ years of
national and district tournament experience and an NSNIS Patiala certified
coach under SAI.

That second part matters operationally: **on any question about archery rules,
scoring, categories or tournament procedure, he is the authority — ask him
rather than searching the web or inferring.** Web sources on AAI domestic rules
are thin and frequently out of date. He knows what actually happens at a meet.

On the engineering side he can take direct technical disagreement. If a plan in
here is wrong, say so plainly and explain why.

---

## 2. What is being built

`archery-tms` — a tournament management system for **target archery** under
Archery Association of India / World Archery rules. No field, 3D or clout.

It runs a competition end to end: registration, target allocation,
qualification scoring, the cut, elimination brackets, medals. Users are
tournament officials, judges and club coaches at Indian district, state and
national meets.

The stated ambition is international-format capability — team and mixed team
events, full elimination brackets, correct set-system scoring. The realistic
framing agreed with Yash: build the **rules engine completely and correctly**
first, because that is the part that must never be wrong, and stack operational
features (equipment inspection, DoS timing, accreditation, appeals) on top
later. Do not try to build the whole Ianseo feature surface.

---

## 3. Where this came from

There is a v1 at `github.com/Iamyashsiwach/Archery-tms`. It is a Next.js +
Supabase app, roughly 6,800 lines, last commit March 2026. Its domain thinking
was good — rules engine, bale/slot allocation, judge and coach and display
separation, printable scoresheets. Its access control did not exist:

- The admin PIN was `NEXT_PUBLIC_ADMIN_PIN`, shipped in the browser bundle,
  compared client-side against a `localStorage` flag.
- The judge access code was fetched from the `tournaments` row to the client
  and compared in JavaScript, so it was visible in the network tab.
- Coach access was an unguessable URL token.
- Every table had a `using (true) with check (true)` RLS policy.
- There was no server layer at all — every write went browser → Supabase with
  the anon key.

Net effect: anyone who opened the public leaderboard could read the key and
rewrite scores, results and medals. It also had a `status` enum on
`tournaments` that no code ever read as a gate, so registration, scoring and
bracket generation could all happen in any order.

**v2 is a ground-up rebuild.** Do not port v1's access control or workflow
code. The domain ideas carried over; the implementation did not.

---

## 4. What already exists in this repo

### `src/lib/rules/` — complete, 34 passing tests

Pure functions. No I/O, no Supabase imports, no `async`. Keep it that way — if
something needs the database it belongs in `src/server/`.

| File | Contents |
|---|---|
| `types.ts` | `Arrow` (`"X" \| "M" \| number`), `End`, `RoundSpec`, `MatchSpec`, `MatchState` |
| `catalogue.ts` | WA 720 at every distance, WA 1440 men and women, indoor 18m and 25m, Indian Round; six match formats (recurve/compound × individual/team/mixed team) |
| `scoring.ts` | Arrow values, end validation (arrow count, legal zones, descending order), totals, `rankDivision` with the WA tiebreak, `applyRankingShootOff` |
| `matches.ts` | `evaluateMatch` — set system and cumulative, shoot-offs including the judge's closest-to-centre call |
| `brackets.ts` | `generateBracket` for fields of 4–64 with standard WA seeding and byes, `advance`, `medals` |
| `rules.test.ts` | Run with `npm test` |

Two details that are easy to break and expensive to get wrong:

- The inner ten (`"X"`) scores 10 and counts as **both** a ten and an X. Tens
  include outer and inner. Every tiebreak depends on this.
- Ranking order is total → tens → inner tens → shoot-off. Competitors who are
  still level are flagged `needsShootOff`, not silently ordered. v1 broke ties
  alphabetically, which is how you hand someone the wrong medal.

### `supabase/migrations/0001_init.sql`

Full schema: `profiles`, `tournaments`, `memberships`, `categories`,
`divisions`, `archers`, `teams`, `team_members`, `judge_assignments`, `ends`,
`matches`, `results`, `import_batches`, `import_rows`, `audit_log`.

RLS is enabled on every table with **zero policies**, so everything is
currently denied. That is deliberate — an unfinished policy set must fail
closed. Helper functions `current_role_in`, `division_phase` and
`judge_owns_bale` are already defined for policies to use.

### Everything else

Next.js skeleton only. `src/app/page.tsx` is a placeholder. There is no auth,
no server layer, no UI.

---

## 5. The decisions that are locked

Full list is in `CLAUDE.md`. The ones you are most likely to accidentally
violate:

1. **No client writes.** Nothing under `src/components` may call
   `supabase.from(...).insert|update|delete`. Every mutation goes through a
   server action in `src/server/actions/` that re-checks identity and phase.
2. **Phase lives on `divisions`, not `tournaments`.** Recurve men can cut while
   compound women are still in qualification. This is required for
   international-format events and it is why the schema looks the way it does.
3. **Categories are data, not enums.** Bow style, gender and age class are
   seeded rows. An AAI rulebook revision must be a seed change, not a migration.
4. **`results` is derived and never client-written.** Arrows are stored as shot
   in `ends.arrows`; any total can be recomputed. Never trust a stored total as
   the source of truth.
5. **Imports never insert directly.** CSV, XLSX and PDF all land in
   `import_batches` / `import_rows`, get reviewed by a human, then commit.
6. **Fail closed.** Never add a permissive policy "temporarily".

---

## 6. Build order, and where we are

```
[done] 0. Rules engine + initial schema
[HERE] 1. GitHub repo + first commit
       2. 0002_policies.sql — RLS policies
       3. Auth scaffold — magic-link invites, middleware, /accept
       4. src/server/ — requireUser, requireMembership, assertPhase
       5. Phase transition actions with preconditions + audit
       6. People page — invite by email, assign judges to bales
       7. Entry pipeline — manual, then CSV/XLSX, then PDF
       8. Role-aware UI + built-in guidance
       9. Offline score queue for judges
      10. Hardening — seed script, role tests, full dry run
```

Steps 2–5 are what make the system trustworthy. **Do not skip ahead to UI.**
If you find yourself writing a React component before step 5 is done,
something has gone wrong.

---

## 7. Your immediate tasks, in order

### Task 0 — flag a live security issue (do this first, it is one sentence)

Tell Yash that v1 may still be deployed with `using (true)` policies, which
means anyone can currently write to that database. He should take the v1
deployment down or lock its policies before doing anything else. Do not attempt
to fix v1 — it is archived.

### Task 1 — repo and first commit

```bash
git init
git add -A
git commit -m "chore: rules engine, initial schema, project skeleton"
```

Then create a **new, private** GitHub repo. Do not push into
`Iamyashsiwach/Archery-tms` — v1 stays as it is for reference.

If the `gh` CLI is available and authenticated:

```bash
gh repo create archery-tms-v2 --private --source=. --remote=origin --push
```

If not, ask Yash to create an empty private repo named `archery-tms-v2` on
github.com and give you the URL, then:

```bash
git remote add origin <url>
git branch -M main
git push -u origin main
```

Before the first push, confirm `.gitignore` covers `.env.local`, `node_modules`,
`.next` and `dist`, and that no key has been committed.

### Task 2 — verify the checkout actually works

```bash
npm install
npm run typecheck
npm test          # expect 34 passing
```

If any of these fail, fix them before moving on and tell Yash what was wrong.

### Task 3 — `supabase/migrations/0002_policies.sql`

Write the RLS policy set. Use the helper functions from `0001`. It must enforce:

- `COACH` can insert and update `archers` only where `membership_id` is their
  own active membership **and** the division phase is `REGISTRATION`.
- `JUDGE` can insert `ends` only for a bale they are assigned to, and only when
  the division phase is `QUALIFICATION` (for `stage = 'QUALIFICATION'`) or
  `ELIMINATION` (for `stage = 'ELIMINATION'` rows carrying a `match_id`).
- `OFFICIAL` can write `tournaments`, `categories`, `divisions`,
  `judge_assignments`, and archers' `bale_number` / `slot_index`.
- Nobody writes `results` or `audit_log` through RLS at all — service role only.
- `anon` may select from `divisions`, `archers` (name, club, division, bale and
  slot only), `ends`, `matches` and `results`. Never from `memberships`,
  `profiles`, `import_batches` or `import_rows`. Consider exposing the public
  read surface as views rather than table policies so no column leaks by
  accident.
- No write policy may use `using (true)`.

Then write a test plan Yash can run in the Supabase SQL editor that proves each
role is blocked where it should be. A policy set nobody tested is a policy set
that does not work.

**Do not touch anything under `src/` for this task.**

---

## 8. Open questions — ask, do not guess

Both are currently placeholder values in the code:

1. **Indian Round spec.** `catalogue.ts` templates it as 50m and 30m, 36 arrows
   each, 122cm face. This is a guess. Ask Yash for the figures from the
   relevant AAI circular.
2. **Age classes.** Assumed sub-junior, cadet, junior, senior, master. Ask for
   the confirmed set and the cutoff ages for AAI-affiliated events.

Neither blocks tasks 0–3. Both block seeding the `categories` table.

---

## 9. How to work here

- Every server action follows the same shape:
  `requireMembership` → `assertPhase` → zod parse → mutate → write `audit_log`.
- Use the user's session via `@supabase/ssr` so RLS applies as a second lock.
  The service-role key is for result recalculation and phase transitions only,
  and must never be imported into anything under `src/components`.
- Comments explain *why*, not *what*.
- Soft delete only. An archer's score rows must stay attributable.
- Judge UI, when you get there, is thumb-first: 56px minimum touch targets,
  works at 360px width, functions with the network down.
- When you finish a step, say what you changed, what you did not do, and what
  the next step needs. Do not silently expand scope.
