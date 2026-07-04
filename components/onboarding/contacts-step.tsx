"use client";

import { CONTACT_TYPES, CONTACT_TYPE_LABELS } from "@/lib/constants";

export interface ContactValue {
  type: (typeof CONTACT_TYPES)[number];
  value: string;
}

interface ContactsStepProps {
  contacts: ContactValue[];
  onChange: (contacts: ContactValue[]) => void;
}

export function ContactsStep({ contacts, onChange }: ContactsStepProps) {
  function setValue(type: (typeof CONTACT_TYPES)[number], value: string) {
    const rest = contacts.filter((c) => c.type !== type);
    onChange(value ? [...rest, { type, value }] : rest);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">
        Kept private -- only visible to people once you accept a connection request.
        All optional.
      </p>
      {CONTACT_TYPES.map((type) => (
        <div key={type} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[13px] text-muted">
            {CONTACT_TYPE_LABELS[type]}
          </span>
          <input
            type="text"
            value={contacts.find((c) => c.type === type)?.value ?? ""}
            onChange={(e) => setValue(type, e.target.value)}
            placeholder={type === "other" ? "e.g. email" : "@handle"}
            className="h-9 w-full rounded-lg border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-primary"
          />
        </div>
      ))}
    </div>
  );
}
