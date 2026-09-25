import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { guidance } from "@/content/guidance";
import { requireUser } from "@/server/auth";
import { signOut } from "../../auth/actions";
import { acceptInvite } from "./actions";

const button = "mt-4 w-full min-h-14 rounded text-lg";

export default async function AcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { membershipId } = await params;
  const { error } = await searchParams;
  if (!z.uuid().safeParse(membershipId).success) notFound();

  const { supabase, userId } = await requireUser(`/accept/${membershipId}`);

  // Before acceptance RLS hides the row from the invitee, so finding it here
  // means this user has already joined.
  const { data: joined } = await supabase
    .from("memberships")
    .select("role, tournaments(id, name)")
    .eq("id", membershipId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-medium">{guidance.accept.title}</h1>

      {joined ? (
        <>
          <p className="mt-4 text-lg">{guidance.accept.joined(joined.tournaments?.name ?? "", joined.role)}</p>
          <Link href={`/t/${joined.tournaments?.id}`} className={`${button} inline-flex items-center justify-center bg-neutral-900 px-5 text-white`}>
            {guidance.accept.open}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-4 text-neutral-700">{guidance.accept.body}</p>
          {error && (
            <p role="alert" className="mt-3 text-red-700">
              {guidance.accept.errors[error] ?? guidance.accept.errors.failed}
            </p>
          )}
          <form action={acceptInvite}>
            <input type="hidden" name="membershipId" value={membershipId} />
            <button type="submit" className={`${button} bg-neutral-900 text-white`}>
              {guidance.accept.button}
            </button>
          </form>
          {error === "invite_not_found" && (
            <form action={signOut}>
              <button type="submit" className={`${button} border border-neutral-400`}>
                {guidance.accept.signOut}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
