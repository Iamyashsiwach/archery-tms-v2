import { notFound } from "next/navigation";
import { z } from "zod";
import { Bracket, StandingsTable, type MatchView, type StandingView } from "@/components/Standings";
import { ui } from "@/components/ui";
import { guidance, PHASE_LABEL } from "@/content/guidance";
import type { Phase } from "@/lib/phases";
import type { RoundCode } from "@/lib/rules/brackets";
import { createAnonClient } from "@/server/supabase";

// Served from the CDN and rebuilt at most every 30 s, or at once when ends are
// synced (revalidatePath in src/server/derived.ts). A scoreboard refreshing
// every few seconds costs nothing. Reads only the published public_* views.
export const revalidate = 30;

// No page is built ahead of time; each is rendered on first visit, then cached.
export async function generateStaticParams() {
  return [];
}

const SLOT = "ABCDEF";

export default async function Display({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  if (!z.uuid().safeParse(tournamentId).success) notFound();
  const db = createAnonClient();
  const g = guidance.display;

  const [{ data: t }, { data: divisions }, { data: archers }, { data: results }, { data: matches }] = await Promise.all([
    db.from("public_tournaments").select("name, venue, start_date, end_date").eq("id", tournamentId).maybeSingle(),
    db.from("public_divisions").select("id, display_name, phase, sort_order").eq("tournament_id", tournamentId),
    db.from("public_archers").select("id, division_id, full_name, club, bale_number, slot_index").eq("tournament_id", tournamentId),
    db
      .from("public_results")
      .select("archer_id, division_id, qualification_rank, qualification_total, qualification_tens, qualification_xs, needs_shoot_off, medal")
      .eq("tournament_id", tournamentId)
      .order("qualification_rank"),
    db
      .from("public_matches")
      .select("id, division_id, round, match_number, seed1, seed2, archer1_id, archer2_id, winner_archer_id, set_points_1, set_points_2, total_1, total_2, decided_by, status")
      .eq("tournament_id", tournamentId),
  ]);
  if (!t) notFound();

  const archer = new Map((archers ?? []).map((a) => [a.id!, a]));
  const shown = (divisions ?? [])
    .filter((d) => d.phase !== "SETUP" && d.phase !== "REGISTRATION")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.display_name ?? "").localeCompare(b.display_name ?? ""));

  return (
    <main className={ui.page}>
      <h1 className={ui.h1}>{t.name}</h1>
      <p className="text-sm text-neutral-600">
        {t.start_date}
        {t.end_date && t.end_date !== t.start_date && ` – ${t.end_date}`}
        {t.venue && ` · ${t.venue}`} · {g.updated}
      </p>

      {shown.map((d) => {
        const phase = d.phase as Phase;
        const standings: StandingView[] = (results ?? [])
          .filter((r) => r.division_id === d.id)
          .map((r) => ({
            archer_id: r.archer_id!,
            name: archer.get(r.archer_id!)?.full_name ?? "",
            club: archer.get(r.archer_id!)?.club ?? null,
            rank: r.qualification_rank,
            total: r.qualification_total ?? 0,
            tens: r.qualification_tens ?? 0,
            xs: r.qualification_xs ?? 0,
            tie: r.needs_shoot_off ?? false,
            medal: r.medal,
          }));
        const bracket: MatchView[] = (matches ?? [])
          .filter((m) => m.division_id === d.id)
          .map((m) => ({
            id: m.id!,
            round: m.round as RoundCode,
            match_number: m.match_number ?? 0,
            seed1: m.seed1,
            seed2: m.seed2,
            a1: m.archer1_id ? (archer.get(m.archer1_id)?.full_name ?? null) : null,
            a2: m.archer2_id ? (archer.get(m.archer2_id)?.full_name ?? null) : null,
            a1_id: m.archer1_id,
            a2_id: m.archer2_id,
            winner: m.winner_archer_id,
            set_points_1: m.set_points_1 ?? 0,
            set_points_2: m.set_points_2 ?? 0,
            total_1: m.total_1 ?? 0,
            total_2: m.total_2 ?? 0,
            decided_by: m.decided_by,
            status: m.status ?? "PENDING",
          }));
        const targets = (archers ?? [])
          .filter((a) => a.division_id === d.id && a.bale_number)
          .sort((a, b) => a.bale_number! - b.bale_number! || (a.slot_index ?? 0) - (b.slot_index ?? 0));

        return (
          <section key={d.id} className={ui.card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{d.display_name}</h2>
              <span className="text-sm text-neutral-600">{PHASE_LABEL[phase]}</span>
            </div>

            {(phase === "ALLOCATION" || phase === "QUALIFICATION") && targets.length > 0 && (
              <ul className="mt-2 grid gap-x-4 text-sm sm:grid-cols-2">
                {targets.map((a) => (
                  <li key={a.id} className="border-b border-neutral-100 py-1">
                    <span className="font-semibold tabular-nums">
                      {a.bale_number}
                      {SLOT[(a.slot_index ?? 1) - 1]}
                    </span>{" "}
                    {a.full_name}
                    {a.club && <span className="text-neutral-600"> · {a.club}</span>}
                  </li>
                ))}
              </ul>
            )}

            {phase !== "ALLOCATION" && (
              <>
                <h3 className="mt-3 font-semibold">{g.qualification}</h3>
                <StandingsTable rows={standings} />
              </>
            )}

            {bracket.length > 0 && (
              <>
                <h3 className="mt-4 font-semibold">{g.bracket}</h3>
                <Bracket matches={bracket} />
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}
