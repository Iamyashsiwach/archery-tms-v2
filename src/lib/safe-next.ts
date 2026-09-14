/**
 * Where to send someone after signing in. Only paths on this site are
 * honoured, so a crafted link cannot bounce a freshly signed-in user to
 * another domain. Accepts a bare path or a full URL on this site, because the
 * sign-in email passes the redirect URL through whole.
 */
export function safeNext(next: unknown, siteUrl: string): string {
  if (typeof next !== "string" || next === "") return "/";
  try {
    const site = new URL(siteUrl);
    const url = new URL(next, site);
    return url.origin === site.origin ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}
