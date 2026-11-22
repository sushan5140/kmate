"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";

/**
 * Kept under the old component name for import compatibility.
 * The backend performs a PROFILE RESET (not auth-account erasure).
 */
export function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resetProfile() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", { method: "POST" });
      if (!response.ok) {
        setError(response.status === 429
          ? "Too many attempts. Please try again later."
          : "Profile reset did not complete. Some earlier changes may already have happened; check your profile before trying again.");
        return;
      }

      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError("Your profile was reset, but sign-out failed. Please sign out manually.");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't reach KMate. Reset was not confirmed. Please check your profile before retrying.");
    } finally {
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <p className="text-[12.5px] leading-relaxed text-muted">
          Resetting your KMate profile is not the same as deleting your Google-linked sign-in.
          {" "}<Link href="/privacy" className="font-semibold text-primary underline underline-offset-2">
            Read what remains
          </Link>.
        </p>
        <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
          Reset my KMate profile
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-canvas p-4">
      <h3 className="text-[14px] font-semibold text-ink">Reset your KMate profile?</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-ink">
        This clears selected profile details, university choices, optional contact methods
        and saved interview drafts, and revokes accepted connections.
        Your username may become available to others.
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
        This does not erase your login identity, community contributions, conversations,
        moderation records or browser-local checklist progress. This action cannot restore
        the cleared fields. <Link href="/privacy" className="text-primary underline underline-offset-2">
          Full data practices
        </Link>.
      </p>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-red-600">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="danger" size="sm" onClick={resetProfile} disabled={loading}>
          {loading ? "Resetting…" : "Yes, reset my profile"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setConfirming(false); setError(null); }} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
