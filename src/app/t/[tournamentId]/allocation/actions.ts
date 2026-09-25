"use server";

import { z } from "zod";
import { allocate } from "@/lib/derive";
import { ActionError, OFFICIALS, assertPhase, refuse, requireMembership, run } from "@/server/auth";

const page = (id: string) => `/t/${id}/allocation`;

const Target = z.object({
  archer_id: z.uuid(),
  bale_number: z.coerce.number().int().min(1).max(999),
  slot_index: z.coerce.number().int().min(1).max(6),
});

/** RLS allows this only in ALLOCATION; a trigger keeps officials to these two columns. */
export async function setTarget(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const input = Target.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");

    const { count, error } = await supabase
      .from("archers")
      .update({ bale_number: input.data.bale_number, slot_index: input.data.slot_index }, { count: "exact" })
      .eq("id", input.data.archer_id)
      .eq("tournament_id", tournamentId);
    if (error) refuse(error, []);
    if (!count) throw new ActionError("wrong_phase");
    return "target_saved";
  });
}

/**
 * Archers without a target go onto fresh targets after the highest one in use
 * anywhere in the tournament, so divisions never share a target by accident.
 */
export async function autoAllocate(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const division = await assertPhase(supabase, tournamentId, form.get("division_id"), ["ALLOCATION"]);

    const [{ data: waiting }, { data: highest }] = await Promise.all([
      supabase
        .from("archers")
        .select("id")
        .eq("division_id", division.id)
        .is("deleted_at", null)
        .is("bale_number", null)
        .order("club", { nullsFirst: false })
        .order("full_name"),
      supabase
        .from("archers")
        .select("bale_number")
        .eq("tournament_id", tournamentId)
        .not("bale_number", "is", null)
        .order("bale_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // ponytail: one request per archer; idempotent, so a partial run is simply re-run.
    const results = await Promise.all(
      allocate((waiting ?? []).map((a) => a.id), (highest?.bale_number ?? 0) + 1).map((t) =>
        supabase.from("archers").update({ bale_number: t.bale_number, slot_index: t.slot_index }).eq("id", t.archer_id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) refuse(failed.error, []);
    return "auto_allocated";
  });
}

const MatchTarget = z.object({
  match_id: z.uuid(),
  bale_number: z.union([z.literal(""), z.coerce.number().int().min(1).max(999)]),
});

export async function setMatchTarget(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const input = MatchTarget.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");

    const { count, error } = await supabase
      .from("matches")
      .update({ bale_number: input.data.bale_number === "" ? null : input.data.bale_number }, { count: "exact" })
      .eq("id", input.data.match_id)
      .eq("tournament_id", tournamentId);
    if (error) refuse(error, []);
    if (!count) throw new ActionError("wrong_phase");
    return "target_saved";
  });
}
