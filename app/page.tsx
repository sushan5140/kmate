import { ResearchInterviewApp } from "@/components/research-interview/research-interview-app";

export default function ResearchInterviewStandalonePage() {
  return (
    <main className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mb-6 border-b border-hairline pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Research Interview Lab</p>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">
          Paper-grounded Professor Interview
        </h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-muted">
          Upload the original research paper and your presentation, then defend the work in an adaptive professor-style interview. The paper is the authoritative source; the presentation stays under your control while you answer.
        </p>
      </div>

      <ResearchInterviewApp />
    </main>
  );
}
