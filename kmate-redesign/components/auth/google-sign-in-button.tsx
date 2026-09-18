"use client";

import { useGoogleSignIn } from "@/lib/hooks/use-google-sign-in";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 7.1 29.6 5 24 5c-7.8 0-14.5 4.4-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-2.1 14.2-5.5l-6.6-5.4C29.6 34.9 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.4 39.6 16.1 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.4C39.9 37.1 44 31.5 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({ next = "/home" }: { next?: string }) {
  const { signIn, loading, error } = useGoogleSignIn(next);

  return (
    <div className="flex flex-col items-center gap-3">
      <Button
        variant="secondary"
        size="md"
        onClick={signIn}
        disabled={loading}
        className="w-full"
      >
        <GoogleIcon />
        {loading ? "Redirecting…" : "Sign in with Google"}
      </Button>
      {error && <p className="text-[13px] text-muted">{error}</p>}
    </div>
  );
}
