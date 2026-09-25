"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { guidance } from "@/content/guidance";
import { getMatchSpec } from "@/lib/rules/catalogue";
import { evaluateMatch } from "@/lib/rules/matches";
import { scoreEnd, totalEnds } from "@/lib/rules/scoring";
import type { Arrow } from "@/lib/rules/types";
import { closestToCentre } from "./actions";
import { queue } from "./queue";
import type { EndPayload, QueuedEnd, RecordedEnd, ScoreArcher, ScoreData, ScoreMatch, Stage, SyncResult } from "./types";

const KEYS: Arrow[] = ["X", 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, "M"];
const value = (a: Arrow) => (a === "X" ? 11 : a === "M" ? -1 : a);
const sortDesc = (arrows: Arrow[]) => [...arrows].sort((a, b) => value(b) - value(a));
const key = (e: Pick<RecordedEnd, "archer_id" | "stage" | "match_id" | "distance_index" | "end_number">) =>
  `${e.archer_id}|${e.stage}|${e.match_id ?? ""}|${e.distance_index}|${e.end_number}`;
const SLOT = "ABCDEF";
const RING = { maxRingValue: 10 };

type Entry = {
  archerId: string;
  name: string;
  divisionId: string;
  stage: Stage;
  matchId: string | null;
  distanceIndex: number;
  endNumber: number;
  arrowsPerEnd: number;
  label: string;
};

function archerProgress(a: ScoreArcher, known: RecordedEnd[]) {
  const mine = known.filter((e) => e.archer_id === a.id && e.stage === "QUALIFICATION");
  const done = new Set(mine.map((e) => `${e.distance_index}:${e.end_number}`));
  const totalCount = a.distances.reduce((n, d) => n + d.ends, 0);
  let before = 0;
  for (const [distanceIndex, d] of a.distances.entries()) {
    for (let endNumber = 1; endNumber <= d.ends; endNumber++) {
      if (!done.has(`${distanceIndex}:${endNumber}`)) {
        return { total: totalEnds(mine.map((e) => e.arrows), RING).total, next: { distanceIndex, endNumber, overall: before + endNumber, d }, totalCount };
      }
    }
    before += d.ends;
  }
  return { total: totalEnds(mine.map((e) => e.arrows), RING).total, next: null, totalCount };
}

function matchProgress(m: ScoreMatch, known: RecordedEnd[]) {
  const spec = getMatchSpec(m.formatCode);
  const side = (archerId: string, stage: Stage) =>
    known
      .filter((e) => e.match_id === m.id && e.archer_id === archerId && e.stage === stage)
      .sort((a, b) => a.end_number - b.end_number)
      .map((e) => e.arrows);
  const ends = m.sides.map((s) => side(s.archerId, "ELIMINATION"));
  const shootOff = m.sides.map((s) => side(s.archerId, "SHOOT_OFF")[0]);
  const shot = Math.min(ends[0].length, ends[1].length);
  const state = evaluateMatch(
    spec,
    ends[0].slice(0, shot),
    ends[1].slice(0, shot),
    shootOff[0] && shootOff[1] ? { arrows1: shootOff[0], arrows2: shootOff[1], closestToCentre: m.closestToCentre ?? undefined } : undefined
  );
  return { spec, state, ends, shootOff };
}

