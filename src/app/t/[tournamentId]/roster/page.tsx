import Link from "next/link";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { guidance, PHASE_LABEL } from "@/content/guidance";
import type { Phase } from "@/lib/phases";
import { requireMembership } from "@/server/auth";
import { addArcher, saveArcher, submitDivision, withdrawArcher } from "./actions";
import { uploadImport } from "./import-actions";

// A PDF import is read by Claude after the upload responds (import-actions.ts).
export const maxDuration = 300;

type Division = { id: string; phase: Phase; event_kind: string; categories: { display_name: string } };

export default async function Roster({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { tournamentId } = await params;
  const { ok, error } = await searchParams;
  const { supabase, membership } = await requireMembership(tournamentId, ["COACH"]);
  const g = guidance.roster;

  const [{ data: divisions }, { data: archers }, { data: batches }] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, phase, event_kind, categories(display_name)")
      .eq("tournament_id", tournamentId)
      .overrideTypes<Division[], { merge: false }>(),
    supabase
      .from("archers")
      .select("id, full_name, club, state, division_id, registration_locked, bale_number, slot_index")
      .eq("membership_id", membership.id)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("import_batches")
      .select("id, source, status, original_filename, created_at")
      .eq("membership_id", membership.id)
      .order("created_at", { ascending: false }),
  ]);

  const open = (divisions ?? []).filter((d) => d.phase === "REGISTRATION" && d.event_kind === "INDIVIDUAL");
  const shown = (divisions ?? []).filter((d) => d.phase === "REGISTRATION" || archers?.some((a) => a.division_id === d.id));

  return (
    <>
      <Notice ok={ok} error={error} />
      <h2 className={ui.h2}>{g.title}</h2>
      <p className={ui.help}>{g.help}</p>
      {open.length === 0 && <p className={ui.help}>{g.noOpenDivisions}</p>}

      {shown.map((d) => {
        const mine = (archers ?? []).filter((a) => a.division_id === d.id);
        const editable = d.phase === "REGISTRATION";
        return (
          <section key={d.id} className={ui.card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{d.categories.display_name}</h3>
              <span className="text-sm text-neutral-600">{PHASE_LABEL[d.phase]}</span>
            </div>
            {mine.length === 0 && <p className={ui.help}>{g.none}</p>}
            <ul>
              {mine.map((a) =>
                editable && !a.registration_locked ? (
                  <li key={a.id} className="border-b border-neutral-200 py-3">
                    <form action={saveArcher.bind(null, tournamentId)} className="grid gap-2 sm:grid-cols-3">
                      <input type="hidden" name="archer_id" value={a.id} />
                      <input name="full_name" aria-label={`${g.name}: ${a.full_name}`} defaultValue={a.full_name} required minLength={2} className={ui.input} />
                      <input name="club" aria-label={`${g.club}: ${a.full_name}`} defaultValue={a.club ?? ""} placeholder={g.club} className={ui.input} />
                      <input name="state" aria-label={`${g.state}: ${a.full_name}`} defaultValue={a.state ?? ""} placeholder={g.state} className={ui.input} />
                      <button className={ui.small}>{g.save}</button>
                    </form>
                    <form action={withdrawArcher.bind(null, tournamentId)} className="mt-2">
                      <input type="hidden" name="archer_id" value={a.id} />
                      <button className={ui.small}>{g.withdraw}</button>
                    </form>
                  </li>
                ) : (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-neutral-200 py-2">
                    <span>
                      {a.full_name}
                      {a.club && <span className="text-neutral-600"> · {a.club}</span>}
                    </span>
                    <span className="text-sm text-neutral-600">
                      {a.bale_number && a.slot_index ? g.target(a.bale_number, a.slot_index) : a.registration_locked ? g.submitted : g.draft}
                    </span>
                  </li>
                )
              )}
            </ul>
            {editable && mine.some((a) => !a.registration_locked) && (
              <form action={submitDivision.bind(null, tournamentId)}>
                <input type="hidden" name="division_id" value={d.id} />
                <p className={ui.help}>{g.submitHelp}</p>
                <button className={ui.secondary}>{g.submit}</button>
              </form>
            )}
          </section>
        );
      })}

      {open.length > 0 && (
        <>
          <form action={addArcher.bind(null, tournamentId)} className={ui.card}>
            <label className={ui.label} htmlFor="full_name">{g.name}</label>
            <input id="full_name" name="full_name" required minLength={2} autoComplete="off" className={ui.input} />
            <label className={ui.label} htmlFor="club">{g.club}</label>
            <input id="club" name="club" defaultValue={membership.club ?? ""} className={ui.input} />
            <label className={ui.label} htmlFor="state">{g.state}</label>
            <input id="state" name="state" className={ui.input} />
            <label className={ui.label} htmlFor="division_id">{g.division}</label>
            <select id="division_id" name="division_id" required className={ui.input}>
              {open.map((d) => (
                <option key={d.id} value={d.id}>{d.categories.display_name}</option>
              ))}
            </select>
            <button className={ui.button}>{g.add}</button>
          </form>

          <h2 className={ui.h2}>{g.importTitle}</h2>
          <p className={ui.help}>{g.importHelp}</p>
          <form action={uploadImport.bind(null, tournamentId)} className={ui.card}>
            <label className={ui.label} htmlFor="file">{g.file}</label>
            <input id="file" name="file" type="file" required accept=".csv,.xlsx,.pdf" className={`${ui.input} py-3`} />
            <button className={ui.button}>{g.upload}</button>
          </form>
        </>
      )}

      {!!batches?.length && (
        <>
          <h3 className="mt-6 font-semibold">{g.batches}</h3>
          <ul className="mt-2">
            {batches.map((b) => (
              <li key={b.id} className="border-b border-neutral-200 py-2">
                <Link href={`/t/${tournamentId}/imports/${b.id}`} className={ui.link}>
                  {b.original_filename ?? b.source}
                </Link>{" "}
                <span className="text-sm text-neutral-600">
                  {g.batchStatus[b.status]} · {b.created_at.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
