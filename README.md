# archery-tms

## Overview

archery-tms runs **target archery** competitions under Archery Association of India and World Archery rules. It covers the whole event:

1. registration
2. target allocation
3. qualification scoring
4. the cut
5. elimination brackets
6. medals

It is used by tournament officials, judges and club coaches at district, state and national meets. Judges score on their phones, even with no signal on the range. Spectators follow a public results page that needs no sign-in.

The rules engine is the core: rankings, tie-breaks, match results and brackets are always computed from the arrows as shot, never entered by hand.

## System design

### Architecture

```
 Browser / judge's phone
   │  service worker + IndexedDB queue (offline scoring)
   ▼
 CloudFront ──────────────► S3 (static assets, cached pages)
   │
   ▼
 AWS Lambda — Next.js App Router (through OpenNext / SST)
   │  server actions · POST /api/ends · ISR public display
   │
   │  user session (RLS applies)     service role (derived data only)
   ▼                                  ▼
 Supabase — Postgres (RLS, triggers, security-definer functions)
          — Auth (email one-time codes, no passwords)

 EventBridge (daily) ──► Lambda keep-alive
```

The whole system is serverless. There is no long-running process and no in-memory state; state lives in Postgres or in the judge's browser.

### Components

| Part | Location | Responsibility |
|---|---|---|
| Rules engine | `src/lib/rules/` | Pure TypeScript with no I/O. It covers: <ul><li>arrow values and end validation</li><li>totals and the WA tie-break (total → tens → inner tens → shoot-off)</li><li>set-system and cumulative matches, with shoot-offs and the closest-to-centre call</li><li>brackets from 4 to 64 archers with byes</li><li>medals</li></ul> |
| Derivation | `src/lib/derive.ts` | Turns stored ends into standings, bracket payloads, match updates, placings and target allocation |
| Server layer | `src/server/` | Identity and membership checks, phase assertions, writing derived data and running phase transitions with the service role, and PDF roster reading |
| Web app | `src/app/` | Role-aware pages: setup, people, roster and imports, allocation, the judges' scorer, results and the public display |
| Database | `supabase/migrations/` | Schema, row-level security policies, audit triggers and the workflow functions |

### Roles

| Role | Can do |
|---|---|
| Admin | Everything, including granting admin |
| Official | Invite people, allocate targets, advance and reopen phases, resolve disputes |
| Judge | Enter ends for assigned targets only, record match results |
| Coach | Add and edit their own archers during registration |
| Anonymous | Read the public display only; never sees emails or phone numbers |

Archers do not have accounts. They are records owned by a coach.

### Phase machine

```
SETUP → REGISTRATION → ALLOCATION → QUALIFICATION → CUT → ELIMINATION → COMPLETE
```

- **Phases are per division, not per tournament.** For example, recurve men can be in the cut while compound women are still shooting qualification.
- **What a user may write depends on role, phase and table together.**
- **Each transition is one Postgres function.** It checks its preconditions first: every archer has a target, every target has a judge, all ends are in, ties are resolved, and so on.
- **Going back a phase needs a written reason.** Every transition is audited.

### Data model

- **Identity and access:** `profiles`, `tournaments`, `memberships` (a role per tournament, created by email invite)
- **Structure:** `categories` (bow style, gender and age class as data, not enums), `divisions`, `teams`, `team_members`
- **Competition:** `archers`, `judge_assignments`, `ends` (arrows as shot), `matches`
- **Derived and staging:** `results` (derived, never user-written), `import_batches` / `import_rows` (staging for roster imports)
- **History:** `audit_log` (written only by the database)

### Security model

- **Two locks on every write.** Each mutation passes through a server action, or the scoring route, that re-checks identity and phase. It then runs as the signed-in user, so Postgres row-level security enforces the same rules a second time.
- **Fail closed.** Every table has row-level security enabled. A table without a policy denies everything, and no write policy is unconditional.
- **Derived data is never client-written.** Results and match outcomes are written only through service-role functions, from rules-engine output. Any total can be recomputed from the stored arrows.
- **The database writes the audit trail**, through triggers and functions, so no code path can skip it.
- **Public reads go through restricted views.** Anonymous users read only `security_barrier` views that expose names, clubs, targets and scores.
- **Invites are bound to a verified email address** and accepted through a database function.

### Offline scoring

1. The judge's scorer is cached by a service worker.
2. Each end gets a client-generated ID and is saved to IndexedDB before anything is sent.
3. When there is a connection, the queue syncs to `POST /api/ends`.
4. The route validates the end against the round, inserts it as the judge (row-level security confirms the target assignment and phase), and treats a repeated ID as already saved.
5. Standings and match state are recalculated after the response has been sent.

### Roster imports

CSV and XLSX files are parsed on the server, and PDF entry forms are read by Claude. Every row lands in a staging table and is checked against the tournament's divisions. A coach reviews and corrects the rows, then commits them in one transaction. Nothing is inserted directly.

### Public display

The results page is statically regenerated (ISR, 30 seconds) and refreshed whenever new ends arrive, so spectators never add database load.
