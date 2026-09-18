import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The one shared back-navigation affordance for pages reached by drilling in
 * from a list/tab/filtered view (currently: /profile/[username] reached from
 * a Connections tab). `href` must be a literal internal path+query the
 * caller already knows how to reconstruct -- this component doesn't infer
 * anything, it just renders the link.
 */
export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}
