/**
 * Everything a person reads when the app needs them to do something. Kept in
 * one file so the wording stays consistent and can be translated in one place.
 */

const ROLE_WITH_ARTICLE: Record<string, string> = {
  ADMIN: "an administrator",
  OFFICIAL: "an official",
  JUDGE: "a judge",
  COACH: "a coach",
};

export const guidance = {
  login: {
    title: "Sign in",
    intro:
      "Use the email address your invite was sent to. We will email you a sign-in link and a code. There is no password.",
    emailLabel: "Email address",
    sendButton: "Email me a sign-in link",
    codeSent: (email: string) =>
      `We sent a link and a code to ${email}. Open the link on this device, or type the code here.`,
    codeLabel: "Code from the email",
    verifyButton: "Sign in",
    differentEmail: "Use a different email address",
    invalidEmail: "Enter a full email address, like name@example.com.",
    sendFailed: "The email could not be sent. Wait a minute, then try again.",
    codeRejected: "That code is wrong or has expired. Check the newest email, or start again for a new code.",
  },

  confirm: {
    title: "Finish signing in",
    body: "Tap Continue to finish signing in on this device.",
    button: "Continue",
    failed: "This sign-in link has expired or was already used. Each link works once, for a short time.",
    retry: "Get a new link",
  },

  accept: {
    title: "Join the tournament",
    body: "You have been invited to help run a tournament. Accept to join with the role you were invited for.",
    button: "Accept invite",
    joined: (tournament: string, role: string) =>
      `You have joined ${tournament} as ${ROLE_WITH_ARTICLE[role] ?? role.toLowerCase()}.`,
    signOut: "Sign out",
    errors: {
      invite_not_found:
        "This invite was sent to a different email address. Sign out, then sign in with the address the invite was sent to.",
      invite_expired: "This invite has expired. Ask the tournament official to send you a new one.",
      invite_unavailable: "This invite is no longer active. Ask the tournament official if you still need access.",
      failed: "Something went wrong. Check your connection and try again.",
    } as Record<string, string>,
  },
};
