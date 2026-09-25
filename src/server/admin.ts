import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseConfig } from "./supabase";

/**
 * Bypasses RLS. Only ./derived.ts may import this, and only after the caller
 * has passed requireMembership: it writes what the rules engine computes
 * (standings, match states) and moves divisions between phases.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set. See .env.local.example.");
  return createClient<Database>(supabaseConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
