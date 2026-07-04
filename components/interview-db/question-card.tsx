import Link from "next/link";
import { Card } from "@/components/ui/card";
import { UpvoteButton } from "@/components/interview-db/upvote-button";
import { ReportBlockMenu } from "@/components/profile/report-block-menu";
import { QUESTION_CATEGORY_LABELS, type QuestionCategory } from "@/lib/constants";

export interface QuestionCardData {
  id: string;
  text: string;
  category: QuestionCategory;
  upvotesCount: number;
  upvotedByMe: boolean;
  status: "approved" | "pending" | "rejected";
}

export function QuestionCard({ question }: { question: QuestionCardData }) {
  return (
    <Card className="flex items-center justify-between gap-4">
      <div>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {QUESTION_CATEGORY_LABELS[question.category]}
          {question.status !== "approved" && ` · ${question.status}`}
        </span>
        <Link href={`/interview-db/${question.id}`} className="mt-1 block text-[14.5px] text-ink hover:underline">
          {question.text}
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <UpvoteButton questionId={question.id} initialCount={question.upvotesCount} initialUpvoted={question.upvotedByMe} />
        <ReportBlockMenu targetType="question" targetId={question.id} />
      </div>
    </Card>
  );
}
