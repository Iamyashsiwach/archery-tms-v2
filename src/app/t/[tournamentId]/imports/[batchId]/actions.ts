"use server";

import { z } from "zod";
import { ROW_ERRORS } from "@/lib/roster-import";
import { ActionError, refuse, requireMembership, run } from "@/server/auth";

const page = (tournamentId: string, batchId: string) => `/t/${tournamentId}/imports/${batchId}`;

const Row = z.object({
  row_id: z.uuid(),
  full_name: z.string().trim().max(120),
  club: z.string().trim().max(120).optional(),
  state: z.string().trim().max(60).optional(),
  division_id: z.union([z.uuid(), z.literal("")]),
  action: z.enum(["CREATE", "SKIP"]),
});

/** RLS keeps this to the coach's own batch while it is still under review. */
export async function saveRow(tournamentId: string, batchId: string, form: FormData) {
  await run(page(tournamentId, batchId), async () => {
    const { supabase } = await requireMembership(tournamentId, ["COACH"]);
    const input = Row.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");
    const r = input.data;

    const { data: existing } = await supabase.from("import_rows").select("parsed").eq("id", r.row_id).eq("batch_id", batchId).maybeSingle();
    if (!existing) throw new ActionError("not_found");

    const errors = [];
    if (r.action === "CREATE" && r.full_name.length < 2) errors.push(ROW_ERRORS.noName);
    if (r.action === "CREATE" && !r.division_id) errors.push(ROW_ERRORS.noDivision);

    const { count, error } = await supabase
      .from("import_rows")
      .update(
        {
          action: r.action,
          errors,
          parsed: {
            ...(existing.parsed as object),
            full_name: r.full_name,
            club: r.club ?? "",
            state: r.state ?? "",
            division_id: r.division_id || null,
          },
        },
        { count: "exact" }
      )
      .eq("id", r.row_id)
      .eq("batch_id", batchId);
    if (error) refuse(error, []);
    if (!count) throw new ActionError("batch_not_in_review");
    return "row_saved";
  });
}

export async function commitImport(tournamentId: string, batchId: string) {
  await run(page(tournamentId, batchId), async () => {
    const { supabase } = await requireMembership(tournamentId, ["COACH"]);
    const { error } = await supabase.rpc("commit_import", { p_batch: batchId });
    if (error?.message.includes("no division open")) throw new ActionError("no_open_division");
    if (error?.message.includes("has no name")) throw new ActionError("invalid_input");
    if (error) refuse(error, ["batch_not_in_review", "not_allowed"]);
    return { to: `/t/${tournamentId}/roster?ok=import_committed` };
  });
}

export async function discardImport(tournamentId: string, batchId: string) {
  await run(page(tournamentId, batchId), async () => {
    const { supabase } = await requireMembership(tournamentId, ["COACH"]);
    const { error } = await supabase.from("import_batches").update({ status: "FAILED", error: "Discarded" }).eq("id", batchId);
    if (error) refuse(error, []);
    return { to: `/t/${tournamentId}/roster?ok=import_discarded` };
  });
}
