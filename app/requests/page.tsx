import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { RequestsList, type RequestRow } from "@/components/connections/requests-list";

export const metadata: Metadata = {
  title: "Requests — KMate",
};

interface ConnectionRequestRow {
  id: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  note: string | null;
  created_at: string;
  from_user_id: string;
  to_user_id: string;
  from_profile: { id: string; username: string | null };
  to_profile: { id: string; username: string | null };
}

export default async function RequestsPage() {
  const user = await requireOnboarded("/requests");
  const admin = getSupabaseAdmin();

  const { data: rows } = await admin
    .from("connection_requests")
    .select(
      `id, status, note, created_at, from_user_id, to_user_id,
       from_profile:profiles!connection_requests_from_user_id_fkey ( id, username ),
       to_profile:profiles!connection_requests_to_user_id_fkey ( id, username )`
    )
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const all = (rows ?? []) as unknown as ConnectionRequestRow[];

  const incoming: RequestRow[] = all
    .filter((r) => r.to_user_id === user.id && r.status === "pending")
    .map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
      otherUser: { id: r.from_profile.id, username: r.from_profile.username },
    }));

  const outgoing: RequestRow[] = all
    .filter((r) => r.from_user_id === user.id)
    .map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
      otherUser: { id: r.to_profile.id, username: r.to_profile.username },
    }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Requests</h1>
      <div className="mt-6">
        <RequestsList incoming={incoming} outgoing={outgoing} />
      </div>
    </main>
  );
}
