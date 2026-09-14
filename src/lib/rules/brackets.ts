/**
 * Elimination brackets.
 *
 * Supports any power-of-two field from 4 to 64, with byes for seeds that have
 * no opponent. Seeding follows the standard World Archery order, so the top
 * seed only ever meets the second seed in the final.
 */

export type RoundCode = "R64" | "R32" | "R16" | "QF" | "SF" | "BRONZE" | "FINAL";

export interface BracketSlot {
  round: RoundCode;
  matchNumber: number;
  /** Seed number, 1-based. Null means the slot is empty (a bye). */
  seed1: number | null;
  seed2: number | null;
  competitor1: string | null;
  competitor2: string | null;
  /** Set when a bye means the match is already decided. */
  winner: string | null;
}

/** Display names. WA labels early rounds by fraction of the field. */
export const ROUND_LABEL: Record<RoundCode, string> = {
  R64: "1/32 elimination",
  R32: "1/16 elimination",
  R16: "1/8 elimination",
  QF: "Quarterfinal",
  SF: "Semifinal",
  BRONZE: "Bronze medal match",
  FINAL: "Gold medal match",
};

const SIZE_TO_ROUND: Record<number, RoundCode> = {
  64: "R64",
  32: "R32",
  16: "R16",
  8: "QF",
  4: "SF",
  2: "FINAL",
};

/**
 * Standard bracket seeding order for a field of `size`.
 * For 8 this gives [1, 8, 4, 5, 2, 7, 3, 6] — adjacent pairs are the matches.
 */
export function seedOrder(size: number): number[] {
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error(`Bracket size must be a power of two, got ${size}`);
  }
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s);
      next.push(n + 1 - s);
    }
    order = next;
  }
  return order;
}

/** Smallest legal bracket that holds `count` competitors. */
export function bracketSizeFor(count: number): number {
  if (count < 2) throw new Error("A bracket needs at least 2 competitors");
  let size = 2;
  while (size < count) size *= 2;
  return Math.min(Math.max(size, 4), 64);
}

/**
 * Build every match in the bracket, including empty later rounds.
 *
 * `competitors` must already be in qualification rank order — index 0 is the
 * top seed. Byes are resolved immediately: a seed with no opponent has its
 * winner set and the match is complete before anyone shoots.
 */
export function generateBracket(
  competitors: string[],
  options: { size?: number; includeBronze?: boolean } = {}
): BracketSlot[] {
  const { includeBronze = true } = options;
  const size = options.size ?? bracketSizeFor(competitors.length);

  if (competitors.length > size) {
    throw new Error(`${competitors.length} competitors will not fit a ${size} bracket`);
  }

  const order = seedOrder(size);
  const slots: Array<{ seed: number; competitor: string | null }> = order.map((seed) => ({
    seed,
    competitor: competitors[seed - 1] ?? null,
  }));

  const out: BracketSlot[] = [];
  let matchNumber = 1;
  const firstRound = SIZE_TO_ROUND[size];

  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    const bye = (a.competitor && !b.competitor) || (!a.competitor && b.competitor);

    out.push({
      round: firstRound,
      matchNumber: matchNumber++,
      seed1: a.competitor ? a.seed : null,
      seed2: b.competitor ? b.seed : null,
      competitor1: a.competitor,
      competitor2: b.competitor,
      winner: bye ? (a.competitor ?? b.competitor) : null,
    });
  }

  // Empty shells for every later round.
  for (let s = size / 2; s >= 2; s /= 2) {
    const round = SIZE_TO_ROUND[s];
    const count = s / 2;
    for (let k = 0; k < count; k++) {
      out.push({
        round,
        matchNumber: matchNumber++,
        seed1: null,
        seed2: null,
        competitor1: null,
        competitor2: null,
        winner: null,
      });
    }
  }

  if (includeBronze && size >= 4) {
    out.push({
      round: "BRONZE",
      matchNumber: matchNumber++,
      seed1: null,
      seed2: null,
      competitor1: null,
      competitor2: null,
      winner: null,
    });
  }

  return out;
}

const ROUND_SEQUENCE: RoundCode[] = ["R64", "R32", "R16", "QF", "SF", "FINAL"];

/**
 * Given a completed match, return the slot updates that follow from it:
 * the winner moves into the next round, and semifinal losers meet for bronze.
 *
 * Returned as patches rather than applied in place so the caller can write
 * them in one transaction and keep the audit trail honest.
 */
export function advance(
  completed: BracketSlot,
  all: BracketSlot[]
): Array<{ matchNumber: number; competitor1?: string | null; competitor2?: string | null }> {
  if (!completed.winner) return [];

  const idx = ROUND_SEQUENCE.indexOf(completed.round);
  if (idx < 0 || completed.round === "FINAL") return [];

  const nextRound = ROUND_SEQUENCE[idx + 1];
  const thisRound = all
    .filter((m) => m.round === completed.round)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  const next = all
    .filter((m) => m.round === nextRound)
    .sort((a, b) => a.matchNumber - b.matchNumber);
  if (next.length === 0) return [];

  const position = thisRound.findIndex((m) => m.matchNumber === completed.matchNumber);
  if (position < 0) return [];

  const target = next[Math.floor(position / 2)];
  if (!target) return [];

  const patches: Array<{
    matchNumber: number;
    competitor1?: string | null;
    competitor2?: string | null;
  }> = [
    position % 2 === 0
      ? { matchNumber: target.matchNumber, competitor1: completed.winner }
      : { matchNumber: target.matchNumber, competitor2: completed.winner },
  ];

  if (completed.round === "SF") {
    const bronze = all.find((m) => m.round === "BRONZE");
    const semis = thisRound;
    const bothDone = semis.length === 2 && semis.every((m) => m.winner);
    if (bronze && bothDone) {
      const losers = semis.map((m) =>
        m.winner === m.competitor1 ? m.competitor2 : m.competitor1
      );
      if (losers[0] && losers[1]) {
        patches.push({
          matchNumber: bronze.matchNumber,
          competitor1: losers[0],
          competitor2: losers[1],
        });
      }
    }
  }

  return patches;
}

/** Final placings once every match is complete. */
export function medals(all: BracketSlot[]): {
  gold: string | null;
  silver: string | null;
  bronze: string | null;
} {
  const final = all.find((m) => m.round === "FINAL");
  const bronzeMatch = all.find((m) => m.round === "BRONZE");

  const gold = final?.winner ?? null;
  const silver = final
    ? final.winner === final.competitor1
      ? final.competitor2
      : final.competitor1
    : null;
  const bronze = bronzeMatch?.winner ?? null;

  return { gold, silver, bronze };
}
