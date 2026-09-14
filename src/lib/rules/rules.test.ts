import { test } from "node:test";
import assert from "node:assert/strict";

import { getMatchSpec, getRound, roundArrowCount, roundMaxScore } from "./catalogue.js";
import { scoreEnd, totalEnds, rankDivision, applyRankingShootOff, compareForRanking } from "./scoring.js";
import { evaluateMatch } from "./matches.js";
import { advance, bracketSizeFor, generateBracket, medals, seedOrder } from "./brackets.js";

const RING = { maxRingValue: 10 };
const END6 = { arrowsPerEnd: 6, maxRingValue: 10 };
const END3 = { arrowsPerEnd: 3, maxRingValue: 10 };

test("WA720 is 72 arrows for a perfect 720", () => {
  const r = getRound("WA720_70");
  assert.equal(roundArrowCount(r), 72);
  assert.equal(roundMaxScore(r), 720);
});

test("WA1440 men totals 144 arrows for a perfect 1440", () => {
  const r = getRound("WA1440_M");
  assert.equal(roundArrowCount(r), 144);
  assert.equal(roundMaxScore(r), 1440);
});

test("indoor 18m is 60 arrows for a perfect 600", () => {
  const r = getRound("WA18");
  assert.equal(roundArrowCount(r), 60);
  assert.equal(roundMaxScore(r), 600);
});

test("inner ten scores ten and counts as both a ten and an X", () => {
  const r = scoreEnd(["X", 10, 9, 9, 8, "M"], END6);
  assert.equal(r.valid, true);
  assert.equal(r.total, 46);
  assert.equal(r.tens, 2);
  assert.equal(r.xs, 1);
});

test("wrong arrow count is rejected", () => {
  const r = scoreEnd([10, 9], END6);
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /Expected 6 arrows/);
});

test("ascending arrows are rejected as a transcription error", () => {
  const r = scoreEnd([8, 9, 10, 7, 6, 5], END6);
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /highest to lowest/);
});

test("illegal arrow values are rejected", () => {
  const r = scoreEnd([11, 9, 8, 7, 6, 5], END6);
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /not a valid value/);
});

test("a perfect 720 totals correctly across 12 ends", () => {
  const ends = Array.from({ length: 12 }, () => ["X", "X", "X", "X", "X", "X"] as const);
  const t = totalEnds(ends.map((e) => [...e]), RING);
  assert.equal(t.total, 720);
  assert.equal(t.tens, 72);
  assert.equal(t.xs, 72);
  assert.equal(t.arrowsScored, 72);
});

test("ranking breaks ties on tens, then on inner tens", () => {
  const ranked = rankDivision([
    { competitorId: "a", total: 650, tens: 30, xs: 12 },
    { competitorId: "b", total: 650, tens: 32, xs: 9 },
    { competitorId: "c", total: 660, tens: 28, xs: 10 },
  ]);
  assert.deepEqual(ranked.map((r) => r.competitorId), ["c", "b", "a"]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
  assert.equal(ranked.every((r) => !r.needsShootOff), true);
});

test("competitors level on all three criteria share a rank and are flagged", () => {
  const ranked = rankDivision([
    { competitorId: "a", total: 640, tens: 25, xs: 8 },
    { competitorId: "b", total: 640, tens: 25, xs: 8 },
    { competitorId: "c", total: 630, tens: 20, xs: 5 },
  ]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 1, 3]);
  assert.equal(ranked[0].needsShootOff, true);
  assert.equal(ranked[1].needsShootOff, true);
  assert.equal(ranked[2].needsShootOff, false);
});

test("a judge-resolved shoot-off separates tied ranks", () => {
  const ranked = rankDivision([
    { competitorId: "a", total: 640, tens: 25, xs: 8 },
    { competitorId: "b", total: 640, tens: 25, xs: 8 },
    { competitorId: "c", total: 630, tens: 20, xs: 5 },
  ]);
  const resolved = applyRankingShootOff(ranked, 1, ["b", "a"]);
  assert.deepEqual(resolved.map((r) => r.competitorId), ["b", "a", "c"]);
  assert.deepEqual(resolved.map((r) => r.rank), [1, 2, 3]);
  assert.equal(resolved.every((r) => !r.needsShootOff), true);
});

