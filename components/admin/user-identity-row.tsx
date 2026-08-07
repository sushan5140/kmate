"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { MicroLabel } from "@/components/ui/card";
import { CONTACT_TYPE_ACTION_LABELS, type ContactType } from "@/lib/constants";

export interface Identity {
  id: string;
  username: string | null;
  email: string | null;
}

type ContactsState = "unloaded" | "loading" | { contacts: { type: ContactType; value: string }[] };

// Shared by the ECA/Mistakes/Questions moderation queues (one identity: the
// submitter) and the reports queue (two: reporter + reported user) -- same
// "who is this, and can I see how to reach them" need either way, backed by
// the same admin-only, audit-logged /api/admin/users/[id]/contacts route
// already used on /admin/users.
export function UserIdentityRow({ identity, label, extra }: { identity: Identity; label?: string; extra?: string }) {
  const [contacts, setContacts] = useState<ContactsState>("unloaded");

  async function toggle() {
    if (contacts !== "unloaded") {
      setContacts("unloaded");
      return;
    }
    setContacts("loading");
    try {
      const res = await fetch(`/api/admin/users/${identity.id}/contacts`);
      const data = await res.json();
      setContacts(res.ok ? { contacts: data.contacts } : "unloaded");
    } catch {
      setContacts("unloaded");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
        {label && <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>}
        {identity.username ? (
          <Link href={`/profile/${identity.username}`} className="font-medium text-ink hover:underline">
            @{identity.username}
          </Link>
        ) : (
          <span className="font-medium text-ink">(no username)</span>
        )}
        <span className="text-muted">{identity.email ?? "(no email on file)"}</span>
        {extra && <span className="text-muted">{extra}</span>}
        <button
          type="button"
          onClick={toggle}
          className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-muted hover:text-ink"
        >
          <Lock className="h-3.5 w-3.5" />
          {contacts !== "unloaded" ? "Hide contact vault" : "View contact vault"}
        </button>
      </div>

      {contacts === "loading" && <p className="text-[12px] text-muted">Loading…</p>}

      {contacts !== "unloaded" && contacts !== "loading" && (
        <div className="rounded-xl border border-border bg-canvas/60 p-3">
          <MicroLabel>Contact</MicroLabel>
          {contacts.contacts.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-muted">No contact methods on file.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1">
              {contacts.contacts.map((c) => (
                <li key={c.type} className="text-[13px] text-ink">
                  <span className="font-medium">{CONTACT_TYPE_ACTION_LABELS[c.type]}</span>{" "}
                  <span className="text-muted">· {c.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
