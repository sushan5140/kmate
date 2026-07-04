"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser-client";

export function useGoogleSignIn(next = "/home") {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (signInError) {
        setError("Couldn't start sign-in. Please try again.");
        setLoading(false);
      }
      // On success the browser is redirected to Google, so no further local
      // state change is needed here.
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  return { signIn, loading, error };
}
