import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAge, normalizeGender, parseCsv, ROW_ERRORS, stageTable } from "./roster-import";

const DIVISIONS = [
  { id: "rm-sen", bow_style: "RECURVE", gender: "M", age_class: "SENIOR" },
  { id: "rw-sen", bow_style: "RECURVE", gender: "W", age_class: "SENIOR" },
  { id: "cm-jun", bow_style: "COMPOUND", gender: "M", age_class: "JUNIOR" },
];

test("CSV handles quotes, doubled quotes, embedded commas and line breaks, CRLF and a BOM", () => {
  const rows = parseCsv('﻿Name,Club\r\n"Das, Deepika","Tata ""Archery"" Academy"\r\n"Two\nLines",X\r\n\r\n');
  assert.deepEqual(rows, [
    ["Name", "Club"],
    ["Das, Deepika", 'Tata "Archery" Academy'],
    ["Two\nLines", "X"],
  ]);
});

test("gender words: women is not read as men", () => {
  assert.equal(normalizeGender("Women"), "W");
  assert.equal(normalizeGender("Recurve Men Senior"), "M");
  assert.equal(normalizeGender("F"), "W");
  assert.equal(normalizeGender("unknown"), null);
});

test("sub-junior is not read as junior", () => {
  assert.equal(normalizeAge("Sub Junior"), "SUB_JUNIOR");
  assert.equal(normalizeAge("sub-junior"), "SUB_JUNIOR");
  assert.equal(normalizeAge("Junior"), "JUNIOR");
});

test("a table below a title row, with separate columns, maps to divisions", () => {
  const rows = stageTable(
    [
      ["State Championship entry form"],
      ["S.No", "Archer Name", "Club", "State", "Bow Type", "Gender", "Age Category"],
      ["1", "Atanu Das", "PSPB", "WB", "Recurve", "Male", "Senior"],
      ["2", "Jyothi Surekha", "AP Academy", "AP", "Compound", "Female", "Senior"],
      ["3", "", "Nobody", "", "Recurve", "M", "Senior"],
    ],
    DIVISIONS
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].parsed, {
    full_name: "Atanu Das", club: "PSPB", state: "WB", bow_style: "RECURVE", gender: "M", age_class: "SENIOR", division_id: "rm-sen",
  });
  assert.deepEqual(rows[0].errors, []);
  assert.equal(rows[1].parsed.division_id, null, "no compound women senior division is open");
  assert.deepEqual(rows[1].errors, [ROW_ERRORS.noDivision]);
  assert.deepEqual(rows[2].errors, [ROW_ERRORS.noName]);
});

test("first and last name columns combine; one category column carries all three", () => {
  const rows = stageTable(
    [
      ["First Name", "Surname", "Category"],
      ["Deepika", "Kumari", "Recurve Women Senior"],
      ["Aditya", "Chaudhary", "Compound Men Junior"],
    ],
    DIVISIONS
  );
  assert.equal(rows[0].parsed.full_name, "Deepika Kumari");
  assert.equal(rows[0].parsed.division_id, "rw-sen");
  assert.equal(rows[1].parsed.division_id, "cm-jun");
});

test("a table with no name column yields nothing", () => {
  assert.deepEqual(stageTable([["a", "b"], ["1", "2"]], DIVISIONS), []);
});
