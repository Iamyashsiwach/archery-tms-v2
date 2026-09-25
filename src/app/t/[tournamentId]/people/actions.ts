"use server";

import { z } from "zod";
import { ActionError, OFFICIALS, refuse, requireMembership, run } from "@/server/auth";
import { createAnonClient, siteUrl } from "@/server/supabase";

const page = (id: string) => `/t/${id}/people`;
const INVITE_REFUSALS = ["already_member", "invalid_email", "invalid_role", "not_allowed"];

/**
 * Sends the invitee a sign-in email that lands on their invite. Uses a client
 * with no session so nothing touches the official's own login cookies.
 */
async function emailInvite(email: string, membershipId: string) {
  const { error } = await createAnonClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${siteUrl()}/accept/${membershipId}` },
  });
  if (error) console.error("invite email failed:", error.message);
  return !error;
}

const Invite = z.object({
  email: z.email(),
  role: z.enum(["ADMIN", "OFFICIAL", "JUDGE", "COACH"]),
  club: z.string().trim().max(120).optional(),
});

export async function invite(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const input = Invite.safeParse({ ...Object.fromEntries(form), email: String(form.get("email") ?? "").trim() });
    if (!input.success) throw new ActionError("invalid_input");

    const { data: id, error } = await supabase.rpc("invite_member", {
      p_tournament: tournamentId,
      p_email: input.data.email,
      p_role: input.data.role,
      p_club: input.data.club || undefined,
    });
    if (error) refuse(error, INVITE_REFUSALS);
    return (await emailInvite(input.data.email.toLowerCase(), id)) ? "invite_sent" : "invite_saved_email_failed";
  });
}

/** Re-issues a pending invite (a fresh 14 days) and emails it again. */
export async function resend(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const membershipId = z.uuid().safeParse(form.get("membership_id"));
    if (!membershipId.success) throw new ActionError("not_found");

    const { data: m } = await supabase
      .from("memberships")
      .select("invited_email, role, club, status")
      .eq("id", membershipId.data)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (!m || m.status === "ACTIVE") throw new ActionError("not_found");

    const { data: id, error } = await supabase.rpc("invite_member", {
      p_tournament: tournamentId,
      p_email: m.invited_email,
      p_role: m.role,
      p_club: m.club ?? undefined,
    });
    if (error) refuse(error, INVITE_REFUSALS);
    return (await emailInvite(m.invited_email, id)) ? "invite_sent" : "invite_saved_email_failed";
  });
}

export async function revoke(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const membershipId = z.uuid().safeParse(form.get("membership_id"));
    if (!membershipId.success) throw new ActionError("not_found");

    const { error } = await supabase.rpc("revoke_member", { p_membership: membershipId.data });
    if (error) refuse(error, ["not_allowed"]);
    return "revoked";
  });
}

const Assign = z
  .object({
    membership_id: z.uuid(),
    from: z.coerce.number().int().min(1).max(999),
    to: z.union([z.literal(""), z.coerce.number().int().min(1).max(999)]).optional(),
  })
  .refine((a) => !a.to || (a.to >= a.from && a.to - a.from < 100));

export async function assignTargets(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const input = Assign.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");

    const { from, to, membership_id } = input.data;
    const rows = [];
    for (let bale = from; bale <= (to || from); bale++) rows.push({ tournament_id: tournamentId, membership_id, bale_number: bale });

    const { error } = await supabase
      .from("judge_assignments")
      .upsert(rows, { onConflict: "tournament_id,bale_number,membership_id", ignoreDuplicates: true });
    if (error) refuse(error, []);
    return "assigned";
  });
}

export async function unassignTarget(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const id = z.uuid().safeParse(form.get("assignment_id"));
    if (!id.success) throw new ActionError("not_found");

    const { error } = await supabase.from("judge_assignments").delete().eq("id", id.data).eq("tournament_id", tournamentId);
    if (error) refuse(error, []);
    return "unassigned";
  });
}
