import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { guidance } from "@/content/guidance";
import { ROUND_LABEL, type RoundCode } from "@/lib/rules/brackets";
import { OFFICIALS, requireMembership } from "@/server/auth";
import { autoAllocate, setMatchTarget, setTarget } from "./actions";

type Division = {
  id: string;
  phase: string;
  categories: { display_name: string };
  archers: { id: string; full_name: string; club: string | null; bale_number: number | null; slot_index: number | null; deleted_at: string | null }[];
};
type Match = {
  id: string;
  division_id: string;
  round: RoundCode;
  match_number: number;
  bale_number: number | null;
  status: string;
  a1: { full_name: string } | null;
  a2: { full_name: string } | null;
};

const ROUND_ORDER: RoundCode[] = ["R64", "R32", "R16", "QF", "SF", "BRONZE", "FINAL"];

export default async function Allocation({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { tournamentId } = await params;
  const { ok, error } = await searchParams;
  const { supabase } = await requireMembership(tournamentId, OFFICIALS);
  const g = guidance.allocation;

  const [{ data: divisions }, { data: judged }, { data: matches }] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, phase, categories(display_name), archers(id, full_name, club, bale_number, slot_index, deleted_at)")
      .eq("tournament_id", tournamentId)
      .in("phase", ["ALLOCATION", "ELIMINATION"])
      .overrideTypes<Division[], { merge: false }>(),
    supabase.from("judge_assignments").select("bale_number").eq("tournament_id", tournamentId),
    supabase
      .from("matches")
      .select("id, division_id, round, match_number, bale_number, status, a1:archers!matches_archer1_id_fkey(full_name), a2:archers!matches_archer2_id_fkey(full_name)")
      .eq("tournament_id", tournamentId)
      .neq("status", "COMPLETE")
      .order("match_number")
      .overrideTypes<Match[], { merge: false }>(),
  ]);

  const allocating = (divisions ?? []).filter((d) => d.phase === "ALLOCATION");
  const eliminating = (divisions ?? []).filter((d) => d.phase === "ELIMINATION");
  const judgedBales = new Set((judged ?? []).map((j) => j.bale_number));

  return (
    <>
      <Notice ok={ok} error={error} />
      <h2 className={ui.h2}>{g.title}</h2>
      <p className={ui.help}>{g.help}</p>
      {allocating.length === 0 && <p className={ui.help}>{g.none}</p>}

      {allocating.map((d) => {
        const archers = d.archers
          .filter((a) => !a.deleted_at)
          .sort((a, b) => (a.bale_number ?? 1e9) - (b.bale_number ?? 1e9) || (a.slot_index ?? 0) - (b.slot_index ?? 0) || a.full_name.localeCompare(b.full_name));
        const unjudged = [...new Set(archers.map((a) => a.bale_number).filter((b): b is number => b !== null && !judgedBales.has(b)))];
        return (
          <section key={d.id} className={ui.card}>
            <h3 className="font-semibold">{d.categories.display_name}</h3>
            {unjudged.length > 0 && <p className="mt-2 text-sm text-amber-800">{g.unjudged(unjudged.sort((a, b) => a - b))}</p>}
            {archers.some((a) => a.bale_number === null) && (
              <form action={autoAllocate.bind(null, tournamentId)}>
                <input type="hidden" name="division_id" value={d.id} />
                <button className={ui.secondary}>{g.auto}</button>
              </form>
            )}
            <ul className="mt-3">
              {archers.map((a) => (
                <li key={a.id} className="border-b border-neutral-200 py-2">
                  <form action={setTarget.bind(null, tournamentId)} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="archer_id" value={a.id} />
                    <span className="min-w-40 flex-1">
                      {a.full_name}
                      {a.club && <span className="block text-sm text-neutral-600">{a.club}</span>}
                    </span>
                    <label className="w-24 text-sm">
                      {g.bale}
                      <input name="bale_number" type="number" min={1} required inputMode="numeric" defaultValue={a.bale_number ?? ""} className={ui.input} />
                    </label>
                    <label className="w-24 text-sm">
                      {g.slot}
                      <input name="slot_index" type="number" min={1} max={6} required inputMode="numeric" defaultValue={a.slot_index ?? ""} className={ui.input} />
                    </label>
                    <button className={ui.small}>{g.save}</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {eliminating.length > 0 && (
        <>
          <h2 className={ui.h2}>{g.matchesTitle}</h2>
          <p className={ui.help}>{g.matchesHelp}</p>
          {eliminating.map((d) => (
            <section key={d.id} className={ui.card}>
              <h3 className="font-semibold">{d.categories.display_name}</h3>
              <ul className="mt-2">
                {(matches ?? [])
                  .filter((m) => m.division_id === d.id)
                  .sort((a, b) => ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round) || a.match_number - b.match_number)
                  .map((m) => (
                    <li key={m.id} className="border-b border-neutral-200 py-2">
                      <form action={setMatchTarget.bind(null, tournamentId)} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="match_id" value={m.id} />
                        <span className="min-w-40 flex-1">
                          <span className="block text-sm text-neutral-600">{ROUND_LABEL[m.round]}</span>
                          {m.a1?.full_name ?? g.tbd} — {m.a2?.full_name ?? g.tbd}
                        </span>
                        <label className="w-24 text-sm">
                          {g.bale}
                          <input name="bale_number" type="number" min={1} inputMode="numeric" defaultValue={m.bale_number ?? ""} className={ui.input} />
                        </label>
                        <button className={ui.small}>{g.save}</button>
                      </form>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