export function Scorer({ data }: { data: ScoreData }) {
  const g = guidance.score;
  const router = useRouter();
  const [queued, setQueued] = useState<QueuedEnd[]>([]);
  const [sent, setSent] = useState<EndPayload[]>([]);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);

  const reload = useCallback(async () => setQueued(await queue.all(data.tournamentId)), [data.tournamentId]);

  const sync = useCallback(async () => {
    const pending = (await queue.all(data.tournamentId)).filter((q) => !q.refused);
    if (pending.length && navigator.onLine) {
      try {
        const res = await fetch("/api/ends", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(pending.map((q) => ({ ...q, refused: undefined }))),
        });
        if (res.ok) {
          const results: SyncResult[] = await res.json();
          const saved: EndPayload[] = [];
          for (const r of results) {
            const item = pending.find((p) => p.id === r.id);
            if (!item) continue;
            if (r.result === "saved") {
              await queue.remove(r.id);
              saved.push(item);
            } else {
              await queue.put({ ...item, refused: r.message });
            }
          }
          if (saved.length) {
            // Keep showing what was just sent until the refreshed page includes it;
            // `known` de-duplicates by end, so the server's copy simply replaces it.
            setSent((s) => [...s, ...saved]);
            router.refresh();
          }
        }
      } catch {
        // No signal or server unreachable: everything stays queued.
      }
    }
    await reload();
  }, [data.tournamentId, reload, router]);

  const online = useSyncExternalStore(
    (changed) => {
      window.addEventListener("online", changed);
      window.addEventListener("offline", changed);
      return () => {
        window.removeEventListener("online", changed);
        window.removeEventListener("offline", changed);
      };
    },
    () => navigator.onLine,
    () => true
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const up = () => void sync();
    window.addEventListener("online", up);
    // Send whatever a previous visit left queued, then keep trying while the page is open.
    const first = setTimeout(up, 0);
    const timer = setInterval(up, 30_000);
    return () => {
      window.removeEventListener("online", up);
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [sync]);

  const known = useMemo(() => {
    const all = new Map<string, RecordedEnd>();
    for (const e of [...data.recorded, ...sent, ...queued.filter((q) => !q.refused)]) all.set(key(e), e);
    return [...all.values()];
  }, [data.recorded, sent, queued]);

  const pendingCount = queued.filter((q) => !q.refused).length;
  const refused = queued.filter((q) => q.refused);

  async function saveEnd() {
    if (!entry) return;
    const sorted = sortDesc(arrows);
    if (!scoreEnd(sorted, { arrowsPerEnd: entry.arrowsPerEnd, maxRingValue: 10 }).valid) return;
    await queue.put({
      id: crypto.randomUUID(),
      tournament_id: data.tournamentId,
      division_id: entry.divisionId,
      archer_id: entry.archerId,
      stage: entry.stage,
      match_id: entry.matchId,
      distance_index: entry.distanceIndex,
      end_number: entry.endNumber,
      arrows: sorted,
    });
    setEntry(null);
    setArrows([]);
    await reload();
    void sync();
  }

  const statusBar = (
    <div className="sticky top-0 z-10 -mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-neutral-300 bg-white px-4 py-2">
      <span className={online ? "text-sm" : "text-sm font-semibold text-amber-800"}>
        {!online ? g.offline : pendingCount ? g.queued(pendingCount) : g.allSent}
      </span>
      {pendingCount > 0 && online && (
        <button onClick={() => void sync()} className="min-h-11 rounded border border-neutral-400 px-3 text-sm">
          {g.sendNow}
        </button>
      )}
    </div>
  );

  if (entry) {
    const sorted = sortDesc(arrows);
    const running = totalEnds([sorted], RING).total;
    return (
      <div>
        {statusBar}
        <p className="mt-4 text-lg font-semibold">{entry.name}</p>
        <p className="text-neutral-700">{entry.label}</p>
        <div className="mt-3 flex min-h-14 flex-wrap items-center gap-2 rounded border border-neutral-300 p-2" aria-live="polite">
          {sorted.map((a, i) => (
            <span key={i} className="inline-flex h-11 w-11 items-center justify-center rounded bg-neutral-900 text-lg font-semibold text-white">
              {a}
            </span>
          ))}
          <span className="ml-auto text-lg tabular-nums">{running}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {KEYS.map((k) => (
            <button
              key={String(k)}
              disabled={arrows.length >= entry.arrowsPerEnd}
              onClick={() => setArrows((a) => [...a, k])}
              className="min-h-14 rounded border border-neutral-400 text-xl font-semibold disabled:opacity-40"
            >
              {k}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => setArrows((a) => a.slice(0, -1))} className="min-h-14 rounded border border-neutral-400">
            {g.undo}
          </button>
          <button onClick={() => setArrows([])} className="min-h-14 rounded border border-neutral-400">
            {g.clear}
          </button>
          <button onClick={() => { setEntry(null); setArrows([]); }} className="min-h-14 rounded border border-neutral-400">
            {g.back}
          </button>
        </div>
        <button
          disabled={arrows.length !== entry.arrowsPerEnd}
          onClick={() => void saveEnd()}
          className="mt-3 min-h-14 w-full rounded bg-neutral-900 text-lg text-white disabled:opacity-40"
        >
          {g.saveEnd}
        </button>
      </div>
    );
  }

  const byBale = [...new Set(data.archers.map((a) => a.bale))].sort((a, b) => a - b);

  return (
    <div>
      {statusBar}

      {refused.map((q) => (
        <div key={q.id} className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm">
          <p className="font-semibold">
            {g.refused}: {data.archers.find((a) => a.id === q.archer_id)?.name ?? data.matches.flatMap((m) => m.sides).find((s) => s.archerId === q.archer_id)?.name} ·{" "}
            {g.endLabel(q.end_number)} · {q.arrows.join(" ")}
          </p>
          <p>{q.refused}</p>
          <button onClick={() => void queue.remove(q.id).then(reload)} className="mt-2 min-h-11 rounded border border-red-400 px-3">
            {g.discard}
          </button>
        </div>
      ))}

      {byBale.map((bale) => (
        <section key={bale} className="mt-4">
          <h3 className="font-semibold">{g.target(bale)}</h3>
          {data.archers
            .filter((a) => a.bale === bale)
            .sort((a, b) => a.slot - b.slot)
            .map((a) => {
              const p = archerProgress(a, known);
              return (
                <button
                  key={a.id}
                  disabled={!p.next}
                  onClick={() =>
                    p.next &&
                    setEntry({
                      archerId: a.id,
                      name: a.name,
                      divisionId: a.divisionId,
                      stage: "QUALIFICATION",
                      matchId: null,
                      distanceIndex: p.next.distanceIndex,
                      endNumber: p.next.endNumber,
                      arrowsPerEnd: p.next.d.arrowsPerEnd,
                      label: `${g.endOf(p.next.overall, p.totalCount)} · ${g.distance(p.next.d.distance)}`,
                    })
                  }
                  className="mt-2 flex min-h-14 w-full items-center justify-between gap-2 rounded border border-neutral-300 px-3 text-left disabled:bg-neutral-50"
                >
                  <span>
                    <span className="font-semibold">{SLOT[a.slot - 1] ?? a.slot}</span> · {a.name}
                    <span className="block text-xs text-neutral-600">{a.divisionName}</span>
                  </span>
                  <span className="text-right text-sm">
                    {p.next ? g.endOf(p.next.overall, p.totalCount) : g.done}
                    <span className="block tabular-nums">{g.runningTotal(p.total)}</span>
                  </span>
                </button>
              );
            })}
        </section>
      ))}

      {data.matches.length > 0 && <h3 className="mt-6 font-semibold">{g.matchesTitle}</h3>}
      {data.matches.map((m) => {
        const { spec, state, ends, shootOff } = matchProgress(m, known);
        const setSystem = spec.format === "SET_SYSTEM";
        const decided = state.outcome.decided;
        const needShootOff = !decided && state.outcome.reason === "SHOOT_OFF_REQUIRED";
        const shootOffLevel =
          needShootOff && shootOff[0] && shootOff[1] && totalEnds([shootOff[0]], RING).total === totalEnds([shootOff[1]], RING).total;

        return (
          <section key={m.id} className="mt-3 rounded border border-neutral-300 p-3">
            <p className="text-sm text-neutral-600">
              {m.divisionName} · {m.roundLabel} · {g.target(m.bale)}
            </p>
            <p className="mt-1 font-semibold">
              {setSystem ? g.set(state.setPoints1, state.setPoints2) : g.points(state.total1, state.total2)}
            </p>
            {decided && state.outcome.decided && <p className="text-sm">{g.decided(m.sides[state.outcome.winner - 1].name)}</p>}
            {needShootOff && <p className="text-sm font-semibold text-amber-800">{g.needsShootOff}</p>}

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {m.sides.map((s, i) => {
                const mine = ends[i].length;
                const other = ends[1 - i].length;
                const canEnd = !decided && !needShootOff && mine <= other && mine < spec.maxEnds;
                const canShootOff = needShootOff && !shootOff[i];
                return (
                  <div key={s.archerId}>
                    {canEnd && (
                      <button
                        onClick={() =>
                          setEntry({
                            archerId: s.archerId,
                            name: s.name,
                            divisionId: m.divisionId,
                            stage: "ELIMINATION",
                            matchId: m.id,
                            distanceIndex: 0,
                            endNumber: mine + 1,
                            arrowsPerEnd: spec.arrowsPerEnd,
                            label: `${m.roundLabel} · ${g.endLabel(mine + 1)}`,
                          })
                        }
                        className="min-h-14 w-full rounded border border-neutral-400 px-3 text-left"
                      >
                        {s.name} — {g.endLabel(mine + 1)}
                      </button>
                    )}
                    {canShootOff && (
                      <button
                        onClick={() =>
                          setEntry({
                            archerId: s.archerId,
                            name: s.name,
                            divisionId: m.divisionId,
                            stage: "SHOOT_OFF",
                            matchId: m.id,
                            distanceIndex: 0,
                            endNumber: 1,
                            arrowsPerEnd: spec.shootOffArrows,
                            label: `${m.roundLabel} · ${g.shootOff}`,
                          })
                        }
                        className="min-h-14 w-full rounded border border-amber-500 px-3 text-left"
                      >
                        {g.shootOffFor(s.name)}
                      </button>
                    )}
                    {!canEnd && !canShootOff && <p className="px-1 py-3 text-sm text-neutral-600">{s.name}</p>}
                  </div>
                );
              })}
            </div>

            {shootOffLevel && online && (
              <form action={closestToCentre.bind(null, data.tournamentId)} className="mt-3">
                <p className="font-semibold">{g.closestTitle}</p>
                <p className="text-sm text-neutral-600">{g.closestHelp}</p>
                <input type="hidden" name="match_id" value={m.id} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {m.sides.map((s, i) => (
                    <button key={s.archerId} name="side" value={i + 1} className="min-h-14 rounded border border-neutral-400 px-2">
                      {g.closer(s.name)}
                    </button>
                  ))}
                </div>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
