import { after } from "next/server";
import { z } from "zod";
import type { SyncResult } from "@/app/t/[tournamentId]/score/types";
import { guidance } from "@/content/guidance";
import { getMatchSpec, getRound } from "@/lib/rules/catalogue";
import { scoreEnd } from "@/lib/rules/scoring";
import { recalculateMatch, recalculateStandings } from "@/server/derived";
import { createClient } from "@/server/supabase";

// A route, not a server action: a scoring page cached before a deploy still
// knows this URL, whereas a server action id would have changed under it.

const Arrow = z.union([z.literal("X"), z.literal("M"), z.number().int().min(0).max(10)]);
const End = z.object({
  id: z.uuid(),
  tournament_id: z.uuid(),
  division_id: z.uuid(),
  archer_id: z.uuid(),
  stage: z.enum(["QUALIFICATION", "ELIMINATION", "SHOOT_OFF"]),
  match_id: z.uuid().nullable(),
  distance_index: z.number().int().min(0).max(9),
  end_number: z.number().int().min(1).max(99),
  arrows: z.array(Arrow).min(1).max(12),
});
const Body = z.array(End).min(1).max(200);

type Division = { id: string; categories: { round_code: string; match_format_code: string } };

/** The shape an end must have, from the round or the match format. */
function endShape(end: z.infer<typeof End>, division: Division) {
  try {
    if (end.stage === "QUALIFICATION") {
      const d = getRound(division.categories.round_code).distances[end.distance_index];
      return d ? { arrowsPerEnd: d.arrowsPerEnd, ends: d.arrows / d.arrowsPerEnd } : null;
    }
    const spec = getMatchSpec(division.categories.match_format_code);
    return end.stage === "ELIMINATION"
      ? { arrowsPerEnd: spec.arrowsPerEnd, ends: spec.maxEnds }
      : { arrowsPerEnd: spec.shootOffArrows, ends: 1 };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "cross_origin" }, { status: 403 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth) return Response.json({ error: "signed_out" }, { status: 401 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid" }, { status: 400 });
  const ends = body.data;

  const [{ data: memberships }, { data: divisions }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, tournament_id")
      .eq("user_id", auth.claims.sub)
      .eq("status", "ACTIVE")
      .eq("role", "JUDGE")
      .in("tournament_id", [...new Set(ends.map((e) => e.tournament_id))]),
    supabase
      .from("divisions")
      .select("id, categories(round_code, match_format_code)")
      .in("id", [...new Set(ends.map((e) => e.division_id))])
      .overrideTypes<Division[], { merge: false }>(),
  ]);
  const judgeIn = new Map((memberships ?? []).map((m) => [m.tournament_id, m.id]));
  const divisionById = new Map((divisions ?? []).map((d) => [d.id, d]));

  const r = guidance.score.refusals;
  const results: SyncResult[] = [];
  const touchedDivisions = new Set<string>();
  const touchedMatches = new Set<string>();

  for (const end of ends) {
    const membershipId = judgeIn.get(end.tournament_id);
    const division = divisionById.get(end.division_id);
    if (!membershipId || !division) {
      results.push({ id: end.id, result: "refused", message: r.notAllowed });
      continue;
    }

    const shape = endShape(end, division);
    if (!shape || end.end_number > shape.ends) {
      results.push({ id: end.id, result: "refused", message: r.noSuchEnd });
      continue;
    }
    const scored = scoreEnd(end.arrows, { arrowsPerEnd: shape.arrowsPerEnd, maxRingValue: 10 });
    if (!scored.valid) {
      results.push({ id: end.id, result: "refused", message: r.invalid(scored.errors.join(" ")) });
      continue;
    }

    // RLS decides the rest: the judge's target, the division's phase, the match.
    const { error } = await supabase.from("ends").insert({
      id: end.id,
      tournament_id: end.tournament_id,
      division_id: end.division_id,
      archer_id: end.archer_id,
      stage: end.stage,
      match_id: end.match_id,
      distance_index: end.distance_index,
      end_number: end.end_number,
      arrows: end.arrows,
      total: 0, // derived from the arrows by the ends_derive_totals trigger
      entered_by: membershipId,
    });

    if (!error || (error.code === "23505" && error.message.includes("ends_pkey"))) {
      // Saved now, or saved by an earlier attempt whose response never arrived.
      results.push({ id: end.id, result: "saved" });
      if (end.match_id) touchedMatches.add(end.match_id);
      else touchedDivisions.add(end.division_id);
    } else if (error.code === "23505") {
      results.push({ id: end.id, result: "refused", message: r.duplicate });
    } else if (error.code === "42501") {
      results.push({ id: end.id, result: "refused", message: r.notAllowed });
    } else if (error.code === "23514") {
      results.push({ id: end.id, result: "refused", message: r.invalid(error.message) });
    } else {
      console.error("end not saved, will retry:", error.code, error.message);
      // Left out of the results: the device keeps it queued and tries again.
    }
  }

  after(async () => {
    for (const divisionId of touchedDivisions) {
      await recalculateStandings(divisionId).catch((e) => console.error("standings:", e));
    }
    for (const matchId of touchedMatches) {
      await recalculateMatch(matchId).catch((e) => console.error("match:", e));
    }
  });

  return Response.json(results);
}
