"use server";

import { z } from "zod";
import { ActionError, refuse, requireUser, run } from "@/server/auth";

const Profile = z.object({
  full_name: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(20).optional(),
});

export async function saveProfile(form: FormData) {
  await run("/", async () => {
    const { supabase, userId } = await requireUser("/");
    const input = Profile.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");

    const { error } = await supabase
      .from("profiles")
      .upsert({ id: userId, full_name: input.data.full_name, phone: input.data.phone || null });
    if (error) refuse(error, []);
    return "profile_saved";
  });
}

const NewTournament = z.object({
  name: z.string().trim().min(3).max(120),
  venue: z.string().trim().max(120).optional(),
  start_date: z.iso.date(),
  end_date: z.union([z.iso.date(), z.literal("")]).optional(),
});

export async function createTournament(form: FormData) {
  await run("/", async () => {
    const { supabase } = await requireUser("/");
    const input = NewTournament.safeParse(Object.fromEntries(form));
    if (!input.success) throw new ActionError("invalid_input");

    const { data: id, error } = await supabase.rpc("create_tournament", {
      p_name: input.data.name,
      p_start_date: input.data.start_date,
      p_venue: input.data.venue || undefined,
      p_end_date: input.data.end_date || undefined,
    });
    if (error) refuse(error, []);
    return { to: `/t/${id}/setup` };
  });
}
