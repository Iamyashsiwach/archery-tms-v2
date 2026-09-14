import type {
  Arrow,
  DistanceSpec,
  End,
  EndResult,
  RankingEntry,
  ScoreTotals,
} from "./types.js";

/** Points an arrow is worth. The inner ten scores 10, same as an outer ten. */
export function arrowPoints(arrow: Arrow, maxRingValue = 10): number {
  if (arrow === "M") return 0;
  if (arrow === "X") return maxRingValue;
  if (typeof arrow === "number" && Number.isInteger(arrow) && arrow >= 0 && arrow <= maxRingValue) {
    return arrow;
  }
  return Number.NaN;
}

/** True for both the outer ten and the inner ten. Used for the first tiebreak. */
export function isTen(arrow: Arrow, maxRingValue = 10): boolean {
  return arrow === "X" || arrow === maxRingValue;
}

/** True only for the inner ten. Used for the second tiebreak. */
export function isX(arrow: Arrow): boolean {
  return arrow === "X";
}

/** Every value a judge may legally enter for a given face. */
export function scoringZones(spec: Pick<DistanceSpec, "maxRingValue">): Arrow[] {
  const zones: Arrow[] = ["X"];
  for (let v = spec.maxRingValue; v >= 1; v--) zones.push(v);
  zones.push("M");
  return zones;
}

/**
 * Validate and total one end.
 *
 * An end is rejected if it has the wrong arrow count, contains an illegal
 * value, or is not in descending order. Descending order is how scoresheets
 * are written under WA rules and catching it at entry stops a whole class of
 * transcription error.
 */
export function scoreEnd(
  arrows: End,
  spec: Pick<DistanceSpec, "arrowsPerEnd" | "maxRingValue">,
  options: { requireDescending?: boolean } = {}
): EndResult {
  const errors: string[] = [];
  const { requireDescending = true } = options;

  if (arrows.length !== spec.arrowsPerEnd) {
    errors.push(`Expected ${spec.arrowsPerEnd} arrows, got ${arrows.length}`);
  }

  let total = 0;
  let tens = 0;
  let xs = 0;
  const points: number[] = [];

  for (let i = 0; i < arrows.length; i++) {
    const a = arrows[i];
    const p = arrowPoints(a, spec.maxRingValue);
    if (Number.isNaN(p)) {
      errors.push(`Arrow ${i + 1} is not a valid value: ${String(a)}`);
      points.push(-1);
      continue;
    }
    points.push(p);
    total += p;
    if (isTen(a, spec.maxRingValue)) tens++;
    if (isX(a)) xs++;
  }

  if (requireDescending && errors.length === 0) {
    for (let i = 1; i < points.length; i++) {
      if (points[i] > points[i - 1]) {
        errors.push("Arrows must be entered highest to lowest");
        break;
      }
    }
  }

  return { total, tens, xs, valid: errors.length === 0, errors };
}

/** Sum a competitor's ends into a running total. */
export function totalEnds(
  ends: End[],
  spec: Pick<DistanceSpec, "maxRingValue">
): ScoreTotals {
  let total = 0;
  let tens = 0;
  let xs = 0;
  let arrowsScored = 0;

  for (const end of ends) {
    for (const a of end) {
      const p = arrowPoints(a, spec.maxRingValue);
      if (Number.isNaN(p)) continue;
      total += p;
      if (isTen(a, spec.maxRingValue)) tens++;
      if (isX(a)) xs++;
      arrowsScored++;
    }
  }

  return { total, tens, xs, arrowsScored };
}

/**
 * Compare two competitors for ranking.
 *
 * WA order: higher total, then more tens (inner and outer), then more inner
 * tens. Still level after that and the tie can only be broken by a shoot-off,
 * so this returns 0 and the caller must flag it.
 *
 * Returns negative when a ranks ahead of b, matching Array.prototype.sort.
 */
export function compareForRanking(
  a: Pick<ScoreTotals, "total" | "tens" | "xs">,
  b: Pick<ScoreTotals, "total" | "tens" | "xs">
): number {
  if (a.total !== b.total) return b.total - a.total;
  if (a.tens !== b.tens) return b.tens - a.tens;
  if (a.xs !== b.xs) return b.xs - a.xs;
  return 0;
}

/**
 * Rank a division. Competitors who cannot be separated share a rank and are
 * flagged; the next rank skips accordingly (1, 2, 2, 4).
 */
export function rankDivision(
  entries: Array<{ competitorId: string } & Pick<ScoreTotals, "total" | "tens" | "xs">>
): RankingEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const c = compareForRanking(a, b);
    if (c !== 0) return c;
    return a.competitorId.localeCompare(b.competitorId);
  });

  const out: RankingEntry[] = [];
  let rank = 0;

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const prev = sorted[i - 1];
    const tiedWithPrev = prev ? compareForRanking(prev, e) === 0 : false;
    const next = sorted[i + 1];
    const tiedWithNext = next ? compareForRanking(e, next) === 0 : false;

    if (!tiedWithPrev) rank = i + 1;

    out.push({
      competitorId: e.competitorId,
      total: e.total,
      tens: e.tens,
      xs: e.xs,
      rank,
      needsShootOff: tiedWithPrev || tiedWithNext,
    });
  }

  return out;
}

/**
 * Apply a judge-resolved shoot-off to a ranking. `order` lists competitor ids
 * from best to worst among those who were tied at `rank`.
 */
export function applyRankingShootOff(
  ranking: RankingEntry[],
  rank: number,
  order: string[]
): RankingEntry[] {
  const position = new Map(order.map((id, i) => [id, i]));
  return ranking
    .map((r) =>
      r.rank === rank && position.has(r.competitorId)
        ? { ...r, rank: rank + position.get(r.competitorId)!, needsShootOff: false }
        : r
    )
    .sort((a, b) => a.rank - b.rank);
}
