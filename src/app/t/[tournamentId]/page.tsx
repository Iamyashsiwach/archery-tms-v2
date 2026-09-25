import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { guidance, PHASE_HELP, PHASE_LABEL } from "@/content/guidance";
import { nextPhase, previousPhase, type Phase } from "@/lib/phases";
import { OFFICIALS, requireMembership } from "@/server/auth";
import { advancePhase, reopenPhase } from "./actions";

type Division = { id: string; phase: Phase; categories: { display_name: string; sort_order: number } };

export default async function Overview({
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
  const helpRole = official ? "OFFICIAL" : (membership.role as "JUDGE" | "COACH");
  const g = guidance.dashboard;

  const [{ data: divisions }, { data: archers }] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, phase, categories(display_name, sort_order)")
      .eq("tournament_id", tournamentId)
      .overrideTypes<Division[], { merge: false }>(),
    supabase.from("archers").select("division_id").eq("tournament_id", tournamentId).is("deleted_at", null),
  ]);

  const count = new Map<string, number>();
  for (const a of archers ?? []) count.set(a.division_id!, (count.get(a.division_id!) ?? 0) + 1);
  const rows = (divisions ?? []).sort(
    (a, b) =>
      a.categories.sort_order - b.categories.sort_order || a.categories.display_name.localeCompare(b.categories.display_name)
  );

  return (
    <>
      <p className="mt-4">{g.yourRole(membership.role)}</p>
      <Notice ok={ok} error={error} />

      <h2 className={ui.h2}>{g.divisions}</h2>
      {rows.length === 0 && <p className={ui.help}>{g.noDivisions}</p>}

      {rows.map((d) => {
        const next = nextPhase(d.phase);
        const previous = previousPhase(d.phase);
        return (
          <section key={d.id} className={ui.card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">{d.categories.display_name}</h3>
              <span className="rounded bg-neutral-100 px-2 py-1 text-sm">
                {PHASE_LABEL[d.phase]} · {g.archers(count.get(d.id) ?? 0)}
              </span>
            </div>
            <p className={ui.help}>{PHASE_HELP[d.phase][helpRole]}</p>

            {official && next && (
              <form action={advancePhase.bind(null, tournamentId)} className="mt-2">
                <input type="hidden" name="division_id" value={d.id} />
                <input type="hidden" name="from" value={d.phase} />
                {d.phase === "REGISTRATION" && (
                  <label className="mt-2 flex items-start gap-2 text-sm">
                    <input type="checkbox" name="force_close" className="mt-1 h-5 w-5" />
                    {g.forceClose}
                  </label>
                )}
                <button className={ui.button}>{g.advanceTo(PHASE_LABEL[next])}</button>
              </form>
            )}

            {official && previous && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm underline">{g.reopenTo(PHASE_LABEL[previous])}</summary>
                <form action={reopenPhase.bind(null, tournamentId)}>
                  <input type="hidden" name="division_id" value={d.id} />
                  <input type="hidden" name="from" value={d.phase} />
                  <label className={ui.label} htmlFor={`reason-${d.id}`}>{g.reopenReason}</label>
                  <textarea id={`reason-${d.id}`} name="reason" required minLength={10} rows={2} className={ui.input} />
                  <button className={ui.secondary}>{g.reopenTo(PHASE_LABEL[previous])}</button>
                </form>
              </details>
            )}
          </section>
        );
      })}
    </>
  );
}
