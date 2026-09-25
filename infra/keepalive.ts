export async function handler() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/public_tournaments?select=id&limit=1`, {
    headers: { apikey: process.env.SUPABASE_KEY! },
  });
  if (!res.ok) throw new Error(`Supabase keep-alive failed: ${res.status} ${await res.text()}`);
}
