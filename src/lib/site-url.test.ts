import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveSiteUrl } from "./site-url";

test("an explicit SITE_URL always wins", () => {
  assert.equal(
    resolveSiteUrl({ SITE_URL: "http://localhost:3000", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }),
    "http://localhost:3000"
  );
});

test("Vercel production links to the production domain, not the per-deployment URL", () => {
  assert.equal(
    resolveSiteUrl({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "archery-tms-v2.vercel.app",
      VERCEL_URL: "archery-tms-v2-718wm1vb7-team.vercel.app",
    }),
    "https://archery-tms-v2.vercel.app"
  );
});

test("Vercel previews link to their branch URL", () => {
  assert.equal(
    resolveSiteUrl({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "app-git-feat-team.vercel.app", VERCEL_URL: "app-abc-team.vercel.app" }),
    "https://app-git-feat-team.vercel.app"
  );
});

test("nothing configured is reported as undefined so the caller can fail loudly", () => {
  assert.equal(resolveSiteUrl({}), undefined);
});
