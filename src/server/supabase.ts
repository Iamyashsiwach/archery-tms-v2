import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Copy .env.local.example to .env.local.");
  return { url, key };
}

export function siteUrl() {
  const url = process.env.SITE_URL;
  if (!url) throw new Error("SITE_URL is not set. Copy .env.local.example to .env.local.");
  return url;
}

/**
 * A client acting as the signed-in user, so RLS applies to everything it does.
 * The service-role client lives in ./admin.ts and is used only by ./derived.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseConfig();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        // Server Components cannot write cookies. That is fine: src/proxy.ts
        // refreshes the session on every request before rendering starts.
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {}
      },
    },
  });
}

/**
 * No session, no cookies: what an anonymous visitor sees. Used by the public
 * display pages, which must stay cacheable, and to email sign-in links to
 * someone other than the person clicking (an invite).
 */
export function createAnonClient() {
  const { url, key } = supabaseConfig();
  return createPlainClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
