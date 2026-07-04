import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Inbox, UserRound, ArrowRight } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, MicroLabel } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import type { Track } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Home — GKS Connect",
};

export default async function HomePage() {
  const user = await requireOnboarded("/home");

  const { data: profile } = await getSupabaseAdmin()
    .from("profiles")
    .select("username, track, major")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Welcome back{profile?.username ? `, @${profile.username}` : ""}
          </h1>
          {profile?.track && (
            <div className="mt-2">
              <TrackBadge track={profile.track as Track} />
            </div>
          )}
        </div>
      </div>

      <Link href="/discover" className="mt-8 block">
        <Card
          interactive
          className="flex items-center justify-between gap-4 bg-ink text-white"
        >
          <div>
            <MicroLabel className="text-white/50">Discover</MicroLabel>
            <h2 className="mt-1 text-[17px] font-semibold">Find applicants like you</h2>
            <p className="mt-1 text-[13.5px] text-white/65">
              Filter by major, university, and application year.
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
            <ArrowRight className="h-4 w-4" />
          </div>
        </Card>
      </Link>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Link href="/interview-db">
          <Card interactive className="h-full">
            <BookOpen className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Interview DB</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Prep with common questions and private draft answers.
            </p>
          </Card>
        </Link>
        <Link href="/requests">
          <Card interactive className="h-full">
            <Inbox className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Requests</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Review incoming and outgoing connections.
            </p>
          </Card>
        </Link>
        <Link href={`/profile/${profile?.username ?? ""}`}>
          <Card interactive className="h-full">
            <UserRound className="h-4 w-4 text-muted" />
            <h2 className="mt-3 text-[14.5px] font-semibold text-ink">Your profile</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              See what other applicants see.
            </p>
          </Card>
        </Link>
      </div>
    </main>
  );
}
