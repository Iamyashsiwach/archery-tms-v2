import Link from "next/link";
import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { guidance, ROLE_LABEL } from "@/content/guidance";
import { createAnonClient, createClient } from "@/server/supabase";
import { createTournament, saveProfile } from "./actions";
import { signOut } from "./auth/actions";

type Mine = { role: keyof typeof ROLE_LABEL; tournaments: { id: string; name: string; venue: string | null; start_date: string } };

export default async function Home({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const g = guidance.home;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();

  if (!auth) {
    const { data: events } = await createAnonClient()
      .from("public_tournaments")
      .select("id, name, venue, start_date")
      .order("start_date", { ascending: false })
      .limit(20);

    return (
      <main className={ui.page}>
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight">{g.heroTitle}</h1>
          <p className="mt-2 text-neutral-700">{g.intro}</p>
          <Link href="/login" className={ui.button}>
            {g.signIn}
          </Link>
        </section>

        <h2 className={ui.h2}>{g.howTitle}</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {g.how.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm font-semibold">
                {i + 1}
              </span>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className={ui.help}>{s.body}</p>
            </li>
          ))}
        </ol>

        <h2 className={ui.h2}>{g.publicEvents}</h2>
        {events?.length ? (
          <ul className="mt-3 space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/display/${e.id}`} className="block rounded-xl border border-neutral-200 bg-white p-4 shadow-sm hover:border-neutral-400">
                  <span className="font-medium">{e.name}</span>
                  <span className="block text-sm text-neutral-600">
                    {e.start_date} {e.venue && `· ${e.venue}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={ui.help}>{g.noPublicEvents}</p>
        )}
      </main>
    );
  }

  const userId = auth.claims.sub;
  const [{ data: profile }, { data: mine }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
    supabase
      .from("memberships")
      .select("role, tournaments(id, name, venue, start_date)")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .overrideTypes<Mine[], { merge: false }>(),
  ]);
  const tournaments = (mine ?? []).sort((a, b) => b.tournaments.start_date.localeCompare(a.tournaments.start_date));

  return (
    <main className={ui.page}>
      <div className="flex items-center justify-between">
        <h1 className={ui.h1}>{g.yourTournaments}</h1>
        <form action={signOut}>
          <button className={ui.small}>{guidance.nav.signOut}</button>
        </form>
      </div>
      <Notice ok={ok} error={error} />

      {tournaments.length ? (
        <ul className="mt-4 space-y-2">
          {tournaments.map(({ role, tournaments: t }) => (
            <li key={t.id}>
              <Link
                href={`/t/${t.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm hover:border-neutral-400"
              >
                <span className="min-w-0">
                  <span className="block text-lg font-medium">{t.name}</span>
                  <span className="block text-sm text-neutral-600">
                    {t.start_date} {t.venue && `· ${t.venue}`}
                  </span>
                </span>
                <span className={ui.badge}>{ROLE_LABEL[role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <section className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sky-950">
          <h2 className="font-semibold">{g.startTitle}</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
            {g.start.slice(profile ? 1 : 0).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      {!profile && (
        <section className={ui.card}>
          <h2 className="font-semibold">{g.profileTitle}</h2>
          <p className={ui.help}>{g.profileHelp}</p>
          <form action={saveProfile}>
            <label className={ui.label} htmlFor="full_name">{g.nameLabel}</label>
            <input id="full_name" name="full_name" required minLength={2} autoComplete="name" className={ui.input} />
            <label className={ui.label} htmlFor="phone">{g.phoneLabel}</label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" className={ui.input} />
            <button className={ui.button}>{g.saveProfile}</button>
          </form>
        </section>
      )}

      <section className={ui.card}>
        <h2 className="font-semibold">{g.createTitle}</h2>
        <p className={ui.help}>{g.createHelp}</p>
        <form action={createTournament}>
          <label className={ui.label} htmlFor="name">{g.tournamentName}</label>
          <input id="name" name="name" required minLength={3} className={ui.input} />
          <label className={ui.label} htmlFor="venue">{g.venue}</label>
          <input id="venue" name="venue" className={ui.input} />
          <label className={ui.label} htmlFor="start_date">{g.startDate}</label>
          <input id="start_date" name="start_date" type="date" required className={ui.input} />
          <label className={ui.label} htmlFor="end_date">{g.endDate}</label>
          <input id="end_date" name="end_date" type="date" className={ui.input} />
          <button className={ui.button}>{g.create}</button>
        </form>
      </section>
    </main>
  );
}
