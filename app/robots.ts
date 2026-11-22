import type { MetadataRoute } from "next";

// Only the public introduction and community information are intended for
// search indexing. Private dashboards and account flows should stay out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/guest/",
        "/home",
        "/login",
        "/onboarding/",
        "/messages",
        "/requests",
        "/profile/",
        "/settings/",
        "/application-readiness",
        "/requirement-checker",
        "/official-guidelines",
        "/interview-db",
        "/scholarships",
        "/gks",
        "/notices",
        "/apostille",
        "/eca",
        "/mistakes",
        "/faq-trends",
        "/scholar-stats",
      ],
    },
    sitemap: "https://kmate.vercel.app/sitemap.xml",
  };
}
