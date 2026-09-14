import { ShieldCheck, Sparkles, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";

const TYPES = [
  {
    icon: ShieldCheck,
    title: "Official guideline",
    body: "The evidence layer comes from the official GKS guideline for the selected program, with source and page information.",
  },
  {
    icon: Sparkles,
    title: "Guideline-grounded AI",
    body: "Grok explains only the retrieved official guideline evidence. Applicant anecdotes and community RAG are not sent to the model.",
  },
  {
    icon: GraduationCap,
    title: "University-specific rules",
    body: "A university may add its own requirements or deadlines. When the national guideline does not answer that point, KMate should say so rather than guess.",
  },
];

export function AnswerTypes() {
  return (
    <Card className="p-4">
      <h2 className="text-[13.5px] font-semibold text-ink">How answers work</h2>
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
