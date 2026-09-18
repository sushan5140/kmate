import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { MoreMenu } from "@/components/layout/more-menu";
import { isDemoUserId } from "@/lib/demo-mode";

// Split out of AppShell so it can be wrapped in <Suspense>: fetching the
// sidebar's username/badge count here previously blocked the whole page
// (children) from rendering until these queries resolved, even though the
// page's own content has nothing to do with them. Streaming this separately
// lets the actual page content fetch and render in parallel instead of
// waiting in line behind the sidebar.
export async function AuthedNav({ userId }: { userId: string }) {
  const admin = getSupabaseAdmin();
  const demoMode = isDemoUserId(userId);
  const [user, profileResult, requestsResult] = await Promise.all([
    getAuthenticatedUser(),
    demoMode
      ? Promise.resolve({ data: null as { username: string | null } | null })
      : admin.from("profiles").select("username").eq("id", userId).maybeSingle(),
    demoMode
      ? Promise.resolve({ count: 0 })
      : admin
          .from("connection_requests")
          .select("id", { count: "exact", head: true })
          .eq("to_user_id", userId)
          .eq("status", "pending"),
  ]);
  const profile = profileResult.data;
  const pendingRequestsCount = requestsResult.count;

  const username = profile?.username ?? null;
  // Same isAuthorizedAdmin() check every admin route enforces -- is_admin
  // alone isn't enough to show the link, the signed-in email must also
  // match ADMIN_EMAIL. Keeps the nav link itself from ever pointing a
  // second is_admin account toward pages it will just 404 on.
  const isAdmin = demoMode ? false : await isAuthorizedAdmin(user);

  return (
    <>
      <Sidebar username={username} pendingRequestsCount={pendingRequestsCount ?? 0} isAdmin={isAdmin} demoMode={demoMode} />
      <TopBar username={username} isAdmin={isAdmin} demoMode={demoMode} />
      {/* Desktop only -- mobile reaches the same menu via TopBar's own "..." icon. */}
      <div className="fixed right-4 top-4 z-40 hidden md:block">
        <MoreMenu username={username} isAdmin={isAdmin} demoMode={demoMode} />
      </div>
    </>
  );
}
