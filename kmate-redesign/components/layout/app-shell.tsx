import { Suspense } from "react";
import { headers } from "next/headers";
import { AuthedNav } from "@/components/layout/authed-nav";
import { DEMO_USER_ID } from "@/lib/demo-mode";

function NavSkeleton() {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-hairline bg-surface/70 md:block" />
      <header className="sticky top-0 z-30 h-[58px] border-b border-hairline bg-surface/88 backdrop-blur-xl md:hidden" />
    </>
  );
}

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const userId = (await headers()).get("x-kmate-user-id");

  return (
    <div className="min-h-screen">
      <Suspense fallback={<NavSkeleton />}>
        <AuthedNav userId={userId ?? DEMO_USER_ID} />
      </Suspense>
      <div className="min-h-screen md:pl-[248px]">{children}</div>
    </div>
  );
}