test("compareForRanking returns zero only for a genuine tie", () => {
  assert.equal(compareForRanking({ total: 1, tens: 1, xs: 1 }, { total: 1, tens: 1, xs: 1 }), 0);
  assert.ok(compareForRanking({ total: 2, tens: 0, xs: 0 }, { total: 1, tens: 9, xs: 9 }) < 0);
});

test("recurve set system: 6 set points wins before the distance is shot", () => {
  const spec = getMatchSpec("RECURVE_INDIVIDUAL");
  // Archer 1 wins three sets outright: 2 + 2 + 2 = 6.
  const ends1 = [[10, 9, 9], [10, 10, 9], [9, 9, 9]];
  const ends2 = [[9, 9, 8], [9, 9, 8], [8, 8, 8]];
  const state = evaluateMatch(spec, ends1, ends2);
  assert.equal(state.setPoints1, 6);
  assert.equal(state.setPoints2, 0);
  assert.deepEqual(state.outcome, { decided: true, winner: 1, reason: "SETS" });
});

test("recurve set system: a tied set splits the set point", () => {
  const spec = getMatchSpec("RECURVE_INDIVIDUAL");
  const ends1 = [[9, 9, 9]];
  const ends2 = [[9, 9, 9]];
  const state = evaluateMatch(spec, ends1, ends2);
  assert.equal(state.setPoints1, 1);
  assert.equal(state.setPoints2, 1);
  assert.equal(state.outcome.decided, false);
});

test("recurve set system: 5-5 after five sets forces a shoot-off", () => {
  const spec = getMatchSpec("RECURVE_INDIVIDUAL");
  // Five drawn sets: 1 point each per set = 5-5.
  const ends1 = Array.from({ length: 5 }, () => [9, 9, 9]);
  const ends2 = Array.from({ length: 5 }, () => [9, 9, 9]);
  const state = evaluateMatch(spec, ends1, ends2);
  assert.equal(state.setPoints1, 5);
  assert.equal(state.setPoints2, 5);
  assert.deepEqual(state.outcome, { decided: false, reason: "SHOOT_OFF_REQUIRED" });
});

test("recurve shoot-off: higher single arrow wins", () => {
  const spec = getMatchSpec("RECURVE_INDIVIDUAL");
  const ends1 = Array.from({ length: 5 }, () => [9, 9, 9]);
  const ends2 = Array.from({ length: 5 }, () => [9, 9, 9]);
  const state = evaluateMatch(spec, ends1, ends2, { arrows1: [10], arrows2: [9] });
  assert.deepEqual(state.outcome, { decided: true, winner: 1, reason: "SHOOT_OFF" });
});

test("recurve shoot-off: equal arrows fall to the judge's closest-to-centre call", () => {
  const spec = getMatchSpec("RECURVE_INDIVIDUAL");
  const ends1 = Array.from({ length: 5 }, () => [9, 9, 9]);
  const ends2 = Array.from({ length: 5 }, () => [9, 9, 9]);

  const undecided = evaluateMatch(spec, ends1, ends2, { arrows1: [10], arrows2: [10] });
  assert.deepEqual(undecided.outcome, { decided: false, reason: "SHOOT_OFF_REQUIRED" });

  const decided = evaluateMatch(spec, ends1, ends2, {
    arrows1: [10],
    arrows2: [10],
    closestToCentre: 2,
  });
  assert.deepEqual(decided.outcome, { decided: true, winner: 2, reason: "SHOOT_OFF" });
});

