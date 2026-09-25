import type { MatchSpec, RoundSpec } from "./types";

/**
 * Qualification rounds. Target archery only.
 *
 * Distances vary by age category and bow style — that mapping lives in the
 * `category_rounds` seed table, not here. This file only describes the shape
 * of each round so the scoring engine knows how many arrows to expect.
 */

function wa720(distance: number, faceCm: number, code: string, name: string): RoundSpec {
  return {
    code,
    name,
    venue: "OUTDOOR",
    distances: [
      { distance, faceCm, arrows: 72, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
    ],
  };
}

export const ROUNDS: Record<string, RoundSpec> = {
  WA720_70: wa720(70, 122, "WA720_70", "WA 720 — 70m"),
  WA720_60: wa720(60, 122, "WA720_60", "WA 720 — 60m"),
  WA720_50_80CM: wa720(50, 80, "WA720_50_80CM", "WA 720 — 50m (80cm face)"),
  WA720_50_122CM: wa720(50, 122, "WA720_50_122CM", "WA 720 — 50m (122cm face)"),
  WA720_40: wa720(40, 122, "WA720_40", "WA 720 — 40m"),
  WA720_30: wa720(30, 122, "WA720_30", "WA 720 — 30m"),

  WA1440_M: {
    code: "WA1440_M",
    name: "WA 1440 — men",
    venue: "OUTDOOR",
    distances: [
      { distance: 90, faceCm: 122, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
      { distance: 70, faceCm: 122, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
      { distance: 50, faceCm: 80, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
      { distance: 30, faceCm: 80, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
    ],
  },

  WA1440_W: {
    code: "WA1440_W",
    name: "WA 1440 — women",
    venue: "OUTDOOR",
    distances: [
      { distance: 70, faceCm: 122, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
      { distance: 60, faceCm: 122, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
      { distance: 50, faceCm: 80, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
      { distance: 30, faceCm: 80, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
    ],
  },

  WA18: {
    code: "WA18",
    name: "WA indoor — 18m",
    venue: "INDOOR",
    distances: [
      { distance: 18, faceCm: 40, arrows: 60, arrowsPerEnd: 3, maxRingValue: 10, innerScoresSeparately: false },
    ],
  },

  WA25: {
    code: "WA25",
    name: "WA indoor — 25m",
    venue: "INDOOR",
    distances: [
      { distance: 25, faceCm: 60, arrows: 60, arrowsPerEnd: 3, maxRingValue: 10, innerScoresSeparately: false },
    ],
  },

  /**
   * Indian Round — AAI domestic category shot with indigenous bows.
   * Distances and arrow counts vary between state and national meets, so this
   * entry is a template. Seed the real figures per tournament from the AAI
   * circular for that event rather than treating these as fixed.
   */
  INDIAN_ROUND: {
    code: "INDIAN_ROUND",
    name: "Indian round",
    venue: "OUTDOOR",
    distances: [
      { distance: 50, faceCm: 122, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
      { distance: 30, faceCm: 122, arrows: 36, arrowsPerEnd: 6, maxRingValue: 10, innerScoresSeparately: false },
    ],
  },
};

/**
 * Elimination match formats.
 *
 * Recurve uses the set system, compound is cumulative. Team and mixed team
 * differ in arrows per end and set points required.
 */
export const MATCH_SPECS: Record<string, MatchSpec> = {
  RECURVE_INDIVIDUAL: {
    code: "RECURVE_INDIVIDUAL",
    name: "Recurve individual",
    eventKind: "INDIVIDUAL",
    format: "SET_SYSTEM",
    arrowsPerEnd: 3,
    maxEnds: 5,
    pointsToWin: 6,
    shootOffArrows: 1,
  },
  COMPOUND_INDIVIDUAL: {
    code: "COMPOUND_INDIVIDUAL",
    name: "Compound individual",
    eventKind: "INDIVIDUAL",
    format: "CUMULATIVE",
    arrowsPerEnd: 3,
    maxEnds: 5,
    shootOffArrows: 1,
  },
  RECURVE_TEAM: {
    code: "RECURVE_TEAM",
    name: "Recurve team",
    eventKind: "TEAM",
    format: "SET_SYSTEM",
    arrowsPerEnd: 6,
    maxEnds: 4,
    pointsToWin: 5,
    shootOffArrows: 3,
  },
  COMPOUND_TEAM: {
    code: "COMPOUND_TEAM",
    name: "Compound team",
    eventKind: "TEAM",
    format: "CUMULATIVE",
    arrowsPerEnd: 6,
    maxEnds: 4,
    shootOffArrows: 3,
  },
  RECURVE_MIXED_TEAM: {
    code: "RECURVE_MIXED_TEAM",
    name: "Recurve mixed team",
    eventKind: "MIXED_TEAM",
    format: "SET_SYSTEM",
    arrowsPerEnd: 4,
    maxEnds: 4,
    pointsToWin: 5,
    shootOffArrows: 2,
  },
  COMPOUND_MIXED_TEAM: {
    code: "COMPOUND_MIXED_TEAM",
    name: "Compound mixed team",
    eventKind: "MIXED_TEAM",
    format: "CUMULATIVE",
    arrowsPerEnd: 4,
    maxEnds: 4,
    shootOffArrows: 2,
  },
};

export function getRound(code: string): RoundSpec {
  const r = ROUNDS[code];
  if (!r) throw new Error(`Unknown round: ${code}`);
  return r;
}

export function getMatchSpec(code: string): MatchSpec {
  const m = MATCH_SPECS[code];
  if (!m) throw new Error(`Unknown match format: ${code}`);
  return m;
}

/** Total arrows in a round, across all distances. */
export function roundArrowCount(round: RoundSpec): number {
  return round.distances.reduce((sum, d) => sum + d.arrows, 0);
}

/** Highest achievable score for a round. */
export function roundMaxScore(round: RoundSpec): number {
  return round.distances.reduce((sum, d) => sum + d.arrows * d.maxRingValue, 0);
}
