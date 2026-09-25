import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { guidance } from "@/content/guidance";
import { ROUND_LABEL, type RoundCode } from "@/lib/rules/brackets";
import { getRound } from "@/lib/rules/catalogue";
import { requireMembership } from "@/server/auth";
import { Scorer } from "./scorer";
import type { RecordedEnd, ScoreArcher, ScoreData, ScoreMatch } from "./types";

type Division = { id: string; phase: string; categories: { display_name: string; round_code: string; match_format_code: string } };
type Match = {
  id: string;
  division_id: string;
  round: RoundCode;
  bale_number: number | null;
  closest_to_centre: 1 | 2 | null;
  archer1_id: string | null;
  archer2_id: string | null;
  a1: { full_name: string; bale_number: number | null } | null;
  a2: { full_name: string } | null;
};

export default async function Score({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { tournamentId } = await params;
  const { ok, error } = await searchParams;
  const { supabase, membership } = await requireMembership(tournamentId, ["JUDGE"]);
  const g = guidance.score;

  const { data: assigned } = await supabase
    .from("judge_assignments")
    .select("bale_number")
    .eq("tournament_id", tournamentId)
    .eq("membership_id", membership.id);
  const bales = [...new Set((assigned ?? []).map((a) => a.bale_number))];

  if (bales.length === 0) {
    return (
      <>
        <h2 className={ui.h2}>{g.title}</h2>
        <p className={ui.help}>{g.noTargets}</p>
      </>
    );
  }

  const [{ data: divisions }, { data: archers }, { data: matches }] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, phase, categories(display_name, round_code, match_format_code)")
      .eq("tournament_id", tournamentId)
      .in("phase", ["QUALIFICATION", "ELIMINATION"])
      .overrideTypes<Division[], { merge: false }>(),
    supabase
      .from("archers")
      .select("id, full_name, club, bale_number, slot_index, division_id")
      .eq("tournament_id", tournamentId)
      .in("bale_number", bales)
      .is("deleted_at", null),
    supabase
      .from("matches")
      .select("id, division_id, round, bale_number, closest_to_centre, archer1_id, archer2_id, a1:archers!matches_archer1_id_fkey(full_name, bale_number), a2:archers!matches_archer2_id_fkey(full_name)")
      .eq("tournament_id", tournamentId)
      .neq("status", "COMPLETE")
      .not("archer1_id", "is", null)
      .not("archer2_id", "is", null)
      .overrideTypes<Match[], { merge: false }>(),
  ]);

  const byId = new Map((divisions ?? []).map((d) => [d.id, d]));
  const scoreArchers: ScoreArcher[] = (archers ?? []).flatMap((a) => {
    const d = a.division_id ? byId.get(a.division_id) : undefined;
    if (!d || d.phase !== "QUALIFICATION" || a.bale_number === null) return [];
    return [
      {
        id: a.id,
        name: a.full_name,
        club: a.club,
        bale: a.bale_number,
        slot: a.slot_index ?? 0,
        divisionId: d.id,
        divisionName: d.categories.display_name,
        distances: getRound(d.categories.round_code).distances.map((x) => ({
          distance: x.distance,
          arrowsPerEnd: x.arrowsPerEnd,
          ends: x.arrows / x.arrowsPerEnd,
        })),
      },
    ];
  });

  const scoreMatches: ScoreMatch[] = (matches ?? []).flatMap((m) => {
    const d = byId.get(m.division_id);
    const bale = m.bale_number ?? m.a1?.bale_number ?? null;
    if (!d || d.phase !== "ELIMINATION" || bale === null || !bales.includes(bale) || !m.a1 || !m.a2) return [];
    return [
      {
        id: m.id,
        divisionId: d.id,
        divisionName: d.categories.display_name,
        roundLabel: ROUND_LABEL[m.round],
        bale,
        formatCode: d.categories.match_format_code,
        closestToCentre: m.closest_to_centre,
        sides: [
          { archerId: m.archer1_id!, name: m.a1.full_name },
          { archerId: m.archer2_id!, name: m.a2.full_name },
        ],
      },
    ];
  });

  const [{ data: qualification }, { data: elimination }] = await Promise.all([
    scoreArchers.length
      ? supabase
          .from("ends")
          .select("archer_id, stage, match_id, distance_index, end_number, arrows")
          .eq("stage", "QUALIFICATION")
          .in("archer_id", scoreArchers.map((a) => a.id))
      : Promise.resolve({ data: [] }),
    scoreMatches.length
      ? supabase
          .from("ends")
          .select("archer_id, stage, match_id, distance_index, end_number, arrows")
          .in("match_id", scoreMatches.map((m) => m.id))
      : Promise.resolve({ data: [] }),
  ]);

  const data: ScoreData = {
    tournamentId,
    archers: scoreArchers,
    matches: scoreMatches,
    recorded: [...(qualification ?? []), ...(elimination ?? [])] as RecordedEnd[],
  };

  return (
    <>
      <h2 className={ui.h2}>{g.title}</h2>
      <p className={ui.help}>{g.help}</p>
      <Notice ok={ok} error={error} />
      {scoreArchers.length === 0 && scoreMatches.length === 0 ? (
        <p className="mt-4">{g.nothingToScore}</p>
      ) : (
        <Scorer data={data} />
      )}
    </>
  );
}
