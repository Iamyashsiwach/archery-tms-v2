import Link from "next/link";
import { ui } from "@/components/ui";
import { guidance, PHASE_LABEL } from "@/content/guidance";
import { PHASES, type Phase } from "@/lib/phases";

/** Numbered "how this page works" steps; native <details>, so it folds away without JS. */
export function Guide({ steps, open = false }: { steps: string[]; open?: boolean }) {
  return (
    <details open={open} className="group mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm text-sky-950">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-medium [&::-webkit-details-marker]:hidden">
        {guidance.guide.title}
        <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ol className="list-decimal space-y-1.5 pb-4 pl-5">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

export type Step = { label: string; detail: string; cta?: string; href?: string; done: boolean };

/** Steps ticked off from live data; only the first open step is expanded, with its action. */
export function Checklist({ title, steps, allDone }: { title: string; steps: Step[]; allDone: string }) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  const c = guidance.checklist;

  if (next === -1) {
    return <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">✓ {allDone}</p>;
  }

  return (
    <section className={ui.card} aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm text-neutral-600">{c.progress(done, steps.length)}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-neutral-100" aria-hidden>
        <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 space-y-1">
        {steps.map((s, i) => {
          const isNext = i === next;
          return (
            <li key={s.label} className={`flex gap-3 rounded-lg p-2 ${isNext ? "bg-amber-50 ring-1 ring-amber-300" : ""}`}>
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-emerald-600 text-white" : isNext ? "bg-amber-400 text-neutral-900" : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={s.done ? "text-neutral-500" : "font-medium"}>
                  {s.label} <span className="sr-only">{s.done ? c.doneMark : isNext ? c.nextMark : ""}</span>
                </p>
                {isNext && (
                  <>
                    <p className={ui.help}>{s.detail}</p>
                    {s.href && s.cta && (
                      <Link href={s.href} className={ui.button}>
                        {s.cta} →
                      </Link>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Where a division is in the phase machine. Labels other than the current one hide on phones. */
export function PhaseSteps({ phase }: { phase: Phase }) {
  const at = PHASES.indexOf(phase);
  return (
    <ol aria-label={guidance.dashboard.progress} className="mt-3 flex gap-1">
      {PHASES.map((p, i) => (
        <li key={p} aria-current={i === at ? "step" : undefined} className="min-w-0 flex-1" title={PHASE_LABEL[p]}>
          <div className={`h-1.5 rounded-full ${i < at ? "bg-emerald-600" : i === at ? "bg-amber-400" : "bg-neutral-200"}`} />
          <span
            className={`mt-1 truncate text-[11px] ${i === at ? "block font-semibold text-neutral-900" : "hidden text-neutral-500 sm:block"}`}
          >
            {PHASE_LABEL[p]}
          </span>
        </li>
      ))}
    </ol>
  );
}
