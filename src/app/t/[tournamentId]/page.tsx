import Link from "next/link";
import { Checklist, PhaseSteps } from "@/components/Guidance";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { guidance, PHASE_HELP, PHASE_LABEL } from "@/content/guidance";
import { nextPhase, PHASES, previousPhase, type Phase } from "@/lib/phases";
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

  const [{ data: divisions }, { data: archers }, { data: members }, { data: assignments }] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, phase, categories(display_name, sort_order)")
      .eq("tournament_id", tournamentId)
      .overrideTypes<Division[], { merge: false }>(),
    supabase
      .from("archers")
      .select("division_id, membership_id, bale_number, registration_locked")
      .eq("tournament_id", tournamentId)
      .is("deleted_at", null),
    supabase.from("memberships").select("role, status").eq("tournament_id", tournamentId),
    supabase.from("judge_assignments").select("bale_number, membership_id").eq("tournament_id", tournamentId),
  ]);

  const live = archers ?? [];
  const count = new Map<string, number>();
  for (const a of live) count.set(a.division_id!, (count.get(a.division_id!) ?? 0) + 1);
  const rows = (divisions ?? []).sort(
    (a, b) =>
      a.categories.sort_order - b.categories.sort_order || a.categories.display_name.localeCompare(b.categories.display_name)
  );

  // The checklist is derived from live data, so it ticks itself off as the event is set up.
  const base = `/t/${tournamentId}`;
  const reached = (p: Phase) => rows.some((d) => PHASES.indexOf(d.phase) >= PHASES.indexOf(p));
  let checklist: React.ReactNode = null;
  if (official) {
    const o = guidance.checklist.official;
    const running = reached("QUALIFICATION");
    const inUse = new Set(live.flatMap((a) => (a.bale_number ? [a.bale_number] : [])));
    const judged = new Set((assignments ?? []).map((a) => a.bale_number));
    const invited = (role: string) => (members ?? []).some((m) => m.role === role && m.status !== "REVOKED");
    const step = (s: { label: string; detail: string; cta: string }, done: boolean, href: string) => ({ ...s, href, done: running || done });
    checklist = (
      <Checklist
        title={o.title}
        allDone={o.allDone}
        steps={[
          step(o.categories, rows.length > 0, `${base}/setup`),
          step(o.coaches, invited("COACH"), `${base}/people`),
          step(o.judges, invited("JUDGE"), `${base}/people`),
          step(o.registration, reached("REGISTRATION"), "#divisions"),
          step(o.closeRegistration, reached("ALLOCATION"), "#divisions"),
          step(o.allocate, live.length > 0 && live.every((a) => a.bale_number != null), `${base}/allocation`),
          step(o.judgeTargets, inUse.size > 0 && [...inUse].every((b) => judged.has(b)), `${base}/people`),
          step(o.qualification, running, "#divisions"),
        ]}
      />
    );
  } else if (membership.role === "COACH") {
    const c = guidance.checklist.coach;
    const mine = live.filter((a) => a.membership_id === membership.id);
    checklist =
      !reached("REGISTRATION") && mine.length === 0 ? (
        <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">{c.notOpen}</p>
      ) : (
        <Checklist
          title={c.title}
          allDone={c.allDone}
          steps={[
            { ...c.add, done: mine.length > 0, href: `${base}/roster` },
            { ...c.submit, done: mine.length > 0 && mine.every((a) => a.registration_locked), href: `${base}/roster` },
          ]}
        />
      );
  } else {
    const j = guidance.checklist.judge;
    const bales = (assignments ?? [])
      .filter((a) => a.membership_id === membership.id)
      .map((a) => a.bale_number)
      .sort((a, b) => a - b);
    checklist = (
      <section className={ui.card}>
        <h2 className="font-semibold">{j.title}</h2>
        <p className="mt-1">{j.targets(bales)}</p>
        <p className={ui.help}>{j.tip}</p>
        {bales.length > 0 && (
          <Link href={`${base}/score`} className={ui.button}>
            {j.cta} →
          </Link>
        )}
      </section>
    );
  }

  return (
    <>
      <Notice ok={ok} error={error} />
      {checklist}

      <h2 id="divisions" className={`${ui.h2} scroll-mt-4`}>
        {g.divisions}
      </h2>
      {rows.length === 0 && <p className={ui.help}>{g.noDivisions}</p>}

      {rows.map((d) => {
        const next = nextPhase(d.phase);
        const previous = previousPhase(d.phase);
        return (
          <section key={d.id} className={ui.card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold">{d.categories.display_name}</h3>
              <span className={ui.badge}>
                {PHASE_LABEL[d.phase]} · {g.archers(count.get(d.id) ?? 0)}
              </span>
            </div>
            <PhaseSteps phase={d.phase} />
            <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
              <span className="font-medium text-neutral-900">{g.whatNext}: </span>
              {PHASE_HELP[d.phase][helpRole]}
            </p>

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
