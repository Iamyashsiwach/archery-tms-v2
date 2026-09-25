import { guidance } from "@/content/guidance";

/** The outcome of the last form action, carried in ?ok= or ?error=. */
export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-red-800">
        {guidance.errors[error] ?? guidance.errors.failed}
      </p>
    );
  }
  if (ok && guidance.ok[ok]) {
    return (
      <p role="status" className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-green-800">
        {guidance.ok[ok]}
      </p>
    );
  }
  return null;
}
