import type { MetadataRoute } from "next";
import { PUBLIC_GUIDE_PATHS } from "@/lib/marketing/gks-guides";

// Public, genuinely accessible pages only. Authenticated/guest preview tools
// are deliberately absent from the public sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://kmate.vercel.app";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...PUBLIC_GUIDE_PATHS.map(path => ({ url: base + path, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/guidelines`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
