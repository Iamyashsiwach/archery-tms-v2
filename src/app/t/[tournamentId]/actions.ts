"use server";

import { z } from "zod";
import { PHASES, nextPhase, previousPhase } from "@/lib/phases";
import { getMatchSpec, getRound } from "@/lib/rules/catalogue";
import { ActionError, OFFICIALS, assertPhase, requireMembership, run } from "@/server/auth";
import { transition } from "@/server/derived";

/**
 * The form carries the phase it was rendered for, so two officials clicking at
 * once cannot move a division two phases.
 */
export async function advancePhase(tournamentId: string, form: FormData) {
  await run(`/t/${tournamentId}`, async () => {
    const { supabase, userId } = await requireMembership(tournamentId, OFFICIALS);
    const division = await assertPhase(supabase, tournamentId, form.get("division_id"), PHASES);
    if (division.phase !== form.get("from")) throw new ActionError("phase_changed");
    const to = nextPhase(division.phase);
    if (!to) throw new ActionError("invalid_transition");

    if (division.phase === "SETUP") {
      try {
        getRound(division.categories.round_code);
        getMatchSpec(division.categories.match_format_code);
      } catch {
        throw new ActionError("unknown_round");
      }
    }

    await transition(division.id, to, userId, { forceClose: form.get("force_close") === "on" });
    return "phase_advanced";
  });
}

export async function reopenPhase(tournamentId: string, form: FormData) {
  await run(`/t/${tournamentId}`, async () => {
    const { supabase, userId } = await requireMembership(tournamentId, OFFICIALS);
    const division = await assertPhase(supabase, tournamentId, form.get("division_id"), PHASES);
    if (division.phase !== form.get("from")) throw new ActionError("phase_changed");
    const to = previousPhase(division.phase);
    if (!to) throw new ActionError("invalid_transition");

    const reason = z.string().trim().min(10).max(500).safeParse(form.get("reason"));
    if (!reason.success) throw new ActionError("reason_required");

    await transition(division.id, to, userId, { reason: reason.data });
    return "phase_reopened";
  });
}
