import { editionMatches, editionNotice, GUIDELINE_EDITIONS, OFFICIAL_NOTICE_BOARD, type GuidelineProgram } from "@/lib/gks/guideline-editions";

export function EditionNotice({ program, target }: { program: GuidelineProgram; target: string | null }) {
  return <aside className="mt-4 rounded-xl border border-hairline bg-canvas p-3.5 text-[13px] leading-relaxed text-ink">
    <p className="font-semibold">{editionMatches(program, target) ? "Intake-matched reference" : "Historical or unconfirmed intake · reference only"}</p>
    <p className="mt-1">{editionNotice(program, target)}</p>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      <a className="font-medium text-primary underline" href={GUIDELINE_EDITIONS[program].notice} target="_blank" rel="noopener noreferrer">Source edition</a>
      <a className="font-medium text-primary underline" href={OFFICIAL_NOTICE_BOARD} target="_blank" rel="noopener noreferrer">Check latest official notices</a>
    </div>
  </aside>;
}
