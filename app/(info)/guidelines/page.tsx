import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Community guidelines — GKS Connect",
};

export default function GuidelinesPage() {
  return (
    <article className="flex flex-col gap-4 text-[14.5px] leading-relaxed text-ink">
      <h1 className="text-[22px] font-semibold">Community guidelines</h1>

      <p>GKS Connect exists to help applicants prepare together, not to be a social app.</p>

      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>No harassment, hate speech, or unwanted contact. Use Report or Block if someone crosses a line.</li>
        <li>No soliciting money or paid &quot;consulting&quot; -- this is a free peer community, not a marketplace.</li>
        <li>Don&apos;t impersonate NIIED, the Korean government, embassy staff, or university admissions.</li>
        <li>Share accurate information in the interview question bank and extracurricular tips -- don&apos;t post misleading advice.</li>
        <li>
          Contact info you share after connecting with someone is yours to manage -- but once shared, it can&apos;t be
          un-shared. Only connect with people you actually want to exchange contact details with.
        </li>
        <li>Many GKS-U applicants are minors (typically 17-19). Keep interactions respectful and study-focused.</li>
      </ul>

      <p className="text-muted">
        Breaking these guidelines may result in your submissions being removed, other users blocking you, or
        (for serious or repeated violations) account restrictions.
      </p>
    </article>
  );
}
