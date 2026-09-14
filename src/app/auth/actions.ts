"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { createClient, siteUrl } from "@/server/supabase";

/**
 * Verifies the one-time token from the email link. This runs on a button
 * press, not on page load, because mail scanners open links automatically
 * and would otherwise use up the token before the person does.
 */
export async function confirmSignIn(form: FormData) {
  const next = safeNext(form.get("next"), siteUrl());
  const tokenHash = String(form.get("token_hash") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) redirect(`/auth/confirm?failed=1&next=${encodeURIComponent(next)}`);

  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
