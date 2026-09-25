// Shared class names. Touch targets are 56px (min-h-14): judges and coaches
// use this on phones at the range.
const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1";

export const ui = {
  page: "mx-auto max-w-3xl px-4 py-6",
  h1: "text-2xl font-semibold tracking-tight",
  h2: "mt-8 text-lg font-semibold",
  help: "mt-1 text-sm text-neutral-600",
  card: "mt-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm",
  label: "mt-3 block text-sm font-medium",
  input: `mt-1 block w-full min-h-14 rounded-lg border border-neutral-300 bg-white px-3 text-base ${focus}`,
  button: `mt-3 inline-flex min-h-14 items-center justify-center rounded-lg bg-neutral-900 px-5 text-base font-medium text-white hover:bg-neutral-700 disabled:opacity-50 ${focus}`,
  secondary: `mt-3 inline-flex min-h-14 items-center justify-center rounded-lg border border-neutral-300 bg-white px-5 text-base hover:bg-neutral-50 ${focus}`,
  small: `inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50 ${focus}`,
  badge: "inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700",
  table: "mt-3 w-full border-collapse text-sm",
  th: "border-b border-neutral-300 py-2 pr-3 text-left font-medium",
  td: "border-b border-neutral-200 py-2 pr-3 align-top",
  link: `underline underline-offset-2 hover:text-neutral-600 ${focus}`,
};
