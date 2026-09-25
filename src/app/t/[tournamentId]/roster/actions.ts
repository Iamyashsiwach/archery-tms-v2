"use server";

import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { ActionError, assertPhase, refuse, requireMembership, run } from "@/server/auth";

const page = (id: string) => `/t/${id}/roster`;

const Archer = z.object({
  full_name: z.string().trim().min(2).max(120),
  club: z.string().trim().max(120).optional(),
  state: z.string().trim().max(60).optional(),
});

/**
 * Bow style, gender and age class come from the division's category, so an
 * archer can never be entered into a division that does not fit them.
 */
export async function addArcher(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase, membership } = await requireMembership(tournamentId, ["COACH"]);
    const division = await assertPhase(supabase, tournamentId, form.get("division_id"), ["REGISTRATION"]);
    const input = Archer.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");

    const { error } = await supabase.from("archers").insert({
      tournament_id: tournamentId,
      division_id: division.id,
      membership_id: membership.id,
      full_name: input.data.full_name,
      club: input.data.club || membership.club,
      state: input.data.state || null,
      bow_style: division.categories.bow_style,
      gender: division.categories.gender,
      age_class: division.categories.age_class,
    });
    if (error) refuse(error, []);
    return "archer_added";
  });
}

/** RLS limits these to the coach's own unsubmitted archers in REGISTRATION. */
async function updateOwnArcher(tournamentId: string, form: FormData, values: () => Database["public"]["Tables"]["archers"]["Update"], ok: string) {
  await run(page(tournamentId), async () => {
    const { supabase, membership } = await requireMembership(tournamentId, ["COACH"]);
    const id = z.uuid().safeParse(form.get("archer_id"));
    if (!id.success) throw new ActionError("not_found");

    const { count, error } = await supabase
      .from("archers")
      .update(values(), { count: "exact" })
      .eq("id", id.data)
      .eq("membership_id", membership.id);
    if (error) refuse(error, []);
    if (!count) throw new ActionError("wrong_phase");
    return ok;
  });
}

export async function saveArcher(tournamentId: string, form: FormData) {
  await updateOwnArcher(tournamentId, form, () => {
    const input = Archer.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");
    return { full_name: input.data.full_name, club: input.data.club || null, state: input.data.state || null };
  }, "archer_saved");
}

export async function withdrawArcher(tournamentId: string, form: FormData) {
  await updateOwnArcher(tournamentId, form, () => ({ deleted_at: new Date().toISOString() }), "archer_withdrawn");
}

export async function submitDivision(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase, membership } = await requireMembership(tournamentId, ["COACH"]);
    const division = await assertPhase(supabase, tournamentId, form.get("division_id"), ["REGISTRATION"]);

    const { error } = await supabase
      .from("archers")
      .update({ registration_locked: true })
      .eq("division_id", division.id)
      .eq("membership_id", membership.id)
      .is("deleted_at", null)
      .eq("registration_locked", false);
    if (error) refuse(error, []);
    return "roster_submitted";
  });
}
