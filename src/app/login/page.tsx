import { guidance } from "@/content/guidance";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-medium">{guidance.login.title}</h1>
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </main>
  );
}
