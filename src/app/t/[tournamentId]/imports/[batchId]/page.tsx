import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { guidance } from "@/content/guidance";
import { requireMembership } from "@/server/auth";
import { commitImport, discardImport, saveRow } from "./actions";

type Parsed = { full_name?: string; club?: string; state?: string; division_id?: string | null };

export default async function ReviewImport({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string; batchId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { tournamentId, batchId } = await params;
  const { ok, error } = await searchParams;
  if (!z.uuid().safeParse(batchId).success) notFound();
  const { supabase } = await requireMembership(tournamentId, ["COACH"]);
  const g = guidance.imports;

  const [{ data: batch }, { data: rows }, { data: divisions }] = await Promise.all([
    supabase.from("import_batches").select("status, original_filename, row_count, error").eq("id", batchId).maybeSingle(),
    supabase.from("import_rows").select("id, row_index, parsed, errors, action").eq("batch_id", batchId).order("row_index"),
    supabase
      .from("divisions")
      .select("id, categories(display_name)")
      .eq("tournament_id", tournamentId)
      .eq("phase", "REGISTRATION")
      .eq("event_kind", "INDIVIDUAL")
      .overrideTypes<{ id: string; categories: { display_name: string } }[], { merge: false }>(),
  ]);
  if (!batch) notFound();

  const back = (
    <Link href={`/t/${tournamentId}/roster`} className={ui.link}>
      {g.back}
    </Link>
  );

  return (
    <>
      {batch.status === "PARSING" && <meta httpEquiv="refresh" content="5" />}
      <h2 className={ui.h2}>
        {g.title}: {batch.original_filename}
      </h2>
      <Notice ok={ok} error={error} />

      {batch.status === "PARSING" && <p className="mt-3">{g.parsing}</p>}
      {batch.status === "FAILED" && (
        <p className="mt-3">
          {g.failed} {batch.error}
        </p>
      )}
      {batch.status === "COMMITTED" && <p className="mt-3">{g.committed(batch.row_count)}</p>}

      {batch.status === "REVIEW" && (
        <>
          <p className={ui.help}>{g.help}</p>
          <ol className="mt-3">
            {rows?.map((r) => {
              const p = r.parsed as Parsed;
              return (
                <li key={r.id} className={`${ui.card} ${r.action === "SKIP" ? "opacity-60" : ""}`}>
                  <form action={saveRow.bind(null, tournamentId, batchId)}>
                    <input type="hidden" name="row_id" value={r.id} />
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-neutral-600">
                        {g.row} {r.row_index + 1}
                      </span>
                      {r.errors.length > 0 && <span className="text-sm text-red-700">{r.errors.join(" · ")}</span>}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input name="full_name" aria-label={guidance.roster.name} defaultValue={p.full_name ?? ""} placeholder={guidance.roster.name} className={ui.input} />
                      <input name="club" aria-label={guidance.roster.club} defaultValue={p.club ?? ""} placeholder={guidance.roster.club} className={ui.input} />
                      <input name="state" aria-label={guidance.roster.state} defaultValue={p.state ?? ""} placeholder={guidance.roster.state} className={ui.input} />
                      <select name="division_id" aria-label={guidance.roster.division} defaultValue={p.division_id ?? ""} className={ui.input}>
                        <option value="">{g.chooseDivision}</option>
                        {divisions?.map((d) => (
                          <option key={d.id} value={d.id}>{d.categories.display_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input type="radio" name="action" value="CREATE" defaultChecked={r.action === "CREATE"} className="h-5 w-5" />
                        {g.keep}
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name="action" value="SKIP" defaultChecked={r.action === "SKIP"} className="h-5 w-5" />
                        {g.skip}
                      </label>
                      <button className={ui.small}>{guidance.roster.save}</button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex flex-wrap gap-3">
            <form action={commitImport.bind(null, tournamentId, batchId)}>
              <button className={ui.button}>{g.commit}</button>
            </form>
            <form action={discardImport.bind(null, tournamentId, batchId)}>
              <button className={ui.secondary}>{g.discard}</button>
            </form>
          </div>
        </>
      )}
      <p className="mt-6">{back}</p>
    </>
  );
}
