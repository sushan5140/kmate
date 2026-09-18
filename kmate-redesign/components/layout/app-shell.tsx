import { Suspense } from "react";
import { headers } from "next/headers";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import { AuthedNav } from "@/components/layout/authed-nav";

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

  if (!userId) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Suspense fallback={<NavSkeleton />}>
        <AuthedNav userId={userId} />
      </Suspense>
      <div className="min-h-screen md:pl-[248px]">{children}</div>
    </div>
  );
}