test("compound individual is cumulative over 15 arrows", () => {
  const spec = getMatchSpec("COMPOUND_INDIVIDUAL");
  const ends1 = Array.from({ length: 5 }, () => [10, 10, 9]);
  const ends2 = Array.from({ length: 5 }, () => [10, 9, 9]);
  const state = evaluateMatch(spec, ends1, ends2);
  assert.equal(state.total1, 145);
  assert.equal(state.total2, 140);
  assert.deepEqual(state.outcome, { decided: true, winner: 1, reason: "POINTS" });
  assert.equal(state.setPoints1, 0);
});

test("compound leading on points mid-match is not yet decided", () => {
  const spec = getMatchSpec("COMPOUND_INDIVIDUAL");
  const ends1 = [[10, 10, 10], [10, 10, 10]];
  const ends2 = [[9, 9, 9], [9, 9, 9]];
  const state = evaluateMatch(spec, ends1, ends2);
  assert.deepEqual(state.outcome, { decided: false, reason: "IN_PROGRESS" });
});

test("compound tie goes to a one-arrow shoot-off", () => {
  const spec = getMatchSpec("COMPOUND_INDIVIDUAL");
  const ends = Array.from({ length: 5 }, () => [10, 9, 9]);
  const tied = evaluateMatch(spec, ends, ends.map((e) => [...e]));
  assert.deepEqual(tied.outcome, { decided: false, reason: "SHOOT_OFF_REQUIRED" });

  const resolved = evaluateMatch(spec, ends, ends.map((e) => [...e]), {
    arrows1: [9],
    arrows2: [10],
  });
  assert.deepEqual(resolved.outcome, { decided: true, winner: 2, reason: "SHOOT_OFF" });
});

test("recurve team: 6 arrows a set, 5 set points, 4 sets maximum", () => {
  const spec = getMatchSpec("RECURVE_TEAM");
  assert.equal(spec.arrowsPerEnd, 6);
  assert.equal(spec.maxEnds, 4);
  assert.equal(spec.pointsToWin, 5);

  const ends1 = [[10, 10, 9, 9, 9, 8], [10, 10, 10, 9, 9, 9], [9, 9, 9, 8, 8, 8]];
  const ends2 = [[9, 9, 9, 8, 8, 8], [10, 9, 9, 9, 8, 8], [8, 8, 8, 7, 7, 7]];
  const state = evaluateMatch(spec, ends1, ends2);
  assert.equal(state.setPoints1, 6);
  assert.deepEqual(state.outcome, { decided: true, winner: 1, reason: "SETS" });
});

test("recurve team 4-4 goes to a three-arrow shoot-off", () => {
  const spec = getMatchSpec("RECURVE_TEAM");
  const drawn = Array.from({ length: 4 }, () => [9, 9, 9, 9, 9, 9]);
  const state = evaluateMatch(spec, drawn, drawn.map((e) => [...e]));
  assert.equal(state.setPoints1, 4);
  assert.equal(state.setPoints2, 4);
  assert.deepEqual(state.outcome, { decided: false, reason: "SHOOT_OFF_REQUIRED" });

  const resolved = evaluateMatch(spec, drawn, drawn.map((e) => [...e]), {
    arrows1: [10, 10, 9],
    arrows2: [10, 9, 9],
  });
  assert.deepEqual(resolved.outcome, { decided: true, winner: 1, reason: "SHOOT_OFF" });
});

test("mixed team formats are four arrows an end", () => {
  assert.equal(getMatchSpec("RECURVE_MIXED_TEAM").arrowsPerEnd, 4);
  assert.equal(getMatchSpec("COMPOUND_MIXED_TEAM").arrowsPerEnd, 4);
  assert.equal(getMatchSpec("COMPOUND_MIXED_TEAM").format, "CUMULATIVE");
});

test("mismatched end counts are a programming error, not a draw", () => {
  const spec = getMatchSpec("RECURVE_INDIVIDUAL");
  assert.throws(() => evaluateMatch(spec, [[10, 9, 9]], []), /same number of ends/);
});

test("seed order puts 1 and 2 in opposite halves", () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const s16 = seedOrder(16);
  assert.equal(s16[0], 1);
  assert.equal(s16.indexOf(2), 8);
  assert.equal(s16.length, 16);
});

