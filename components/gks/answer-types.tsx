import { ShieldCheck, GraduationCap, Users } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Explains what the three kinds of answer actually mean.
 *
 * The point is the last line of each: an applicant needs to know which of
 * these they can rely on and which they can't. Icons stay small and
 * monochrome -- this is a legend, not a feature grid.
 */
const TYPES = [
  {
    icon: ShieldCheck,
    title: "Official guideline",
    body: "Quoted from the GKS guideline for the program you selected, with the source and page. This is the rule.",
  },
  {
    icon: GraduationCap,
    title: "University-specific",
    body: "Shown only where verified university-specific information exists. Requirements differ by university and department.",
  },
  {
    icon: Users,
    title: "Community experience",
    body: "What applicants and scholars reported happening to them. Useful context, never a rule — verify anything that matters.",
  },
];

export function AnswerTypes() {
  return (
    <Card className="p-4">
      <h2 className="text-[13.5px] font-semibold text-ink">Answer types</h2>
      <ul className="mt-3 flex flex-col gap-3.5">
        {TYPES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div>
              <p className="text-[12.5px] font-medium text-ink">{title}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <a
        href="/official-guidelines"
        className="mt-3.5 inline-block border-t border-hairline pt-3 text-[12.5px] font-medium text-primary hover:underline"
      >
        Browse official guidelines
      </a>
    </Card>
  );
}
