"use server";

import { z } from "zod";
import { ActionError, refuse, requireMembership, run } from "@/server/auth";
import { recalculateMatch } from "@/server/derived";

/** The judge's measurement when shoot-off arrows score the same. Needs signal. */
export async function closestToCentre(tournamentId: string, form: FormData) {
  await run(`/t/${tournamentId}/score`, async () => {
    const { supabase } = await requireMembership(tournamentId, ["JUDGE"]);
    const input = z
      .object({ match_id: z.uuid(), side: z.coerce.number().int().min(1).max(2) })
      .safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");

    const { error } = await supabase.rpc("record_closest_to_centre", {
      p_match: input.data.match_id,
      p_side: input.data.side,
    });
    if (error) refuse(error, ["not_allowed"]);
    await recalculateMatch(input.data.match_id);
    return "call_recorded";
  });
}
