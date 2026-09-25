import { guidance } from "@/content/guidance";
import { LoginForm } from "./login-form";

// `supabase start` catches every email in its local inbox instead of delivering it.
const localInbox = /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
  ? "http://127.0.0.1:54324"
  : undefined;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{guidance.login.title}</h1>
        <LoginForm next={typeof next === "string" ? next : "/"} localInbox={localInbox} />
      </div>
    </main>
  );
}
