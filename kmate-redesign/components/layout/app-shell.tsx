import { Suspense } from "react";
import { headers } from "next/headers";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { AuthedNav } from "@/components/layout/authed-nav";

// Matches Sidebar's/TopBar's own dimensions so there's no layout shift when
// the real (data-dependent) nav swaps in a beat later.
function NavSkeleton() {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[210px] border-r border-hairline bg-surface md:block" />
      <header className="sticky top-0 z-30 h-14 border-b border-hairline bg-surface/90 backdrop-blur-md md:hidden" />
    </>
  );
}

export default async function AppShell({ children }: { children: React.ReactNode }) {
  // proxy.ts already validated the session and forwards the user id via this
  // header -- reading it is free, unlike calling supabase.auth.getUser()
  // again here, which used to cost a second full round-trip to Supabase Auth
  // on every single page load (see proxy.ts for the full explanation).
  const userId = (await headers()).get("x-kmate-user-id");

  if (!userId) {
    return (
      <>
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<NavSkeleton />}>
        <AuthedNav userId={userId} />
      </Suspense>
      <div className="flex-1 md:pl-[210px]">{children}</div>
    </>
  );
}
