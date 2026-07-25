import type { LucideIcon } from "lucide-react";
import { Home, Users, MessageSquare, ListChecks, Award, AlertTriangle, FileText, BarChart3 } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only "requests" has a live badge today; keyed rather than a bare number so app-shell can pass one counts object. */
  badgeKey?: "requests";
}

// Single source of truth for the primary nav -- both the desktop sidebar and
// the mobile top bar read from this array rather than duplicating the list.
// "Connections" (still /requests -- the route people already have linked
// and bookmarked) now covers what used to be two separate destinations,
// Discover and Requests, as tabs on one page.
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/interview-db", label: "Interview DB", icon: MessageSquare },
  { href: "/timeline", label: "Timeline", icon: ListChecks },
  { href: "/eca", label: "Extracurriculars", icon: Award },
  { href: "/mistakes", label: "Mistakes", icon: AlertTriangle },
  { href: "/official-guidelines", label: "Official Guidelines", icon: FileText },
  { href: "/scholar-stats", label: "Scholar Stats", icon: BarChart3 },
  { href: "/requests", label: "Connections", icon: Users, badgeKey: "requests" },
];
