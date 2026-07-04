import Link from "next/link";
import { createClient } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NotificationBell } from "@/components/connections/notification-bell";
import SignOutButton from "@/components/auth/sign-out-button";
import { NavLinks } from "@/components/layout/nav-links";

export default async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  if (user) {
    const { data } = await getSupabaseAdmin()
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    username = data?.username ?? null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link href={user ? "/home" : "/"} className="text-[15px] font-semibold tracking-tight text-ink">
          GKS Connect
        </Link>

        {user ? (
          <nav className="flex items-center gap-5 text-[14px]">
            <NavLinks />
            <NotificationBell />
            <Link
              href={username ? `/profile/${username}` : "/settings/profile"}
              className="text-muted transition-colors hover:text-ink"
            >
              Profile
            </Link>
            <SignOutButton />
          </nav>
        ) : (
          <nav className="flex items-center gap-4 text-[14px]">
            <Link href="/about" className="text-muted transition-colors hover:text-ink">
              About
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-full bg-ink px-4 font-medium text-white shadow-xs transition-all duration-150 hover:shadow-card active:scale-[0.97]"
            >
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
