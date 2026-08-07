"use client";

import { TrackBadge } from "@/components/ui/track-badge";
import { CONTACT_TYPE_LABELS, type Track } from "@/lib/constants";
import type { SelectedUniversity } from "@/components/onboarding/university-picker";
import type { ContactValue } from "@/components/onboarding/contacts-step";

interface ReviewStepProps {
  username: string;
  bio: string;
  track: Track;
  major: string;
  universities: SelectedUniversity[];
  applicationYear: number;
  contacts: ContactValue[];
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="shrink-0 text-[13px] text-muted">{label}</span>
      <span className="text-right text-[13.5px] font-medium text-ink">{children}</span>
    </div>
  );
}

export function ReviewStep({
  username,
  bio,
  track,
  major,
  universities,
  applicationYear,
  contacts,
}: ReviewStepProps) {
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-hairline pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-bold text-white">
          {username ? username[0]?.toUpperCase() : "?"}
        </div>
        <div>
          <p className="text-[15px] font-semibold text-ink">@{username}</p>
          {bio ? (
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{bio}</p>
          ) : (
            <p className="mt-0.5 text-[12.5px] italic text-muted">No bio yet</p>
          )}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-hairline">
        <Row label="Track">
          <TrackBadge track={track} />
        </Row>
        <Row label="Major">{major}</Row>
        <Row label="Universities">
          <span className="flex flex-col items-end gap-0.5">
            {universities.map((u, i) => (
              <span key={u.universityId}>
                {i + 1}. {u.name}
              </span>
            ))}
          </span>
        </Row>
        <Row label="Application year">{applicationYear}</Row>
        <Row label="Contacts">
          {contacts.length > 0 ? (
            <span className="flex flex-col items-end gap-0.5">
              {contacts.map((c) => (
                <span key={c.type}>{CONTACT_TYPE_LABELS[c.type]}</span>
              ))}
            </span>
          ) : (
            <span className="italic text-muted">None added</span>
          )}
        </Row>
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        You can change any of this later from Settings — including your username,
        track, universities, and contacts.
      </p>
    </div>
  );
}
