import { ui } from "@/components/ui";
import { guidance } from "@/content/guidance";
import { ROUND_LABEL, type RoundCode } from "@/lib/rules/brackets";

export type StandingView = {
  archer_id: string;
  name: string;
  club: string | null;
  rank: number | null;
  total: number;
  tens: number;
  xs: number;
  tie: boolean;
  medal: string | null;
};

export type MatchView = {
  id: string;
  round: RoundCode;
  match_number: number;
  seed1: number | null;
  seed2: number | null;
  a1: string | null;
  a2: string | null;
  a1_id: string | null;
  a2_id: string | null;
  winner: string | null;
  set_points_1: number;
  set_points_2: number;
  total_1: number;
  total_2: number;
  decided_by: string | null;
  status: string;
};

const ROUND_ORDER: RoundCode[] = ["R64", "R32", "R16", "QF", "SF", "BRONZE", "FINAL"];

/** Qualification standings; shared by the members' results page and the public page. */
export function StandingsTable({ rows }: { rows: StandingView[] }) {
  const g = guidance.results;
  if (rows.length === 0) return <p className={ui.help}>{g.none}</p>;
  return (
    <div className="overflow-x-auto">
      <table className={ui.table}>
        <thead>
          <tr>
            <th className={ui.th}>{g.rank}</th>
            <th className={ui.th}>{g.archer}</th>
            <th className={`${ui.th} text-right`}>{g.total}</th>
            <th className={`${ui.th} text-right`}>{g.tens}</th>
            <th className={`${ui.th} text-right`}>{g.xs}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.archer_id}>
              <td className={ui.td}>
                {r.rank ?? "–"}
                {r.tie && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">{g.tie}</span>}
              </td>
              <td className={ui.td}>
                {r.name}
                {r.medal && <span className="ml-2 text-sm font-semibold">{g.medal[r.medal]}</span>}
                {r.club && <span className="block text-xs text-neutral-600">{r.club}</span>}
              </td>
              <td className={`${ui.td} text-right tabular-nums`}>{r.total}</td>
              <td className={`${ui.td} text-right tabular-nums`}>{r.tens}</td>
              <td className={`${ui.td} text-right tabular-nums`}>{r.xs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Bracket({ matches }: { matches: MatchView[] }) {
  const g = guidance.results;
  const rounds = ROUND_ORDER.filter((r) => matches.some((m) => m.round === r));
  return (
    <div className="mt-2 grid gap-4 sm:grid-cols-2">
      {rounds.map((round) => (
        <div key={round}>
          <h4 className="text-sm font-semibold">{ROUND_LABEL[round]}</h4>
          <ul>
            {matches
              .filter((m) => m.round === round)
              .sort((a, b) => a.match_number - b.match_number)
              .map((m) => {
                const sets = m.set_points_1 + m.set_points_2 > 0;
                const side = (name: string | null, id: string | null, seed: number | null, score: number) => (
                  <div className={`flex justify-between gap-2 ${m.winner && m.winner === id ? "font-semibold" : ""}`}>
                    <span>
                      {seed && <span className="text-xs text-neutral-500">{seed}. </span>}
                      {name ?? (m.decided_by === "BYE" ? g.bye : "—")}
                    </span>
                    {m.status !== "PENDING" && m.decided_by !== "BYE" && <span className="tabular-nums">{score}</span>}
                  </div>
                );
                return (
                  <li key={m.id} className="mt-2 rounded border border-neutral-200 p-2 text-sm">
                    {side(m.a1, m.a1_id, m.seed1, sets ? m.set_points_1 : m.total_1)}
                    {side(m.a2, m.a2_id, m.seed2, sets ? m.set_points_2 : m.total_2)}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
