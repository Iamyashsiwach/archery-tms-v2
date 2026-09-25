import "server-only";

import type { OpenDivision } from "@/lib/roster-import";
import type { createClient } from "./supabase";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Individual divisions a coach can register into right now, with their category attributes. */
export async function openDivisions(supabase: Client, tournamentId: string): Promise<OpenDivision[]> {
  const { data } = await supabase
    .from("divisions")
    .select("id, categories(bow_style, gender, age_class)")
    .eq("tournament_id", tournamentId)
    .eq("phase", "REGISTRATION")
    .eq("event_kind", "INDIVIDUAL")
    .overrideTypes<{ id: string; categories: { bow_style: string; gender: string; age_class: string } }[], { merge: false }>();
  return (data ?? []).map((d) => ({ id: d.id, ...d.categories }));
}
