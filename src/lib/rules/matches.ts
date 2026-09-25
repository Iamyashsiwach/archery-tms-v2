import { totalEnds } from "./scoring";
import type { End, MatchSpec, MatchState } from "./types";

const RING = { maxRingValue: 10 };

/**
 * Evaluate a match from the ends shot so far.
 *
 * Pure: give it the same ends and it gives the same answer. Persisting the
 * result is the caller's job, which means a match can always be recomputed
 * from its arrows if a row is ever corrupted or corrected.
 */
export function evaluateMatch(
  spec: MatchSpec,
  ends1: End[],
  ends2: End[],
  shootOff?: MatchState["shootOff"]
): MatchState {
  if (ends1.length !== ends2.length) {
    throw new Error("Both sides must have the same number of ends recorded");
  }

  return spec.format === "SET_SYSTEM"
    ? evaluateSetSystem(spec, ends1, ends2, shootOff)
    : evaluateCumulative(spec, ends1, ends2, shootOff);
}

function evaluateSetSystem(
  spec: MatchSpec,
  ends1: End[],
  ends2: End[],
  shootOff?: MatchState["shootOff"]
): MatchState {
  const pointsToWin = spec.pointsToWin ?? 6;
  let setPoints1 = 0;
  let setPoints2 = 0;
  let decidedAt = -1;

  for (let i = 0; i < ends1.length; i++) {
    // Once a side has reached the target, later ends are not shot and are ignored.
    if (decidedAt >= 0) break;

    const t1 = totalEnds([ends1[i]], RING).total;
    const t2 = totalEnds([ends2[i]], RING).total;

    if (t1 > t2) setPoints1 += 2;
    else if (t2 > t1) setPoints2 += 2;
    else {
      setPoints1 += 1;
      setPoints2 += 1;
    }

    if (setPoints1 >= pointsToWin || setPoints2 >= pointsToWin) decidedAt = i;
  }

  const total1 = totalEnds(ends1, RING).total;
  const total2 = totalEnds(ends2, RING).total;
  const base = { spec, ends1, ends2, setPoints1, setPoints2, total1, total2, shootOff };

  if (setPoints1 >= pointsToWin && setPoints1 > setPoints2) {
    return { ...base, outcome: { decided: true, winner: 1, reason: "SETS" } };
  }
  if (setPoints2 >= pointsToWin && setPoints2 > setPoints1) {
    return { ...base, outcome: { decided: true, winner: 2, reason: "SETS" } };
  }

  const allSetsShot = ends1.length >= spec.maxEnds;
  if (!allSetsShot) {
    return { ...base, outcome: { decided: false, reason: "IN_PROGRESS" } };
  }

  // Level on set points after the full distance: one-arrow shoot-off.
  return resolveShootOff(base, shootOff);
}

function evaluateCumulative(
  spec: MatchSpec,
  ends1: End[],
  ends2: End[],
  shootOff?: MatchState["shootOff"]
): MatchState {
  const total1 = totalEnds(ends1, RING).total;
  const total2 = totalEnds(ends2, RING).total;
  const base = {
    spec,
    ends1,
    ends2,
    setPoints1: 0,
    setPoints2: 0,
    total1,
    total2,
    shootOff,
  };

  if (ends1.length < spec.maxEnds) {
    return { ...base, outcome: { decided: false, reason: "IN_PROGRESS" } };
  }

  if (total1 > total2) {
    return { ...base, outcome: { decided: true, winner: 1, reason: "POINTS" } };
  }
  if (total2 > total1) {
    return { ...base, outcome: { decided: true, winner: 2, reason: "POINTS" } };
  }

  return resolveShootOff(base, shootOff);
}

function resolveShootOff(
  base: Omit<MatchState, "outcome">,
  shootOff?: MatchState["shootOff"]
): MatchState {
  if (!shootOff) {
    return { ...base, shootOff, outcome: { decided: false, reason: "SHOOT_OFF_REQUIRED" } };
  }

  const s1 = totalEnds([shootOff.arrows1], RING).total;
  const s2 = totalEnds([shootOff.arrows2], RING).total;

  if (s1 > s2) {
    return { ...base, shootOff, outcome: { decided: true, winner: 1, reason: "SHOOT_OFF" } };
  }
  if (s2 > s1) {
    return { ...base, shootOff, outcome: { decided: true, winner: 2, reason: "SHOOT_OFF" } };
  }

  // Equal shoot-off scores: the judge measures which arrow is closest to centre.
  if (shootOff.closestToCentre) {
    return {
      ...base,
      shootOff,
      outcome: { decided: true, winner: shootOff.closestToCentre, reason: "SHOOT_OFF" },
    };
  }

  return { ...base, shootOff, outcome: { decided: false, reason: "SHOOT_OFF_REQUIRED" } };
}

/** How many ends remain to be shot, given the current state. */
export function endsRemaining(state: MatchState): number {
  if (state.outcome.decided) return 0;
  return Math.max(0, state.spec.maxEnds - state.ends1.length);
}
