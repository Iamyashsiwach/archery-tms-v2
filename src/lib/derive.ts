/**
 * Glue between database rows and the rules engine. Pure: rows in, rows out.
 * Everything that decides a score, a rank or a winner lives in ./rules; this
 * file only reshapes data so the engine's answers can be persisted.
 */

import { getMatchSpec, getRound } from "./rules/catalogue";
import { advance, bracketSizeFor, generateBracket, medals, type BracketSlot, type RoundCode } from "./rules/brackets";
import { evaluateMatch } from "./rules/matches";
import { applyRankingShootOff, rankDivision, totalEnds } from "./rules/scoring";
import type { Arrow } from "./rules/types";

export interface EndRow {
  archer_id: string;
  stage: "QUALIFICATION" | "ELIMINATION" | "SHOOT_OFF";
  end_number: number;
  arrows: Arrow[];
}

export interface StandingRow {
  archer_id: string;
  total: number;
  tens: number;
  xs: number;
  rank: number;
  needs_shoot_off: boolean;
}

export interface MatchRow {
  id: string;
  round: RoundCode;
  match_number: number;
  seed1: number | null;
  seed2: number | null;
  archer1_id: string | null;
  archer2_id: string | null;
  winner_archer_id: string | null;
  status: "PENDING" | "ACTIVE" | "SHOOT_OFF" | "COMPLETE";
  closest_to_centre: 1 | 2 | null;
}

/** Ends in a whole round, across all distances. */
export function expectedEnds(roundCode: string): number {
  return getRound(roundCode).distances.reduce((n, d) => n + d.arrows / d.arrowsPerEnd, 0);
}

/**
 * Qualification standings straight from the arrows. A tie the officials have
 * resolved by shoot-off (`shootOffPositions`, 1 = best in the group) is applied
 * once every archer in that group has a position; otherwise it stays flagged.
 */
export function standings(
  archerIds: string[],
  ends: EndRow[],
  shootOffPositions: Map<string, number> = new Map()
): StandingRow[] {
  const byArcher = new Map<string, Arrow[][]>(archerIds.map((id) => [id, []]));
  for (const e of ends) if (e.stage === "QUALIFICATION") byArcher.get(e.archer_id)?.push(e.arrows);

  let ranking = rankDivision(
    [...byArcher].map(([competitorId, archerEnds]) => {
      const { total, tens, xs } = totalEnds(archerEnds, { maxRingValue: 10 });
      return { competitorId, total, tens, xs };
    })
  );

  const tiedRanks = new Set(ranking.filter((r) => r.needsShootOff).map((r) => r.rank));
  for (const rank of tiedRanks) {
    const tied = ranking.filter((r) => r.rank === rank && r.needsShootOff);
    if (!tied.every((r) => shootOffPositions.has(r.competitorId))) continue;
    const order = tied
      .map((r) => r.competitorId)
      .sort((a, b) => shootOffPositions.get(a)! - shootOffPositions.get(b)!);
    ranking = applyRankingShootOff(ranking, rank, order);
  }

  return ranking.map((r) => ({
    archer_id: r.competitorId,
    total: r.total,
    tens: r.tens,
    xs: r.xs,
    rank: r.rank,
    needs_shoot_off: r.needsShootOff,
  }));
}

function toSlots(rows: MatchRow[]): BracketSlot[] {
  return rows.map((m) => ({
    round: m.round,
    matchNumber: m.match_number,
    seed1: m.seed1,
    seed2: m.seed2,
    competitor1: m.archer1_id,
    competitor2: m.archer2_id,
    winner: m.winner_archer_id,
  }));
}

type Patch = ReturnType<typeof advance>[number];

function toPatchRows(patches: Patch[]) {
  return patches.map((p) => ({
    match_number: p.matchNumber,
    ...("competitor1" in p ? { archer1_id: p.competitor1 } : {}),
    ...("competitor2" in p ? { archer2_id: p.competitor2 } : {}),
  }));
}

/**
 * The elimination bracket for a division, seeded by final qualification rank.
 * `requestedSize` is the division's bracket_size; it is capped so a small field
 * never gets a bracket full of empty matches. Byes are resolved and their
 * winners already placed in the next round.
 */
