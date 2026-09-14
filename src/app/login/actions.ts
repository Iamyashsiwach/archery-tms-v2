"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guidance } from "@/content/guidance";
import { safeNext } from "@/lib/safe-next";
import { createClient, siteUrl } from "@/server/supabase";

export type SignInState = { step: "email" | "code"; email?: string; error?: string };

const Email = z.email();
const Code = z.string().regex(/^\d{6,10}$/);

/**
 * Step one emails a link and a code. Step two accepts the code, for when the
 * email is open on a different device or a mail scanner used up the link.
 * Same response for every address, so this cannot be used to find accounts.
 */
export async function signIn(prev: SignInState, form: FormData): Promise<SignInState> {
  const next = safeNext(form.get("next"), siteUrl());
  const email = Email.safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { step: "email", error: guidance.login.invalidEmail };

  const supabase = await createClient();

  if (prev.step === "email") {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.data,
      options: { shouldCreateUser: true, emailRedirectTo: new URL(next, siteUrl()).toString() },
    });
    if (error) {
      console.error("signInWithOtp failed:", error.message);
      return { step: "email", email: email.data, error: guidance.login.sendFailed };
    }
    return { step: "code", email: email.data };
  }

  const token = Code.safeParse(String(form.get("token") ?? "").trim());
  if (!token.success) return { step: "code", email: email.data, error: guidance.login.codeRejected };

  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: token.data, type: "email" });
  if (error) return { step: "code", email: email.data, error: guidance.login.codeRejected };

  redirect(next);
}
