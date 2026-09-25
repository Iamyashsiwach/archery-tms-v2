import { Notice } from "@/components/Notice";
import { ui } from "@/components/ui";
import { CATEGORY_OPTIONS, guidance, PHASE_LABEL } from "@/content/guidance";
import type { Phase } from "@/lib/phases";
import { MATCH_SPECS, ROUNDS } from "@/lib/rules/catalogue";
import { OFFICIALS, requireMembership } from "@/server/auth";
import { addCategory, removeCategory, saveBracketSize, saveDetails } from "./actions";

type Category = {
  id: string;
  display_name: string;
  round_code: string;
  match_format_code: string;
  divisions: { id: string; phase: Phase; bracket_size: number | null }[];
};

const BRACKETS = [64, 32, 16, 8, 4];

function Select({ name, options, label }: { name: string; options: Record<string, string>; label: string }) {
  return (
    <>
      <label className={ui.label} htmlFor={name}>{label}</label>
      <select id={name} name={name} required className={ui.input}>
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>
    </>
  );
}

function BracketOptions() {
  const g = guidance.setup;
  return (
    <>
      <option value="">{g.bracketAuto}</option>
      {BRACKETS.map((n) => (
        <option key={n} value={n}>{g.bracketTop(n)}</option>
      ))}
    </>
  );
}

export default async function Setup({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { tournamentId } = await params;
  const { ok, error } = await searchParams;
  const { supabase } = await requireMembership(tournamentId, OFFICIALS);
  const g = guidance.setup;

  const [{ data: t }, { data: categories }] = await Promise.all([
    supabase.from("tournaments").select("name, venue, start_date, end_date, rules_reference, is_published").eq("id", tournamentId).single(),
    supabase
      .from("categories")
      .select("id, display_name, round_code, match_format_code, divisions(id, phase, bracket_size)")
      .eq("tournament_id", tournamentId)
      .order("display_name")
      .overrideTypes<Category[], { merge: false }>(),
  ]);

  const rounds = Object.fromEntries(Object.values(ROUNDS).map((r) => [r.code, r.name]));
  const formats = Object.fromEntries(
    Object.values(MATCH_SPECS).filter((m) => m.eventKind === "INDIVIDUAL").map((m) => [m.code, m.name])
  );

  return (
    <>
      <Notice ok={ok} error={error} />

      <h2 className={ui.h2}>{g.detailsTitle}</h2>
      <form action={saveDetails.bind(null, tournamentId)} className={ui.card}>
        <label className={ui.label} htmlFor="name">{g.name}</label>
        <input id="name" name="name" required minLength={3} defaultValue={t?.name} className={ui.input} />
        <label className={ui.label} htmlFor="venue">{g.venue}</label>
        <input id="venue" name="venue" defaultValue={t?.venue ?? ""} className={ui.input} />
        <label className={ui.label} htmlFor="start_date">{g.startDate}</label>
        <input id="start_date" name="start_date" type="date" required defaultValue={t?.start_date} className={ui.input} />
        <label className={ui.label} htmlFor="end_date">{g.endDate}</label>
        <input id="end_date" name="end_date" type="date" defaultValue={t?.end_date ?? ""} className={ui.input} />
        <label className={ui.label} htmlFor="rules_reference">{g.rulesReference}</label>
        <input id="rules_reference" name="rules_reference" defaultValue={t?.rules_reference ?? ""} className={ui.input} />
        <label className="mt-4 flex items-start gap-2">
          <input type="checkbox" name="is_published" defaultChecked={t?.is_published} className="mt-1 h-5 w-5" />
          <span>
            {g.published}
            <span className={`block ${ui.help}`}>{g.publishedHelp}</span>
          </span>
        </label>
        <button className={ui.button}>{g.save}</button>
      </form>

      <h2 className={ui.h2}>{g.categoriesTitle}</h2>
      <p className={ui.help}>{g.categoriesHelp}</p>
      {!categories?.length && <p className={ui.help}>{g.noCategories}</p>}
      {categories?.map((c) => {
        const division = c.divisions[0];
        const editable = c.divisions.every((d) => d.phase === "SETUP");
        return (
          <div key={c.id} className={ui.card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong>{c.display_name}</strong>
              {division && <span className="text-sm text-neutral-600">{PHASE_LABEL[division.phase]}</span>}
            </div>
            <p className={ui.help}>
              {ROUNDS[c.round_code]?.name ?? c.round_code} · {MATCH_SPECS[c.match_format_code]?.name ?? c.match_format_code}
            </p>
            {editable && division && (
              <div className="flex flex-wrap items-end gap-3">
                <form action={saveBracketSize.bind(null, tournamentId)} className="flex items-end gap-2">
                  <input type="hidden" name="division_id" value={division.id} />
                  <label className="text-sm">
                    {g.bracketSize}
                    <select name="bracket_size" defaultValue={division.bracket_size ?? ""} className={ui.input}>
                      <BracketOptions />
                    </select>
                  </label>
                  <button className={ui.small}>{g.saveBracket}</button>
                </form>
                <form action={removeCategory.bind(null, tournamentId)}>
                  <input type="hidden" name="category_id" value={c.id} />
                  <button className={ui.small}>{g.remove}</button>
                </form>
              </div>
            )}
          </div>
        );
      })}

      <form action={addCategory.bind(null, tournamentId)} className={ui.card}>
        <Select name="bow_style" label={g.bowStyle} options={CATEGORY_OPTIONS.bow_style} />
        <Select name="gender" label={g.gender} options={CATEGORY_OPTIONS.gender} />
        <Select name="age_class" label={g.ageClass} options={CATEGORY_OPTIONS.age_class} />
        <label className={ui.label} htmlFor="display_name">{g.displayName}</label>
        <input id="display_name" name="display_name" className={ui.input} />
        <Select name="round_code" label={g.round} options={rounds} />
        <Select name="match_format_code" label={g.matchFormat} options={formats} />
        <label className={ui.label} htmlFor="bracket_size">{g.bracketSize}</label>
        <select id="bracket_size" name="bracket_size" className={ui.input}>
          <BracketOptions />
        </select>
        <button className={ui.button}>{g.add}</button>
      </form>
    </>
  );
}
