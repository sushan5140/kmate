"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";

export function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function deleteAccount() {
    setLoading(true);
    try {
      await fetch("/api/account/delete", { method: "POST" });
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
        Delete account
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-canvas p-4">
      <p className="text-[13px] text-ink">
        This clears your profile, username, universities, and contact info. Your
        username becomes available for anyone (including you) to claim again.
        This can&apos;t be undone.
      </p>
      <div className="mt-3 flex gap-2">
        <Button variant="danger" size="sm" onClick={deleteAccount} disabled={loading}>
          {loading ? "Deleting…" : "Yes, delete my account"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