test("bracket size rounds up to a power of two and caps at 64", () => {
  assert.equal(bracketSizeFor(5), 8);
  assert.equal(bracketSizeFor(8), 8);
  assert.equal(bracketSizeFor(17), 32);
  assert.equal(bracketSizeFor(100), 64);
});

test("a full field of 8 produces 4 quarterfinals and no byes", () => {
  const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const bracket = generateBracket(names);
  const qf = bracket.filter((m) => m.round === "QF");
  assert.equal(qf.length, 4);
  assert.equal(qf.every((m) => m.winner === null), true);
  // Top seed meets bottom seed.
  assert.equal(qf[0].competitor1, "a");
  assert.equal(qf[0].competitor2, "h");
});

test("a short field gives the top seeds byes that resolve immediately", () => {
  const bracket = generateBracket(["a", "b", "c", "d", "e"]);
  const qf = bracket.filter((m) => m.round === "QF");
  const byes = qf.filter((m) => m.winner !== null);
  assert.equal(byes.length, 3);
  assert.equal(qf[0].competitor1, "a");
  assert.equal(qf[0].competitor2, null);
  assert.equal(qf[0].winner, "a");
});

test("a bracket includes every later round plus bronze", () => {
  const bracket = generateBracket(["a", "b", "c", "d", "e", "f", "g", "h"]);
  const counts = bracket.reduce<Record<string, number>>((acc, m) => {
    acc[m.round] = (acc[m.round] ?? 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, { QF: 4, SF: 2, FINAL: 1, BRONZE: 1 });
});

test("winners advance into the correct half of the next round", () => {
  const bracket = generateBracket(["a", "b", "c", "d", "e", "f", "g", "h"]);
  const qf1 = bracket.find((m) => m.round === "QF" && m.matchNumber === 1)!;
  qf1.winner = "a";
  const patches = advance(qf1, bracket);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].competitor1, "a");

  const qf2 = bracket.find((m) => m.round === "QF" && m.matchNumber === 2)!;
  qf2.winner = "d";
  const patches2 = advance(qf2, bracket);
  assert.equal(patches2[0].matchNumber, patches[0].matchNumber);
  assert.equal(patches2[0].competitor2, "d");
});

test("semifinal losers are placed in the bronze match once both semis finish", () => {
  const bracket = generateBracket(["a", "b", "c", "d"]);
  const semis = bracket.filter((m) => m.round === "SF");
  semis[0].competitor1 = "a";
  semis[0].competitor2 = "d";
  semis[1].competitor1 = "b";
  semis[1].competitor2 = "c";

  semis[0].winner = "a";
  assert.equal(advance(semis[0], bracket).some((p) => p.competitor1 === "a"), true);

  semis[1].winner = "b";
  const patches = advance(semis[1], bracket);
  const bronzePatch = patches.find((p) => p.competitor1 === "d");
  assert.ok(bronzePatch, "bronze match should receive both semifinal losers");
  assert.equal(bronzePatch!.competitor2, "c");
});

test("medals read gold, silver and bronze off the finished bracket", () => {
  const bracket = generateBracket(["a", "b", "c", "d"]);
  const final = bracket.find((m) => m.round === "FINAL")!;
  final.competitor1 = "a";
  final.competitor2 = "b";
  final.winner = "a";
  const bronze = bracket.find((m) => m.round === "BRONZE")!;
  bronze.competitor1 = "d";
  bronze.competitor2 = "c";
  bronze.winner = "c";

  assert.deepEqual(medals(bracket), { gold: "a", silver: "b", bronze: "c" });
});

test("an oversized field is refused rather than silently truncated", () => {
  assert.throws(() => generateBracket(["a", "b", "c", "d", "e"], { size: 4 }), /will not fit/);
});

test("an end of three arrows validates against the indoor spec", () => {
  const r = scoreEnd(["X", 10, 9], END3);
  assert.equal(r.valid, true);
  assert.equal(r.total, 29);
  assert.equal(r.tens, 2);
  assert.equal(r.xs, 1);
});
