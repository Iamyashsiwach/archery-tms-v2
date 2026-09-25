/**
 * Turning an uploaded roster (CSV, a spreadsheet, or rows Claude read from a
 * PDF) into staged rows for a coach to review. Pure: nothing here writes.
 */

export interface Candidate {
  full_name: string;
  club: string;
  state: string;
  bow_style: string | null;
  gender: string | null;
  age_class: string | null;
}

export interface OpenDivision {
  id: string;
  bow_style: string;
  gender: string;
  age_class: string;
}

export interface StagedRow {
  raw: unknown;
  parsed: Candidate & { division_id: string | null };
  errors: string[];
}

export const ROW_ERRORS = {
  noName: "No name",
  noDivision: "Choose a division",
};

/** RFC 4180: quoted fields, "" inside quotes, commas and line breaks inside quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export function normalizeBow(value: string): string | null {
  const s = value.toLowerCase();
  if (/\brecurve\b|\bolympic\b/.test(s)) return "RECURVE";
  if (/\bcompound\b/.test(s)) return "COMPOUND";
  if (/\bbare ?bow\b/.test(s)) return "BAREBOW";
  if (/\bindian\b/.test(s)) return "INDIAN";
  return null;
}

export function normalizeGender(value: string): string | null {
  const s = value.toLowerCase().trim();
  // "women" contains "men", so women is checked first and on word boundaries.
  if (/^(f|w)$/.test(s) || /\b(women|woman|female|girls?|ladies|lady)\b/.test(s)) return "W";
  if (/^m$/.test(s) || /\b(men|man|male|boys?|gents?)\b/.test(s)) return "M";
  return null;
}

export function normalizeAge(value: string): string | null {
  const s = value.toLowerCase();
  // Label-based only: which ages map to which class is an open question for Yash.
  if (/\bsub[\s-]?junior\b|\bmini\b/.test(s)) return "SUB_JUNIOR";
  if (/\bcadet\b/.test(s)) return "CADET";
  if (/\bjunior\b/.test(s)) return "JUNIOR";
  if (/\bmaster\b|\bveteran\b/.test(s)) return "MASTER";
  if (/\bsenior\b|\bopen\b/.test(s)) return "SENIOR";
  return null;
}

const HEADERS: Record<keyof Candidate | "first" | "last", string[]> = {
  full_name: ["name", "full name", "archer", "archer name", "athlete", "athlete name", "participant", "competitor", "player name"],
  first: ["first name", "given name", "first"],
  last: ["last name", "surname", "family name", "last"],
  club: ["club", "club name", "academy", "team", "institution", "school", "association"],
  state: ["state", "state ut", "state/ut", "region"],
  bow_style: ["bow", "bow style", "bow type", "discipline"],
  gender: ["gender", "sex", "m/f"],
  age_class: ["age class", "age category", "age group", "category", "age", "event", "division"],
};

const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();

function findColumns(header: string[]) {
  const keys = header.map(headerKey);
  const col = (names: string[]) => keys.findIndex((k) => names.includes(k));
  return Object.fromEntries(Object.entries(HEADERS).map(([field, names]) => [field, col(names)])) as Record<
    keyof typeof HEADERS,
    number
  >;
}

export function matchDivision(c: Pick<Candidate, "bow_style" | "gender" | "age_class">, divisions: OpenDivision[]) {
  const hit = divisions.filter((d) => d.bow_style === c.bow_style && d.gender === c.gender && d.age_class === c.age_class);
  return hit.length === 1 ? hit[0].id : null;
}

/** Fills in bow style, gender and age class from wherever they appear, then picks a division. */
export function stage(raw: unknown, c: Candidate, divisions: OpenDivision[]): StagedRow {
  const everything = [c.bow_style, c.gender, c.age_class].filter(Boolean).join(" ");
  const bow_style = normalizeBow(c.bow_style ?? "") ?? normalizeBow(everything);
  const gender = normalizeGender(c.gender ?? "") ?? normalizeGender(everything);
  const age_class = normalizeAge(c.age_class ?? "") ?? normalizeAge(everything);
  const parsed = {
    full_name: c.full_name.trim(),
    club: c.club.trim(),
    state: c.state.trim(),
    bow_style,
    gender,
    age_class,
    division_id: matchDivision({ bow_style, gender, age_class }, divisions),
  };
  const errors = [];
  if (!parsed.full_name) errors.push(ROW_ERRORS.noName);
  if (!parsed.division_id) errors.push(ROW_ERRORS.noDivision);
  return { raw, parsed, errors };
}

/**
 * Rows from a table whose header is somewhere in the first ten rows (entry
 * forms often have a title above the table). Returns [] when there is no
 * recognisable name column.
 */
export function stageTable(table: string[][], divisions: OpenDivision[]): StagedRow[] {
  const headerIndex = table.slice(0, 10).findIndex((row) => {
    const cols = findColumns(row);
    return cols.full_name >= 0 || (cols.first >= 0 && cols.last >= 0);
  });
  if (headerIndex < 0) return [];

  const cols = findColumns(table[headerIndex]);
  const cell = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");

  return table.slice(headerIndex + 1).map((row) => {
    const name = cols.full_name >= 0 ? cell(row, cols.full_name) : `${cell(row, cols.first)} ${cell(row, cols.last)}`;
    return stage(
      row,
      {
        full_name: name.replace(/\s+/g, " "),
        club: cell(row, cols.club),
        state: cell(row, cols.state),
        bow_style: cell(row, cols.bow_style) || null,
        gender: cell(row, cols.gender) || null,
        age_class: cell(row, cols.age_class) || null,
      },
      divisions
    );
  });
}
