import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/auth-server";
import GoogleSignInButton from "@/components/auth/google-sign-in-button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in — KMate",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(next && next.startsWith("/") ? next : "/home");
  }

  const safeNext = next && next.startsWith("/") ? next : "/home";

  return (
    <main className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-6">
      <div className="grid-texture pointer-events-none absolute inset-0" aria-hidden />
      <Card className="relative w-full max-w-sm text-center">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">Sign in to KMate</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          We use Google sign-in only. Your profile and contact info stay private
          until you choose to share them.
        </p>

        <div className="mt-6">
          <GoogleSignInButton next={safeNext} />
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[13px] text-muted">
            Sign-in didn&apos;t go through. Please try again.
          </p>
        )}
      </Card>
    </main>
  );
}
