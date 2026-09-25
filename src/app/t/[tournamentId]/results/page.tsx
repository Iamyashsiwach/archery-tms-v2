import { Notice } from "@/components/Notice";
import { Bracket, StandingsTable, type MatchView, type StandingView } from "@/components/Standings";
import { ui } from "@/components/ui";
import { guidance, PHASE_LABEL } from "@/content/guidance";
import type { Phase } from "@/lib/phases";
import { OFFICIALS, requireMembership } from "@/server/auth";
import { recalculate, recordShootOff } from "./actions";

type Division = { id: string; phase: Phase; categories: { display_name: string; sort_order: number } };
type Result = {
  archer_id: string;
  division_id: string;
  qualification_rank: number | null;
  qualification_total: number;
  qualification_tens: number;
  qualification_xs: number;
  needs_shoot_off: boolean;
  medal: string | null;
  archers: { full_name: string; club: string | null };
};
type Match = Omit<MatchView, "a1" | "a2" | "a1_id" | "a2_id" | "winner"> & {
  division_id: string;
  archer1_id: string | null;
  archer2_id: string | null;
  winner_archer_id: string | null;
  a1: { full_name: string } | null;
  a2: { full_name: string } | null;
};

export default async function Results({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { tournamentId } = await params;
  const { ok, error } = await searchParams;
  const { supabase, membership } = await requireMembership(tournamentId);
  const official = OFFICIALS.includes(membership.role);
  const g = guidance.results;

  const [{ data: divisions }, { data: results }, { data: matches }] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, phase, categories(display_name, sort_order)")
      .eq("tournament_id", tournamentId)
      .in("phase", ["QUALIFICATION", "CUT", "ELIMINATION", "COMPLETE"])
      .overrideTypes<Division[], { merge: false }>(),
    supabase
      .from("results")
      .select("archer_id, division_id, qualification_rank, qualification_total, qualification_tens, qualification_xs, needs_shoot_off, medal, archers(full_name, club)")
      .eq("tournament_id", tournamentId)
      .order("qualification_rank")
      .overrideTypes<Result[], { merge: false }>(),
    supabase
      .from("matches")
      .select("id, division_id, round, match_number, seed1, seed2, archer1_id, archer2_id, winner_archer_id, set_points_1, set_points_2, total_1, total_2, decided_by, status, a1:archers!matches_archer1_id_fkey(full_name), a2:archers!matches_archer2_id_fkey(full_name)")
      .eq("tournament_id", tournamentId)
      .overrideTypes<Match[], { merge: false }>(),
  ]);

  const rows = (divisions ?? []).sort(
    (a, b) => a.categories.sort_order - b.categories.sort_order || a.categories.display_name.localeCompare(b.categories.display_name)
  );

  return (
    <>
      <Notice ok={ok} error={error} />
      <h2 className={ui.h2}>{g.title}</h2>
      {rows.length === 0 && <p className={ui.help}>{g.none}</p>}

      {rows.map((d) => {
        const standings: StandingView[] = (results ?? [])
          .filter((r) => r.division_id === d.id)
          .map((r) => ({
            archer_id: r.archer_id,
            name: r.archers.full_name,
            club: r.archers.club,
            rank: r.qualification_rank,
            total: r.qualification_total,
            tens: r.qualification_tens,
            xs: r.qualification_xs,
            tie: r.needs_shoot_off,
            medal: r.medal,
          }));
        const bracket: MatchView[] = (matches ?? [])
          .filter((m) => m.division_id === d.id)
          .map((m) => ({ ...m, a1: m.a1?.full_name ?? null, a2: m.a2?.full_name ?? null, a1_id: m.archer1_id, a2_id: m.archer2_id, winner: m.winner_archer_id }));
        const ties = [...new Set(standings.filter((s) => s.tie).map((s) => s.rank))];

        return (
          <section key={d.id} className={ui.card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">{d.categories.display_name}</h3>
              <span className="text-sm text-neutral-600">{PHASE_LABEL[d.phase]}</span>
            </div>

            <StandingsTable rows={standings} />

            {official && d.phase === "CUT" && ties.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold">{g.shootOffTitle}</h4>
                <p className={ui.help}>{g.shootOffHelp}</p>
                {ties.map((rank) => (
                  <form key={rank} action={recordShootOff.bind(null, tournamentId)} className="mt-2 rounded border border-amber-300 p-3">
                    <input type="hidden" name="division_id" value={d.id} />
                    {standings
                      .filter((s) => s.tie && s.rank === rank)
                      .map((s, i) => (
                        <label key={s.archer_id} className="mt-2 flex items-center justify-between gap-3">
                          <span>{s.name}</span>
                          <input
                            name={`position_${s.archer_id}`}
                            type="number"
                            min={1}
                            required
                            inputMode="numeric"
                            defaultValue={i + 1}
                            aria-label={`${g.position} — ${s.name}`}
                            className={`${ui.input} w-24`}
                          />
                        </label>
                      ))}
                    <button className={ui.secondary}>{g.saveShootOff}</button>
                  </form>
                ))}
              </div>
            )}

            {official && (d.phase === "QUALIFICATION" || d.phase === "CUT") && (
              <form action={recalculate.bind(null, tournamentId)}>
                <input type="hidden" name="division_id" value={d.id} />
                <button className={ui.small + " mt-3"}>{g.recalculate}</button>
              </form>
            )}

            {bracket.length > 0 && (
              <>
                <h4 className="mt-4 font-semibold">{g.bracket}</h4>
                <Bracket matches={bracket} />
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
