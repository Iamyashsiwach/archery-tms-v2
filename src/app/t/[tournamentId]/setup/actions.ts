"use server";

import { z } from "zod";
import { CATEGORY_OPTIONS } from "@/content/guidance";
import { MATCH_SPECS, ROUNDS } from "@/lib/rules/catalogue";
import { ActionError, OFFICIALS, refuse, requireMembership, run } from "@/server/auth";

const page = (id: string) => `/t/${id}/setup`;
const optional = z.string().trim().max(200).optional();

const Details = z.object({
  name: z.string().trim().min(3).max(120),
  venue: optional,
  start_date: z.iso.date(),
  end_date: z.union([z.iso.date(), z.literal("")]).optional(),
  rules_reference: optional,
});

export async function saveDetails(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const input = Details.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");

    const { error } = await supabase
      .from("tournaments")
      .update({
        name: input.data.name,
        venue: input.data.venue || null,
        start_date: input.data.start_date,
        end_date: input.data.end_date || null,
        rules_reference: input.data.rules_reference || null,
        is_published: form.get("is_published") === "on",
      })
      .eq("id", tournamentId);
    if (error) refuse(error, []);
    return "details_saved";
  });
}

const keys = <T extends object>(o: T) => Object.keys(o) as [string, ...string[]];
const BracketSize = z.union([z.literal(""), z.coerce.number().int().refine((n) => [2, 4, 8, 16, 32, 64].includes(n))]);

const NewCategory = z.object({
  bow_style: z.enum(keys(CATEGORY_OPTIONS.bow_style)),
  gender: z.enum(keys(CATEGORY_OPTIONS.gender)),
  age_class: z.enum(keys(CATEGORY_OPTIONS.age_class)),
  display_name: optional,
  round_code: z.enum(keys(ROUNDS)),
  match_format_code: z.enum(
    Object.values(MATCH_SPECS).filter((m) => m.eventKind === "INDIVIDUAL").map((m) => m.code) as [string, ...string[]]
  ),
  bracket_size: BracketSize.optional(),
});

/**
 * A category and its individual division, together. Team and mixed-team
 * divisions wait on the open question of how team targets are judged.
 */
export async function addCategory(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const input = NewCategory.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");
    const c = input.data;
    const o = CATEGORY_OPTIONS;
    const name =
      c.display_name ||
      `${o.bow_style[c.bow_style as keyof typeof o.bow_style]} ${o.gender[c.gender as keyof typeof o.gender]} ${o.age_class[c.age_class as keyof typeof o.age_class]}`;

    const { data: category, error } = await supabase
      .from("categories")
      .insert({
        tournament_id: tournamentId,
        bow_style: c.bow_style,
        gender: c.gender,
        age_class: c.age_class,
        display_name: name,
        round_code: c.round_code,
        match_format_code: c.match_format_code,
      })
      .select("id")
      .single();
    if (error?.code === "23505") throw new ActionError("duplicate_category");
    if (error) refuse(error, []);

    const { error: divisionError } = await supabase.from("divisions").insert({
      tournament_id: tournamentId,
      category_id: category.id,
      event_kind: "INDIVIDUAL",
      bracket_size: c.bracket_size ? Number(c.bracket_size) : null,
    });
    if (divisionError) {
      await supabase.from("categories").delete().eq("id", category.id);
      refuse(divisionError, []);
    }
    return "category_added";
  });
}

export async function removeCategory(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const id = z.uuid().safeParse(form.get("category_id"));
    if (!id.success) throw new ActionError("not_found");

    // RLS refuses once any of its divisions has left SETUP; that shows as 0 rows.
    const { count, error } = await supabase
      .from("categories")
      .delete({ count: "exact" })
      .eq("id", id.data)
      .eq("tournament_id", tournamentId);
    if (error) refuse(error, []);
    if (!count) throw new ActionError("category_in_use");
    return "category_removed";
  });
}

export async function saveBracketSize(tournamentId: string, form: FormData) {
  await run(page(tournamentId), async () => {
    const { supabase } = await requireMembership(tournamentId, OFFICIALS);
    const id = z.uuid().safeParse(form.get("division_id"));
    const size = BracketSize.safeParse(form.get("bracket_size"));
    if (!id.success || !size.success) throw new ActionError("invalid_input");

    const { count, error } = await supabase
      .from("divisions")
      .update({ bracket_size: size.data === "" ? null : size.data }, { count: "exact" })
      .eq("id", id.data)
      .eq("tournament_id", tournamentId);
    if (error) refuse(error, []);
    if (!count) throw new ActionError("category_in_use");
    return "bracket_saved";
  });
}
