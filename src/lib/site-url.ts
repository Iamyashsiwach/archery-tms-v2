/**
 * The public address of this deployment, which sign-in emails link back to.
 * SITE_URL wins when set (local dev, a custom domain before Vercel knows it).
 * On Vercel it can be left unset: production uses the project's production
 * domain and previews use their branch URL, both provided by Vercel itself.
 */
export function resolveSiteUrl(env: Record<string, string | undefined>): string | undefined {
  if (env.SITE_URL) return env.SITE_URL;
  const host =
    env.VERCEL_ENV === "production"
      ? env.VERCEL_PROJECT_PRODUCTION_URL
      : (env.VERCEL_BRANCH_URL ?? env.VERCEL_URL);
  return host ? `https://${host}` : undefined;
}
