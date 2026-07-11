import type { LucideIcon } from "lucide-react";
import { Home, Users, MessageSquare, ListChecks, Award, AlertTriangle, Inbox } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only "requests" has a live badge today; keyed rather than a bare number so app-shell can pass one counts object. */
  badgeKey?: "requests";
}

// Single source of truth for the primary nav -- both the desktop sidebar and
// the mobile top bar read from this array rather than duplicating the list.
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Users },
  { href: "/interview-db", label: "Interview DB", icon: MessageSquare },
  { href: "/timeline", label: "Timeline", icon: ListChecks },
  { href: "/eca", label: "Extracurriculars", icon: Award },
  { href: "/mistakes", label: "Mistakes", icon: AlertTriangle },
  { href: "/requests", label: "Requests", icon: Inbox, badgeKey: "requests" },
];
