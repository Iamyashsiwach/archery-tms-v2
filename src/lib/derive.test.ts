import { test } from "node:test";
import assert from "node:assert/strict";

import { allocate, bracketPayload, expectedEnds, matchUpdate, placings, standings, type EndRow, type MatchRow } from "./derive";

const q = (archer_id: string, end_number: number, arrows: EndRow["arrows"]): EndRow => ({
  archer_id,
  stage: "QUALIFICATION",
  end_number,
  arrows,
});

test("expected ends follow the round definition", () => {
  assert.equal(expectedEnds("WA720_70"), 12);
  assert.equal(expectedEnds("WA1440_M"), 24);
  assert.equal(expectedEnds("WA18"), 20);
});

test("standings rank from the arrows, including archers with no ends yet", () => {
  const rows = standings(["a", "b", "c"], [q("a", 1, ["X", 9, 8]), q("b", 1, [10, 10, 9]), q("b", 2, ["M", "M", "M"])]);
  assert.deepEqual(rows.map((r) => [r.archer_id, r.total, r.rank]), [["b", 29, 1], ["a", 27, 2], ["c", 0, 3]]);
  assert.equal(rows[0].tens, 2);
});

test("a tie stays flagged until every archer in it has a shoot-off position", () => {
  const ends = [q("a", 1, [10, 9, 9]), q("b", 1, [10, 9, 9]), q("c", 1, [5, 5, 5])];
  const open = standings(["a", "b", "c"], ends, new Map([["b", 1]]));
  assert.deepEqual(open.map((r) => r.needs_shoot_off), [true, true, false]);

  const resolved = standings(["a", "b", "c"], ends, new Map([["b", 1], ["a", 2]]));
  assert.deepEqual(resolved.map((r) => [r.archer_id, r.rank, r.needs_shoot_off]), [
    ["b", 1, false],
    ["a", 2, false],
    ["c", 3, false],
  ]);
});

test("bracket for five archers: byes resolved and their winners already in the semis", () => {
  const ranked = ["s1", "s2", "s3", "s4", "s5"].map((id, i) => ({
    archer_id: id, total: 0, tens: 0, xs: 0, rank: i + 1, needs_shoot_off: false,
  }));
  const b = bracketPayload(ranked, null);
  assert.equal(b.bracket_size, 8);
  assert.deepEqual(b.seeds[0], { archer_id: "s1", seed: 1 });

  const qf = b.matches.filter((m) => m.round === "QF");
  assert.equal(qf.filter((m) => m.status === "COMPLETE" && m.decided_by === "BYE").length, 3);
  const sf = b.matches.filter((m) => m.round === "SF");
  assert.equal(sf[0].archer1_id, "s1", "top seed walks into the first semifinal");
  assert.equal(b.matches.filter((m) => m.round === "BRONZE").length, 1);
});

test("a requested bracket larger than the field is capped", () => {
  const ranked = ["a", "b", "c", "d"].map((id, i) => ({ archer_id: id, total: 0, tens: 0, xs: 0, rank: i + 1, needs_shoot_off: false }));
  assert.equal(bracketPayload(ranked, 16).bracket_size, 4);
  assert.equal(bracketPayload(ranked, 2).bracket_size, 2);
});

function match(id: string, round: MatchRow["round"], n: number, a1: string | null, a2: string | null): MatchRow {
  return { id, round, match_number: n, seed1: null, seed2: null, archer1_id: a1, archer2_id: a2, winner_archer_id: null, status: "PENDING", closest_to_centre: null };
}

const e = (archer_id: string, stage: EndRow["stage"], end_number: number, arrows: EndRow["arrows"]): EndRow => ({ archer_id, stage, end_number, arrows });

test("a recurve set-system win completes the match and moves the winner on", () => {
  const sf1 = match("m1", "SF", 1, "a", "d");
  const sf2 = match("m2", "SF", 2, "b", "c");
  const fin = match("m3", "FINAL", 3, null, null);
  const bronze = match("m4", "BRONZE", 4, null, null);
  const ends = [1, 2, 3].flatMap((n) => [e("a", "ELIMINATION", n, [10, 10, 10]), e("d", "ELIMINATION", n, [9, 9, 9])]);

  const u = matchUpdate("RECURVE_INDIVIDUAL", sf1, [sf1, sf2, fin, bronze], ends);
  assert.equal(u.state.status, "COMPLETE");
  assert.equal(u.state.winner_archer_id, "a");
  assert.equal(u.state.set_points_1, 6);
  assert.equal(u.state.decided_by, "SETS");
  assert.deepEqual(u.patches, [{ match_number: 3, archer1_id: "a" }]);
});

test("an end entered for only one side does not count yet", () => {
  const m = match("m1", "FINAL", 1, "a", "b");
  const u = matchUpdate("COMPOUND_INDIVIDUAL", m, [m], [e("a", "ELIMINATION", 1, [10, 10, 10])]);
  assert.equal(u.state.status, "PENDING");
  assert.equal(u.state.total_1, 0);
});

test("a level match waits for the shoot-off, then the judge's closest-to-centre call", () => {
  const m = match("m1", "FINAL", 1, "a", "b");
  const level = [1, 2, 3, 4, 5].flatMap((n) => [e("a", "ELIMINATION", n, [9, 9, 9]), e("b", "ELIMINATION", n, [9, 9, 9])]);
  assert.equal(matchUpdate("RECURVE_INDIVIDUAL", m, [m], level).state.status, "SHOOT_OFF");

  const shootOff = [...level, e("a", "SHOOT_OFF", 1, [10]), e("b", "SHOOT_OFF", 1, [10])];
  assert.equal(matchUpdate("RECURVE_INDIVIDUAL", m, [m], shootOff).state.status, "SHOOT_OFF");

  const called = matchUpdate("RECURVE_INDIVIDUAL", { ...m, closest_to_centre: 2 }, [m], shootOff);
  assert.equal(called.state.winner_archer_id, "b");
  assert.equal(called.state.decided_by, "SHOOT_OFF");
});

test("placings read the medals and put the bronze loser fourth", () => {
  const fin = { ...match("f", "FINAL", 3, "a", "b"), winner_archer_id: "a", status: "COMPLETE" as const };
  const bronze = { ...match("br", "BRONZE", 4, "c", "d"), winner_archer_id: "d", status: "COMPLETE" as const };
  assert.deepEqual(placings([fin, bronze]), [
    { archer_id: "a", final_rank: 1, medal: "GOLD" },
    { archer_id: "b", final_rank: 2, medal: "SILVER" },
    { archer_id: "d", final_rank: 3, medal: "BRONZE" },
    { archer_id: "c", final_rank: 4, medal: null },
  ]);
});

test("allocation fills four to a target from the first free one", () => {
  assert.deepEqual(allocate(["a", "b", "c", "d", "e"], 5), [
    { archer_id: "a", bale_number: 5, slot_index: 1 },
    { archer_id: "b", bale_number: 5, slot_index: 2 },
    { archer_id: "c", bale_number: 5, slot_index: 3 },
    { archer_id: "d", bale_number: 5, slot_index: 4 },
    { archer_id: "e", bale_number: 6, slot_index: 1 },
  ]);
});
