import Link from "next/link";
import { Card, MicroLabel } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import { ConnectButton } from "@/components/ui/connect-button";
import type { Track } from "@/lib/constants";

export interface ProfileCardData {
  id: string;
  username: string;
  bio: string | null;
  track: Track;
  major: string | null;
  applicationYear: number | null;
  priorityBadge?: number | null;
}

export function ProfileCard({ profile }: { profile: ProfileCardData }) {
  return (
    <Card interactive className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold " +
              (profile.track === "gks_u" ? "bg-gks-u/10 text-gks-u" : "bg-gks-g/10 text-gks-g")
            }
          >
            {profile.username.slice(0, 1).toUpperCase()}
          </div>
          <Link href={`/profile/${profile.username}`} className="font-semibold text-ink hover:underline">
            @{profile.username}
          </Link>
        </div>
        <TrackBadge track={profile.track} />
      </div>

      {profile.bio && <p className="line-clamp-2 text-[13px] text-muted">{profile.bio}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <MicroLabel>Major</MicroLabel>
          <p className="mt-0.5 truncate text-[13px] text-ink">{profile.major ?? "—"}</p>
        </div>
        <div>
          <MicroLabel>Year</MicroLabel>
          <p className="mt-0.5 text-[13px] text-ink">{profile.applicationYear ?? "—"}</p>
        </div>
      </div>

      {profile.priorityBadge && (
        <span className="w-fit rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
          #{profile.priorityBadge} choice
        </span>
      )}

      <Link href={`/profile/${profile.username}`}>
        <ConnectButton className="w-full" />
      </Link>
    </Card>
  );
}
