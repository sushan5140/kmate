import Link from "next/link";
import { Card } from "@/components/ui/card";

export interface SentRequestRow {
  id: string;
  createdAt: string;
  otherUser: { id: string; username: string | null };
}

export function SentRequestsList({ items }: { items: SentRequestRow[] }) {
  if (items.length === 0) {
    return <p className="text-[13.5px] text-muted">You haven&apos;t sent any requests yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((r) => (
        <Card key={r.id} className="flex items-center justify-between gap-3">
          <Link href={`/profile/${r.otherUser.username}`} className="font-medium text-ink hover:underline">
            @{r.otherUser.username}
          </Link>
          <span className="text-[13px] text-muted">Waiting for a reply</span>
        </Card>
      ))}
    </div>
  );
}
