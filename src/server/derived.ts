import "server-only";

import { revalidatePath } from "next/cache";
import {
  bracketPayload,
  expectedEnds,
  matchUpdate,
  placings,
  standings,
  type EndRow,
  type MatchRow,
  type StandingRow,
} from "@/lib/derive";
import { PHASES, type Phase } from "@/lib/phases";
import { createAdminClient } from "./admin";
import { ActionError, refuse } from "./auth";

// Everything here runs with the service role, so callers must have passed
// requireMembership first. The rules engine computes; the database functions
// from 0004 persist atomically and re-check what they can.

type Admin = ReturnType<typeof createAdminClient>;

/** PostgREST returns at most 1000 rows per request; a division's ends exceed that. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

function divisionEnds(db: Admin, divisionId: string, stage: EndRow["stage"]) {
  return allRows((from, to) =>
    db
      .from("ends")
      .select("archer_id, stage, end_number, arrows")
      .eq("division_id", divisionId)
      .eq("stage", stage)
      .order("id")
      .range(from, to)
      .overrideTypes<EndRow[], { merge: false }>()
  );
}

function refreshPublicPages(tournamentId: string) {
  revalidatePath(`/display/${tournamentId}`);
}

/** Qualification standings for a division, recomputed from every arrow. */
export async function recalculateStandings(divisionId: string) {
  const db = createAdminClient();
  const [{ data: division }, { data: archers }, { data: resolved }, ends] = await Promise.all([
    db.from("divisions").select("tournament_id, phase").eq("id", divisionId).single(),
    db.from("archers").select("id").eq("division_id", divisionId).is("deleted_at", null),
    db.from("results").select("archer_id, shoot_off_position").eq("division_id", divisionId).not("shoot_off_position", "is", null),
    divisionEnds(db, divisionId, "QUALIFICATION"),
  ]);
  if (!division || (division.phase !== "QUALIFICATION" && division.phase !== "CUT")) return;

  const rows = standings(
    (archers ?? []).map((a) => a.id),
    ends,
    new Map((resolved ?? []).map((r) => [r.archer_id!, r.shoot_off_position!]))
  );
  const { error } = await db.rpc("write_results", { p_division: divisionId, p_rows: rows as never });
  if (error) refuse(error, ["results_frozen"]);
  refreshPublicPages(division.tournament_id);
}

const MATCH_COLUMNS =
  "id, round, match_number, seed1, seed2, archer1_id, archer2_id, winner_archer_id, status, closest_to_centre";

/** A match's state from its ends; the winner moves on when it is decided. */
export async function recalculateMatch(matchId: string) {
  const db = createAdminClient();
  const { data: match } = await db
    .from("matches")
    .select(`${MATCH_COLUMNS}, tournament_id, division_id, divisions(categories(match_format_code))`)
    .eq("id", matchId)
    .single()
    .overrideTypes<
      MatchRow & { tournament_id: string; division_id: string; divisions: { categories: { match_format_code: string } } },
      { merge: false }
    >();
  if (!match || match.status === "COMPLETE") return;

  const [{ data: bracket }, { data: ends }] = await Promise.all([
    db.from("matches").select(MATCH_COLUMNS).eq("division_id", match.division_id).overrideTypes<MatchRow[], { merge: false }>(),
    db.from("ends").select("archer_id, stage, end_number, arrows").eq("match_id", matchId).overrideTypes<EndRow[], { merge: false }>(),
  ]);

  const update = matchUpdate(match.divisions.categories.match_format_code, match, bracket ?? [], ends ?? []);
  const { error } = await db.rpc("apply_match", {
    p_match: matchId,
    p_state: update.state as never,
    p_patches: update.patches as never,
  });
  if (error) refuse(error, ["match_not_open"]);
  refreshPublicPages(match.tournament_id);
}

/** Records who won a ranking shoot-off, then re-ranks the division. */
export async function recordRankingShootOff(divisionId: string, positions: { archer_id: string; position: number }[]) {
  const db = createAdminClient();
  for (const p of positions) {
    const { error } = await db
      .from("results")
      .update({ shoot_off_position: p.position })
      .eq("division_id", divisionId)
      .eq("archer_id", p.archer_id);
    if (error) refuse(error, []);
  }
  await recalculateStandings(divisionId);
}

export const TRANSITION_REFUSALS = [
  "not_allowed",
  "invalid_transition",
  "reason_required",
  "no_archers",
  "rosters_not_submitted",
  "archers_without_target",
  "target_without_judge",
  "expected_ends_required",
  "ends_missing",
  "bracket_required",
  "shoot_off_required",
  "bracket_archer_outside_division",
  "matches_not_complete",
  "medals_required",
  "elimination_already_scored",
] as const;

/**
 * Moves a division one phase forward, or one back (a reopen, which needs a
 * reason). Computes what only the rules engine knows — expected ends, the
 * bracket, the medals — and hands it to transition_division, which checks the
 * preconditions and applies everything in one transaction.
 */
export async function transition(
  divisionId: string,
  to: Phase,
  actorId: string,
  options: { reason?: string; forceClose?: boolean } = {}
) {
  const db = createAdminClient();
  const { data: d } = await db
    .from("divisions")
    .select("id, tournament_id, phase, bracket_size, categories(round_code)")
    .eq("id", divisionId)
    .single()
    .overrideTypes<
      { id: string; tournament_id: string; phase: Phase; bracket_size: number | null; categories: { round_code: string } },
      { merge: false }
    >();
  if (!d) throw new ActionError("not_found");

  const forward = PHASES.indexOf(to) === PHASES.indexOf(d.phase) + 1;
  let payload: Record<string, unknown> = {};

  if (forward && d.phase === "REGISTRATION") {
    payload = { force_close: options.forceClose === true };
  } else if (forward && d.phase === "QUALIFICATION") {
    await recalculateStandings(d.id);
    payload = { expected_ends: expectedEnds(d.categories.round_code) };
  } else if (forward && d.phase === "CUT") {
    await recalculateStandings(d.id);
    const { data: results } = await db
      .from("results")
      .select("archer_id, qualification_total, qualification_tens, qualification_xs, qualification_rank, needs_shoot_off")
      .eq("division_id", d.id);
    const ranked: StandingRow[] = (results ?? []).map((r) => ({
      archer_id: r.archer_id!,
      total: r.qualification_total,
      tens: r.qualification_tens,
      xs: r.qualification_xs,
      rank: r.qualification_rank ?? Number.MAX_SAFE_INTEGER,
      needs_shoot_off: r.needs_shoot_off,
    }));
    if (ranked.length < 2) throw new ActionError("too_few_for_bracket");
    payload = bracketPayload(ranked, d.bracket_size);
  } else if (forward && d.phase === "ELIMINATION") {
    const { data: bracket } = await db
      .from("matches")
      .select(MATCH_COLUMNS)
      .eq("division_id", d.id)
      .overrideTypes<MatchRow[], { merge: false }>();
    payload = { placings: placings(bracket ?? []) };
  }

  const { error } = await db.rpc("transition_division", {
    p_division: d.id,
    p_to: to,
    p_actor: actorId,
    p_reason: options.reason ?? undefined,
    p_payload: payload as never,
  });
  if (error) refuse(error, TRANSITION_REFUSALS);
  refreshPublicPages(d.tournament_id);
}
