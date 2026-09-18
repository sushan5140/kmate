import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth-server";
import { AdminNav } from "@/components/admin/admin-nav";
import { UserManagement } from "@/components/admin/user-management";

export const metadata: Metadata = {
  title: "User Management — KMate",
};

export default async function AdminUsersPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">User management</h1>
      <p className="mt-1 text-[13.5px] text-muted">Change a user&apos;s track, or grant both-track access.</p>
      <div className="mt-4">
        <AdminNav active="/admin/users" />
      </div>
      <UserManagement />
    </main>
  );
}
