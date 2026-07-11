import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { MoreMenu } from "@/components/layout/more-menu";

// Split out of AppShell so it can be wrapped in <Suspense>: fetching the
// sidebar's username/badge count here previously blocked the whole page
// (children) from rendering until these queries resolved, even though the
// page's own content has nothing to do with them. Streaming this separately
// lets the actual page content fetch and render in parallel instead of
// waiting in line behind the sidebar.
export async function AuthedNav({ userId }: { userId: string }) {
  const admin = getSupabaseAdmin();
  const [{ data: profile }, { count: pendingRequestsCount }] = await Promise.all([
    admin.from("profiles").select("username").eq("id", userId).maybeSingle(),
    admin
      .from("connection_requests")
      .select("id", { count: "exact", head: true })
      .eq("to_user_id", userId)
      .eq("status", "pending"),
  ]);

  const username = profile?.username ?? null;

  return (
    <>
      <Sidebar username={username} pendingRequestsCount={pendingRequestsCount ?? 0} />
      <TopBar username={username} />
      {/* Desktop only -- mobile reaches the same menu via TopBar's own "..." icon. */}
      <div className="fixed right-4 top-4 z-40 hidden md:block">
        <MoreMenu username={username} />
      </div>
    </>
  );
}