export function bracketPayload(ranked: StandingRow[], requestedSize: number | null) {
  const order = [...ranked].sort((a, b) => a.rank - b.rank);
  const natural = bracketSizeFor(order.length);
  const size = requestedSize ? Math.min(requestedSize, natural) : natural;
  const entrants = order.slice(0, size).map((r) => r.archer_id);

  const slots = generateBracket(entrants, { size });
  for (const bye of slots.filter((s) => s.winner)) {
    for (const p of advance(bye, slots)) {
      const target = slots.find((s) => s.matchNumber === p.matchNumber)!;
      if ("competitor1" in p) target.competitor1 = p.competitor1 ?? null;
      if ("competitor2" in p) target.competitor2 = p.competitor2 ?? null;
    }
  }

  return {
    bracket_size: size,
    seeds: entrants.map((archer_id, i) => ({ archer_id, seed: i + 1 })),
    matches: slots.map((s) => ({
      round: s.round,
      match_number: s.matchNumber,
      seed1: s.seed1,
      seed2: s.seed2,
      archer1_id: s.competitor1,
      archer2_id: s.competitor2,
      winner_archer_id: s.winner,
      decided_by: s.winner ? "BYE" : null,
      status: s.winner ? "COMPLETE" : "PENDING",
    })),
  };
}

/**
 * A match's state from its ends, and the bracket slots its result fills.
 * Only ends both sides have shot count, so a half-entered end never decides.
 */
export function matchUpdate(matchFormatCode: string, match: MatchRow, all: MatchRow[], ends: EndRow[]) {
  const spec = getMatchSpec(matchFormatCode);
  const side = (archerId: string | null, stage: EndRow["stage"]) =>
    ends
      .filter((e) => archerId && e.archer_id === archerId && e.stage === stage)
      .sort((a, b) => a.end_number - b.end_number)
      .map((e) => e.arrows);

  const ends1 = side(match.archer1_id, "ELIMINATION");
  const ends2 = side(match.archer2_id, "ELIMINATION");
  const shot = Math.min(ends1.length, ends2.length);
  const [so1] = side(match.archer1_id, "SHOOT_OFF");
  const [so2] = side(match.archer2_id, "SHOOT_OFF");
  const shootOff =
    so1 && so2
      ? { arrows1: so1, arrows2: so2, closestToCentre: match.closest_to_centre ?? undefined }
      : undefined;

  const state = evaluateMatch(spec, ends1.slice(0, shot), ends2.slice(0, shot), shootOff);
  const outcome = state.outcome;
  const winner = outcome.decided ? (outcome.winner === 1 ? match.archer1_id : match.archer2_id) : null;
  const status: MatchRow["status"] = outcome.decided
    ? "COMPLETE"
    : outcome.reason === "SHOOT_OFF_REQUIRED"
      ? "SHOOT_OFF"
      : shot > 0
        ? "ACTIVE"
        : "PENDING";

  const patches =
    winner === null
      ? []
      : advance({ ...toSlots([match])[0], winner }, toSlots(all.map((m) => (m.id === match.id ? { ...m, winner_archer_id: winner } : m))));

  return {
    state: {
      set_points_1: state.setPoints1,
      set_points_2: state.setPoints2,
      total_1: state.total1,
      total_2: state.total2,
      status,
      winner_archer_id: winner,
      decided_by: outcome.decided ? outcome.reason : null,
    },
    patches: toPatchRows(patches),
  };
}

/** Final placings once every match is complete: medals, and fourth for the bronze loser. */
export function placings(all: MatchRow[]) {
  const { gold, silver, bronze } = medals(toSlots(all));
  const bronzeMatch = all.find((m) => m.round === "BRONZE");
  const fourth = bronzeMatch
    ? bronzeMatch.winner_archer_id === bronzeMatch.archer1_id
      ? bronzeMatch.archer2_id
      : bronzeMatch.archer1_id
    : null;

  return [
    { archer_id: gold, final_rank: 1, medal: "GOLD" },
    { archer_id: silver, final_rank: 2, medal: "SILVER" },
    { archer_id: bronze, final_rank: 3, medal: "BRONZE" },
    { archer_id: fourth, final_rank: 4, medal: null },
  ].filter((p): p is { archer_id: string; final_rank: number; medal: string | null } => p.archer_id !== null);
}

// ponytail: fixed four archers per target (slots 1–4, WA's A–D); make it a
// tournament setting when a meet shoots three or six to a boss.
export const ARCHERS_PER_BALE = 4;

/** Fills targets in order from `firstBale`, ARCHERS_PER_BALE to each. */
export function allocate(archerIds: string[], firstBale: number) {
  return archerIds.map((archer_id, i) => ({
    archer_id,
    bale_number: firstBale + Math.floor(i / ARCHERS_PER_BALE),
    slot_index: (i % ARCHERS_PER_BALE) + 1,
  }));
}
