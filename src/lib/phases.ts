/** Per-division phase machine, in order. See CLAUDE.md "Phase machine". */
export const PHASES = ["SETUP", "REGISTRATION", "ALLOCATION", "QUALIFICATION", "CUT", "ELIMINATION", "COMPLETE"] as const;

export type Phase = (typeof PHASES)[number];

export function nextPhase(phase: Phase): Phase | null {
  return PHASES[PHASES.indexOf(phase) + 1] ?? null;
}

export function previousPhase(phase: Phase): Phase | null {
  return PHASES[PHASES.indexOf(phase) - 1] ?? null;
}
