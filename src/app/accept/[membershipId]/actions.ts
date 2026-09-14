"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth";

const KNOWN_REFUSALS = new Set(["invite_not_found", "invite_expired", "invite_unavailable"]);

/**
 * Activation and its audit entry both happen inside accept_membership
 * (0003), which checks the invite against the signed-in user's confirmed email.
 */
export async function acceptInvite(form: FormData) {
  const membershipId = z.uuid().parse(form.get("membershipId"));
  const page = `/accept/${membershipId}`;
  const { supabase } = await requireUser(page);

  const { error } = await supabase.rpc("accept_membership", { p_membership: membershipId });
  if (error) {
    const reason = KNOWN_REFUSALS.has(error.message) ? error.message : "failed";
    if (reason === "failed") console.error("accept_membership failed:", error.message);
    redirect(`${page}?error=${reason}`);
  }

  redirect(page);
}
