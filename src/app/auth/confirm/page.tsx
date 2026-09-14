import { guidance } from "@/content/guidance";
import { confirmSignIn } from "../actions";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; next?: string; failed?: string }>;
}) {
  const { token_hash, next = "/", failed } = await searchParams;

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-medium">{guidance.confirm.title}</h1>

      {failed || !token_hash ? (
        <>
          <p role="alert" className="mt-4 text-red-700">
            {guidance.confirm.failed}
          </p>
          <a href={`/login?next=${encodeURIComponent(next)}`} className="mt-4 block py-3 underline">
            {guidance.confirm.retry}
          </a>
        </>
      ) : (
        <form action={confirmSignIn} className="mt-4">
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="next" value={next} />
          <p className="text-neutral-700">{guidance.confirm.body}</p>
          <button type="submit" className="mt-4 w-full min-h-14 rounded bg-neutral-900 text-lg text-white">
            {guidance.confirm.button}
          </button>
        </form>
      )}
    </main>
  );
}
