import { Notice } from "@/components/Notice";
import { Guide } from "@/components/Guidance";
import { ui } from "@/components/ui";
import { guidance, ROLE_LABEL } from "@/content/guidance";
import { OFFICIALS, requireMembership } from "@/server/auth";
import { siteUrl } from "@/server/supabase";
import { assignTargets, invite, resend, revoke, unassignTarget } from "./actions";

type Role = keyof typeof ROLE_LABEL;

export default async function People({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { tournamentId } = await params;
  const { ok, error } = await searchParams;
  const { supabase, userId, membership } = await requireMembership(tournamentId, OFFICIALS);
  const g = guidance.people;

  const [{ data: members }, { data: assignments }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, user_id, invited_email, role, status, club, expires_at")
      .eq("tournament_id", tournamentId)
      .order("role")
      .order("invited_email"),
    supabase.from("judge_assignments").select("id, membership_id, bale_number").eq("tournament_id", tournamentId).order("bale_number"),
  ]);

  const userIds = (members ?? []).map((m) => m.user_id).filter((id): id is string => !!id);
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const label = (m: { user_id: string | null; invited_email: string }) =>
    (m.user_id && nameOf.get(m.user_id)) || m.invited_email;

  const judges = (members ?? []).filter((m) => m.role === "JUDGE" && m.status === "ACTIVE");
  const judgeName = new Map(judges.map((j) => [j.id, label(j)]));
  const roles: Role[] = membership.role === "ADMIN" ? ["COACH", "JUDGE", "OFFICIAL", "ADMIN"] : ["COACH", "JUDGE", "OFFICIAL"];
  const site = siteUrl();

  return (
    <>
      <Notice ok={ok} error={error} />
      <Guide steps={guidance.guide.people} />

      <h2 className={ui.h2}>{g.membersTitle}</h2>
      <p className={ui.help}>{g.membersHelp}</p>
      <ul className="mt-2">
        {members?.map((m) => (
          <li key={m.id} className="border-b border-neutral-200 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <strong>{label(m)}</strong>
                {m.user_id === userId && <span className="text-neutral-500"> ({g.you})</span>}
                {m.user_id && nameOf.get(m.user_id) && <span className="block text-sm text-neutral-600">{m.invited_email}</span>}
              </span>
              <span className="text-sm">
                {ROLE_LABEL[m.role as Role]}
                {m.club && ` · ${m.club}`} · {g.status[m.status]}
              </span>
            </div>

            {m.status === "INVITED" && (
              <div className="mt-2">
                <p className="text-sm text-neutral-600">{g.expires(m.expires_at.slice(0, 10))}</p>
                <label className="mt-1 block text-sm">
                  {g.inviteLink}
                  <input readOnly value={`${site}/accept/${m.id}`} className={`${ui.input} text-sm`} />
                </label>
              </div>
            )}

            <div className="mt-2 flex gap-2">
              {m.status !== "ACTIVE" && (
                <form action={resend.bind(null, tournamentId)}>
                  <input type="hidden" name="membership_id" value={m.id} />
                  <button className={ui.small}>{g.resend}</button>
                </form>
              )}
              {m.status !== "REVOKED" && m.user_id !== userId && (m.role !== "ADMIN" || membership.role === "ADMIN") && (
                <form action={revoke.bind(null, tournamentId)}>
                  <input type="hidden" name="membership_id" value={m.id} />
                  <button className={ui.small}>{g.revoke}</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h2 className={ui.h2}>{g.inviteTitle}</h2>
      <form action={invite.bind(null, tournamentId)} className={ui.card}>
        <label className={ui.label} htmlFor="email">{g.email}</label>
        <input id="email" name="email" type="email" required autoComplete="off" className={ui.input} />
        <label className={ui.label} htmlFor="role">{g.role}</label>
        <select id="role" name="role" required className={ui.input}>
          {roles.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
        <label className={ui.label} htmlFor="club">{g.club}</label>
        <input id="club" name="club" className={ui.input} />
        <button className={ui.button}>{g.invite}</button>
      </form>

      <h2 className={ui.h2}>{g.judgesTitle}</h2>
      <p className={ui.help}>{g.judgesHelp}</p>
      {!assignments?.length && <p className={ui.help}>{g.noJudges}</p>}
      <ul className="mt-2">
        {assignments?.map((a) => (
          <li key={a.id} className="flex items-center justify-between border-b border-neutral-200 py-2">
            <span>
              {g.target(a.bale_number)} — {judgeName.get(a.membership_id) ?? "—"}
            </span>
            <form action={unassignTarget.bind(null, tournamentId)}>
              <input type="hidden" name="assignment_id" value={a.id} />
              <button className={ui.small}>{g.unassign}</button>
            </form>
          </li>
        ))}
      </ul>

      {judges.length > 0 && (
        <form action={assignTargets.bind(null, tournamentId)} className={ui.card}>
          <label className={ui.label} htmlFor="membership_id">{g.judge}</label>
          <select id="membership_id" name="membership_id" required className={ui.input}>
            {judges.map((j) => (
              <option key={j.id} value={j.id}>{label(j)}</option>
            ))}
          </select>
          <div className="flex gap-3">
            <label className="flex-1">
              <span className={ui.label}>{g.targetFrom}</span>
              <input name="from" type="number" min={1} required inputMode="numeric" className={ui.input} />
            </label>
            <label className="flex-1">
              <span className={ui.label}>{g.targetTo}</span>
              <input name="to" type="number" min={1} inputMode="numeric" className={ui.input} />
            </label>
          </div>
          <button className={ui.button}>{g.assign}</button>
        </form>
      )}
    </>
  );
}
