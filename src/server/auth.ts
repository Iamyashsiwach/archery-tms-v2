import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "./supabase";

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
