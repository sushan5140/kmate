import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  MessageSquare,
  Award,
  AlertTriangle,
  FileText,
  BarChart3,
  Stamp,
  Megaphone,
  GraduationCap,
  MessageCircle,
  Bot,
  HelpCircle,
  ClipboardCheck,
  FolderCheck,
} from "lucide-react";

export type NavGroup = "overview" | "application" | "resources" | "preparation" | "community";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  badgeKey?: "requests";
}

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  overview: "Overview",
  application: "My Application",
  resources: "GKS Resources",
  preparation: "Preparation",
  community: "Community",
};

export const NAV_GROUP_ORDER: NavGroup[] = [
  "overview",
  "application",
  "resources",
  "preparation",
  "community",
];

// One source of truth for desktop and mobile navigation. Grouping keeps the
// product from reading like a flat feature inventory as KMate grows.
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: Home, group: "overview" },

  { href: "/application-readiness", label: "Application Readiness", icon: FolderCheck, group: "application" },
  { href: "/requirement-checker", label: "Requirement Checker", icon: ClipboardCheck, group: "application" },

  { href: "/gks", label: "GKS Assistant", icon: Bot, group: "resources" },
  { href: "/official-guidelines", label: "Official Guidelines", icon: FileText, group: "resources" },
  { href: "/apostille", label: "Apostille Guide", icon: Stamp, group: "resources" },
  { href: "/notices", label: "Official Notices", icon: Megaphone, group: "resources" },
  { href: "/scholarships", label: "Scholarships", icon: GraduationCap, group: "resources" },

  { href: "/interview-db", label: "Interview DB", icon: MessageSquare, group: "preparation" },
  { href: "/mistakes", label: "Mistakes", icon: AlertTriangle, group: "preparation" },
  { href: "/eca", label: "Extracurriculars", icon: Award, group: "preparation" },
  { href: "/faq-trends", label: "FAQ Trends", icon: HelpCircle, group: "preparation" },

  { href: "/messages", label: "Messages", icon: MessageCircle, group: "community" },
  { href: "/requests", label: "Connections", icon: Users, group: "community", badgeKey: "requests" },
  { href: "/scholar-stats", label: "Scholar Stats", icon: BarChart3, group: "community" },
];

export function navItemsByGroup(group: NavGroup) {
  return NAV_ITEMS.filter((item) => item.group === group);
}
