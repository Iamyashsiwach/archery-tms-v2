/// <reference path="./.sst/platform/config.d.ts" />

// Region matches the Supabase project (us-east-1 / iad1), so every query a
// function makes stays in one region.
export default $config({
  app(input) {
    return {
      name: "archery-tms",
      home: "aws",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: input?.stage === "production",
      providers: { aws: { region: "us-east-1" } },
    };
  },
  async run() {
    const supabaseUrl = new sst.Secret("SupabaseUrl");
    const supabaseKey = new sst.Secret("SupabasePublishableKey");
    const supabaseSecret = new sst.Secret("SupabaseSecretKey");
    const siteUrl = new sst.Secret("SiteUrl");

    const web = new sst.aws.Nextjs("Web", {
      environment: {
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl.value,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabaseKey.value,
        SUPABASE_SECRET_KEY: supabaseSecret.value,
        SITE_URL: siteUrl.value,
      },
      // 300 s covers work that continues in after() (PDF import) once the
      // response has gone; CloudFront still cuts a response itself at 60 s.
      server: { memory: "1024 MB", timeout: "300 seconds", runtime: "nodejs24.x" },
    });

    // The free Supabase plan pauses a project after a week without activity.
    new sst.aws.CronV2("KeepAlive", {
      schedule: "rate(1 day)",
      function: {
        handler: "infra/keepalive.handler",
        runtime: "nodejs24.x",
        environment: { SUPABASE_URL: supabaseUrl.value, SUPABASE_KEY: supabaseKey.value },
      },
    });

    return { url: web.url };
  },
});
