"use client";

import { useActionState } from "react";
import { guidance } from "@/content/guidance";
import { signIn, type SignInState } from "./actions";

const input =
  "mt-1 block w-full min-h-14 rounded-lg border border-neutral-300 px-3 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400";
const button = "mt-4 w-full min-h-14 rounded-lg bg-neutral-900 text-lg font-medium text-white hover:bg-neutral-700 disabled:opacity-50";

export function LoginForm({ next, localInbox }: { next: string; localInbox?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { step: "email" });

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="next" value={next} />

      {state.step === "email" ? (
        <>
          <p className="text-neutral-700">{guidance.login.intro}</p>
          <label htmlFor="email" className="mt-4 block font-medium">
            {guidance.login.emailLabel}
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={input} />
        </>
      ) : (
        <>
          <p className="text-neutral-700">{guidance.login.codeSent(state.email ?? "")}</p>
          <input type="hidden" name="email" value={state.email} />
          <label htmlFor="token" className="mt-4 block font-medium">
            {guidance.login.codeLabel}
          </label>
          <input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required className={input} />
        </>
      )}

      {state.error && (
        <p role="alert" className="mt-3 text-red-700">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={button}>
        {state.step === "email" ? guidance.login.sendButton : guidance.login.verifyButton}
      </button>

      {state.step === "code" && (
        <a href={`/login?next=${encodeURIComponent(next)}`} className="mt-4 block py-3 text-center underline">
          {guidance.login.differentEmail}
        </a>
      )}

      {localInbox && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {guidance.login.localInbox}{" "}
          <a href={localInbox} target="_blank" rel="noreferrer" className="font-medium underline">
            {guidance.login.openInbox} ↗
          </a>
        </p>
      )}
    </form>
  );
}
