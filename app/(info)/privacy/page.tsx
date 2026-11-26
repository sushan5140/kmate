import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy & data practices — KMate",
  description:
    "What KMate collects, who can see applicant information, how guest mode works, and what resetting a profile does.",
};

const SECTIONS = [
  {
    title: "Information you choose to provide",
    body: [
      "After Google sign-in, KMate uses Supabase authentication to manage your session. A profile can include your username, bio, GKS program and route, major, application year and target universities.",
      "You can also add optional external contact methods, contribute questions or preparation tips, draft interview answers, send messages, and submit reports.",
    ],
  },
  {
    title: "What other applicants can see",
    body: [
      "Your username and the applicant details on your profile can be discoverable to other KMate users. Do not put your phone number, email, address or other sensitive information in your public bio.",
      "External contact methods are stored separately from the public profile. Under KMate's current access rules, an accepted connection can access the contact methods you supplied. Even if the current interface mainly offers in-app messaging, do not assume accepted contacts are inaccessible. Remove optional contact methods if you do not want them shared with connections.",
      "Accepting a request, revoking a connection and blocking someone change who can interact with you inside KMate. Information someone already copied or saved cannot be recalled.",
    ],
  },
  {
    title: "How information is used",
    body: [
      "KMate uses account and application details to personalize eligibility context, document checklists, matching, interview preparation and community features. Moderation reports and activity may be reviewed to enforce community guidelines.",
      "Some AI-assisted features send submitted questions or relevant context to external AI providers. The optional camera and voice mock-interview flow uses browser permissions and a user-provided Gemini API key for selected requests to Google's service. Check the tool's instructions before enabling camera, microphone or third-party AI access.",
    ],
  },
  {
    title: "Guest mode and browser data",
    body: [
      "Guest preview uses a temporary browser cookie lasting up to four hours and does not create a normal KMate login. It is intended for browsing only, not saving private application data.",
      "Some application checklist progress is stored in your own browser's local storage. Clearing browser storage removes that local copy. Changing devices or browsers may not carry local progress across.",
      "Professor Outreach records are stored in browser-local storage under your KMate account. The tracker does not send records to the server or other applicants. They are not encrypted, do not sync across devices, and may remain after sign-out or profile reset. Use the tracker’s Clear all outreach records action or clear site storage to remove the local copy.",
      "Like most hosted websites, KMate and its infrastructure providers process the technical request and session information needed to serve the site. KMate uses Google sign-in, Supabase and Vercel infrastructure.",
    ],
  },
  {
    title: "Resetting your profile is not full account deletion",
    body: [
      "The current Reset profile action clears selected profile fields, university choices, optional contact methods and saved draft answers, and revokes accepted connections. It releases your username and signs out of KMate if the operation succeeds.",
      "Application stage tracker entries are self-reported, stored under your account in this browser, not encrypted or synced across devices, and are not sent to the server. They may remain after profile reset or sign-out. Clear them inside the stage tracker or clear browser site storage.",
      "It does not delete your Google-linked Supabase authentication identity. Past community contributions, conversations, reports, system logs or locally stored browser progress may remain. Resetting is not an erasure of all information and must not be described as one.",
      "No universal deletion or retention deadline is promised here because KMate has not implemented a verified full-account erasure workflow. Use the in-app Report a problem option to raise a private data-handling concern while signed in.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <article className="space-y-7 text-[14px] leading-relaxed text-ink">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Privacy & data practices</p>
        <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
          Know what you share before you join.
        </h1>
        <p className="mt-3 text-muted">
          Updated 26 November 2026. This page describes the current implementation; it is not a promise that all
          stored records can already be deleted automatically.
        </p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2 rounded-2xl border border-hairline bg-white p-4 sm:p-5">
          <h2 className="text-[16px] font-semibold text-ink">{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="text-[13.5px] leading-relaxed text-muted">{paragraph}</p>
          ))}
        </section>
      ))}

      <p className="text-[13.5px] leading-relaxed text-muted">
        Want to explore first? <Link className="font-semibold text-primary underline underline-offset-2" href="/guest/start">Open read-only guest mode</Link>.
        For expected community behavior, read the{" "}
        <Link className="font-semibold text-primary underline underline-offset-2" href="/guidelines">
          community guidelines
        </Link>.
      </p>
    </article>
  );
}
