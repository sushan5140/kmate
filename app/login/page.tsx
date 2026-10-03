import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { sanitizeNext } from "@/lib/auth/safe-next";
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

  // startsWith("/") used to be the whole check, which accepts "//evil.com" --
  // a protocol-relative URL that begins with a slash and still leaves the
  // origin. sanitizeNext applies the full rule set instead.
  const safeNext = sanitizeNext(next);

  const user = await getAuthenticatedUser();
  if (user) {
    redirect(safeNext);
  }

  return (
    <main className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-6">
      <div className="grid-texture pointer-events-none absolute inset-0" aria-hidden />
      <Card className="relative w-full max-w-sm text-center">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink">Sign in to KMate</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          We use Google sign-in only. Your profile and contact info stay private
          until you choose to share them.
        </p>

        <div className="mt-6 space-y-3">
          <GoogleSignInButton next={safeNext} />
          <a
            href={"/guest/start?next=" + encodeURIComponent(safeNext)}
            className="inline-flex h-10 w-full items-center justify-center rounded-full bg-ink px-4 text-[13.5px] font-medium text-white shadow-xs transition-all hover:shadow-card active:scale-[0.98]"
          >
            Try as guest
          </a>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Guest Mode is temporary and read-only. No KMate account is created.
          </p>
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
