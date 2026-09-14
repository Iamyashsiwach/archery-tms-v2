/**
 * Core domain types. Target archery only (AAI / World Archery).
 *
 * Design note: bow styles and age categories are NOT enums here. They are seeded
 * rows in the `categories` table so an AAI rulebook revision is a data change,
 * not a schema migration. The engine only cares about the shape of a round.
 */

/** A single arrow. "X" is the inner ten, "M" is a miss. */
export type Arrow = "X" | "M" | number;

/** One end as shot by one competitor (or one team). */
export type End = Arrow[];

export type EventKind = "INDIVIDUAL" | "TEAM" | "MIXED_TEAM";

export type MatchFormat = "SET_SYSTEM" | "CUMULATIVE";

/** Which face a distance is shot on. Drives valid scoring zones. */
export interface DistanceSpec {
  /** Metres. */
  distance: number;
  /** Face diameter in cm. */
  faceCm: number;
  /** Number of arrows shot at this distance. */
  arrows: number;
  arrowsPerEnd: number;
  /** Highest scoring ring. 10 for WA target faces, 5 for some field faces. */
  maxRingValue: number;
  /**
   * True when the innermost ring is scored as its own value rather than
   * as a tiebreak marker. Compound outdoor scores the inner ten as 10 but
   * still records it for the tiebreak, so this stays false for target rounds.
   */
  innerScoresSeparately: boolean;
}

/** A complete qualification round definition. */
export interface RoundSpec {
  code: string;
  name: string;
  /** Indoor or outdoor, purely informational for the UI. */
  venue: "INDOOR" | "OUTDOOR";
  distances: DistanceSpec[];
}

/** How an elimination match is decided. */
export interface MatchSpec {
  code: string;
  name: string;
  eventKind: EventKind;
  format: MatchFormat;
  /** Arrows shot by each side per set (set system) or per end (cumulative). */
  arrowsPerEnd: number;
  /** Maximum sets (set system) or total ends (cumulative). */
  maxEnds: number;
  /** Set points needed to win. Ignored for cumulative. */
  pointsToWin?: number;
  /** Arrows each side shoots in a shoot-off if still level. */
  shootOffArrows: number;
}

export interface EndResult {
  total: number;
  tens: number;
  xs: number;
  valid: boolean;
  errors: string[];
}

export interface ScoreTotals {
  total: number;
  tens: number;
  xs: number;
  arrowsScored: number;
}

/** Ranking row for a division after qualification. */
export interface RankingEntry {
  competitorId: string;
  total: number;
  tens: number;
  xs: number;
  /** 1-based. Tied competitors share a rank until a shoot-off resolves them. */
  rank: number;
  /** True when this entry is still level with another and needs a shoot-off. */
  needsShootOff: boolean;
}

export type MatchOutcome =
  | { decided: true; winner: 1 | 2; reason: "POINTS" | "SETS" | "SHOOT_OFF" }
  | { decided: false; reason: "IN_PROGRESS" | "SHOOT_OFF_REQUIRED" };

export interface MatchState {
  spec: MatchSpec;
  /** Ends shot so far, index-aligned between the two sides. */
  ends1: End[];
  ends2: End[];
  setPoints1: number;
  setPoints2: number;
  total1: number;
  total2: number;
  outcome: MatchOutcome;
  /** Populated when a shoot-off has been shot. */
  shootOff?: {
    arrows1: End;
    arrows2: End;
    /** Judge decision when both shoot-off totals are equal. */
    closestToCentre?: 1 | 2;
  };
}
