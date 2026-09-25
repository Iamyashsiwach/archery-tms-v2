import Link from "next/link";
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
      <Link href="/" className="text-sm underline">
        ← {n.home}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">{t?.name}</h1>
      <p className="text-sm text-neutral-600">
        {ROLE_LABEL[membership.role]} · {t?.start_date}
        {t?.venue && ` · ${t.venue}`}
      </p>
      <nav className="mt-3 flex flex-wrap gap-2 border-b border-neutral-300 pb-3">
        {links
          .filter(([, , shown]) => shown)
          .map(([href, label]) => (
            <Link key={href} href={`/t/${tournamentId}${href}`} className={ui.small}>
              {label}
            </Link>
          ))}
        {t?.is_published && (
          <Link href={`/display/${tournamentId}`} className={ui.small}>
            {n.publicPage}
          </Link>
        )}
      </nav>
      <main className="pb-10">{children}</main>
    </div>
  );
}
