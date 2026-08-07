"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserRound, X } from "lucide-react";
import { ContactsStep, type ContactValue } from "@/components/onboarding/contacts-step";
import { Button } from "@/components/ui/button";

// KMate has no in-app messaging -- a connection is only actually reachable
// through a contact method they've saved here. `hasContacts` is computed
// server-side (see app/home/page.tsx) rather than read from the
// notifications table, so this stays accurate even if the sign-in nag (see
// app/auth/callback/route.ts) was already dismissed/read: the banner and
// modal track the real state of the wallet, not whether a notification row
// happens to still be unread.
export function ContactWalletNudge({ hasContacts, username }: { hasContacts: boolean; username: string | null }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(!hasContacts);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [contacts, setContacts] = useState<ContactValue[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hasContacts) return null;

  const contactsTabHref = username ? `/profile/${username}?tab=contacts` : "/home";

  async function save() {
    if (contacts.length === 0) {
      setError("Add at least one contact method to continue.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts }),
      });
      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setModalOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {!bannerDismissed && (
        <div className="flex items-start gap-3 rounded-2xl bg-primary/5 px-5 py-4 ring-1 ring-primary/20">
          <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-primary">Your contact wallet is empty</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink">
              KMate doesn&apos;t have in-app messaging -- when you connect with another applicant, a saved
              contact method is the only way they can actually reach you. Add at least one.
            </p>
            <Link
              href={contactsTabHref}
              className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline"
            >
              Add a contact
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss"
            className="text-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card">
            <p className="text-[12px] font-medium uppercase tracking-wide text-primary">Before you continue</p>
            <h3 className="mt-2 text-[16px] font-semibold text-ink">Add a way for people to reach you</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              KMate doesn&apos;t provide messaging between applicants -- once you connect with someone,
              they&apos;ll only be able to reach you through a contact method you add here. Even a single
              one is fine.
            </p>

            <div className="mt-4">
              <ContactsStep contacts={contacts} onChange={setContacts} />
            </div>

            {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[13px] text-muted hover:text-ink"
              >
                Not now
              </button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save contact"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
