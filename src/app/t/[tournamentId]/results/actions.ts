"use server";

import { z } from "zod";
import { ActionError, OFFICIALS, assertPhase, requireMembership, run } from "@/server/auth";
import { recalculateStandings, recordRankingShootOff } from "@/server/derived";

const page = (id: string) => `/t/${id}/results`;

/** Form fields are position_<archerId> = place within the tied group, 1 = won. */
export async function recordShootOff(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const division = await assertPhase(supabase, tournamentId, form.get("division_id"), ["CUT"]);

    const positions = [...form.entries()]
      .filter(([key]) => key.startsWith("position_"))
      .map(([key, value]) => ({ archer_id: key.slice("position_".length), position: Number(value) }));
    const places = positions.map((p) => p.position).sort((a, b) => a - b);
    const valid =
      positions.length >= 2 &&
      positions.every((p) => z.uuid().safeParse(p.archer_id).success) &&
      places.every((p, i) => p === i + 1);
    if (!valid) throw new ActionError("positions_invalid");

    // Only archers really tied in this division; anything else is ignored by the update.
    const { data: tied } = await supabase
      .from("results")
      .select("archer_id")
      .eq("division_id", division.id)
      .eq("needs_shoot_off", true)
      .in("archer_id", positions.map((p) => p.archer_id));
    if ((tied ?? []).length !== positions.length) throw new ActionError("positions_invalid");

    await recordRankingShootOff(division.id, positions);
    return "shoot_off_recorded";
  });
}

export async function recalculate(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const division = await assertPhase(supabase, tournamentId, form.get("division_id"), ["QUALIFICATION", "CUT"]);
    await recalculateStandings(division.id);
    return "recalculated";
  });
}
