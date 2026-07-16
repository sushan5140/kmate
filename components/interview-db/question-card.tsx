import { Card } from "@/components/ui/card";
import { QuestionVoteButtons } from "@/components/interview-db/question-vote-buttons";
import { QuestionReportMenu } from "@/components/interview-db/question-report-menu";
import { DraftAnswerEditor } from "@/components/interview-db/draft-answer-editor";
import { cn } from "@/lib/cn";
import { QUESTION_CATEGORY_LABELS, QUESTION_CATEGORY_BADGE_CLASS, type QuestionCategory } from "@/lib/constants";

export interface QuestionCardData {
  id: string;
  text: string;
  category: QuestionCategory;
  upvotesCount: number;
  downvotesCount: number;
  voteType: "up" | "down" | null;
  status: "approved" | "pending" | "rejected";
  draftContent: string;
}

export function QuestionCard({
  index,
  question,
  onDraftContentChange,
}: {
  index: number;
  question: QuestionCardData;
  onDraftContentChange?: (hasContent: boolean) => void;
}) {
  return (
    <QuestionReportMenu questionId={question.id}>
      <Card className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0 text-[12px] font-semibold tabular-nums text-muted">
              {String(index).padStart(2, "0")}
            </span>
            <div>
              {question.status !== "approved" && (
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">{question.status}</span>
              )}
              <p className="text-[14.5px] font-medium leading-snug text-ink">{question.text}</p>
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide",
              QUESTION_CATEGORY_BADGE_CLASS[question.category]
            )}
          >
            {QUESTION_CATEGORY_LABELS[question.category]}
          </span>
        </div>

        <DraftAnswerEditor
          questionId={question.id}
          initialContent={question.draftContent}
          rows={3}
          onContentChange={onDraftContentChange}
        />

        <div className="flex items-center gap-2 border-t border-hairline pt-3">
          <QuestionVoteButtons
            questionId={question.id}
            initialUpvotes={question.upvotesCount}
            initialDownvotes={question.downvotesCount}
            initialVoteType={question.voteType}
          />
        </div>
      </Card>
    </QuestionReportMenu>
  );
}
