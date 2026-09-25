import "server-only";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { Phase } from "@/lib/phases";
import { createClient } from "./supabase";

export type Role = "ADMIN" | "OFFICIAL" | "JUDGE" | "COACH";

export const EVERYONE: readonly Role[] = ["ADMIN", "OFFICIAL", "JUDGE", "COACH"];
export const OFFICIALS: readonly Role[] = ["ADMIN", "OFFICIAL"];

/**
 * A refusal the person can do something about. run() turns it into ?error=key
 * on the page, and the page shows guidance.errors[key].
 */
export class ActionError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

/**
 * The shape of every form action: do the work, then come back to `page` with
 * ?ok=key or ?error=key, or go on to `{ to }`. Redirecting after a POST also
 * means a refresh never submits twice.
 */
export async function run(page: string, work: () => Promise<string | void | { to: string }>) {
  let result: string | void | { to: string };
  try {
    result = await work();
  } catch (e) {
    if (e instanceof ActionError) redirect(`${page}?error=${e.key}`);
    throw e;
  }
  if (typeof result === "object") redirect(result.to);
  redirect(result ? `${page}?ok=${result}` : page);
}

/** Stops the action with a database refusal the page knows how to explain. */
export function refuse(error: { message: string; code?: string }, known: readonly string[]): never {
  if (known.includes(error.message)) throw new ActionError(error.message);
  if (error.code === "42501") throw new ActionError("not_allowed");
  console.error("database refused:", error.code, error.message);
  throw new ActionError("failed");
}

/**
 * The signed-in user, with the JWT verified rather than read from the cookie.
 * Anyone else is sent to sign in and brought back to `returnTo` afterwards.
 */
export async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return { supabase, userId: data.claims.sub };
}

/**
 * The caller's active membership in this tournament, if it has one of `roles`.
 * Anything else is a 404 rather than a 403, so tournament ids cannot be probed.
 */
export async function requireMembership(tournamentId: string, roles: readonly Role[] = EVERYONE) {
  if (!z.uuid().safeParse(tournamentId).success) notFound();
  const { supabase, userId } = await requireUser(`/t/${tournamentId}`);

  const { data: membership } = await supabase
    .from("memberships")
    .select("id, role, club")
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!membership || !roles.includes(membership.role as Role)) notFound();

  return { supabase, userId, membership: { ...membership, role: membership.role as Role } };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** The division, if it belongs to this tournament and is in one of `phases`. */
export async function assertPhase(supabase: Client, tournamentId: string, divisionId: unknown, phases: readonly Phase[]) {
  const id = z.uuid().safeParse(divisionId);
  if (!id.success) throw new ActionError("not_found");

  const { data: division } = await supabase
    .from("divisions")
    .select("id, phase, bracket_size, event_kind, categories(display_name, round_code, match_format_code, bow_style, gender, age_class)")
    .eq("id", id.data)
    .eq("tournament_id", tournamentId)
    .maybeSingle()
    .overrideTypes<{
      id: string;
      phase: Phase;
      bracket_size: number | null;
      event_kind: string;
      categories: {
        display_name: string;
        round_code: string;
        match_format_code: string;
        bow_style: string;
        gender: string;
        age_class: string;
      };
    }, { merge: false }>();

  if (!division) throw new ActionError("not_found");
  if (!phases.includes(division.phase)) throw new ActionError("wrong_phase");
  return division;
}

/** Judges act only on targets they are assigned to. */
export async function assertBaleAssigned(supabase: Client, tournamentId: string, membershipId: string, bale: number | null) {
  if (bale === null) throw new ActionError("not_your_target");
  const { data } = await supabase
    .from("judge_assignments")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("membership_id", membershipId)
    .eq("bale_number", bale)
    .maybeSingle();
  if (!data) throw new ActionError("not_your_target");
}
