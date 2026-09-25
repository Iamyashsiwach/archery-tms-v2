import Link from "next/link";
import { NavTabs } from "@/components/NavTabs";
import { ui } from "@/components/ui";
import { guidance, ROLE_LABEL } from "@/content/guidance";
import { OFFICIALS, requireMembership } from "@/server/auth";

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { supabase, membership } = await requireMembership(tournamentId);
  const { data: t } = await supabase
    .from("tournaments")
    .select("name, venue, start_date, is_published")
    .eq("id", tournamentId)
    .single();

  const official = OFFICIALS.includes(membership.role);
  const n = guidance.nav;
  const links: [string, string, boolean][] = [
    ["", n.overview, true],
    ["/setup", n.setup, official],
    ["/people", n.people, official],
    ["/roster", n.roster, membership.role === "COACH"],
    ["/allocation", n.allocation, official],
    ["/score", n.score, membership.role === "JUDGE"],
    ["/results", n.results, true],
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <Link href="/" className={`text-sm text-neutral-600 ${ui.link}`}>
        ← {n.home}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className={ui.h1}>{t?.name}</h1>
          <p className="text-sm text-neutral-600">
            {t?.start_date}
            {t?.venue && ` · ${t.venue}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={ui.badge}>{ROLE_LABEL[membership.role]}</span>
          {t?.is_published && (
            <Link href={`/display/${tournamentId}`} className={ui.small}>
              {n.publicPage} ↗
            </Link>
          )}
        </div>
      </div>
      <NavTabs
        base={`/t/${tournamentId}`}
        links={links.filter(([, , shown]) => shown).map(([href, label]) => ({ href, label }))}
      />
      <main className="pb-10">{children}</main>
    </div>
  );
}
