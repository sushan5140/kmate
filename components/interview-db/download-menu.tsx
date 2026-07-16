"use client";

import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import type { PdfVariant } from "@/lib/pdf/interview-questions-pdf";

export function DownloadMenu({ totalApproved, draftedCount }: { totalApproved: number; draftedCount: number }) {
  const [open, setOpen] = useState(false);
  const unansweredCount = totalApproved - draftedCount;

  const options: { variant: PdfVariant; label: string }[] = [
    { variant: "all", label: `All ${totalApproved} questions` },
    { variant: "answered", label: `Answered only (${draftedCount})` },
    { variant: "unanswered", label: `Unanswered only (${unansweredCount})` },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-canvas"
      >
        <Download className="h-3.5 w-3.5" />
        Download
        <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>
      {open && (
        <>
          {/* Click-outside catcher -- consistent with the pattern used elsewhere (e.g. ReportBlockMenu doesn't need one since it has a submit step, but this is a plain link list). */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-white py-1 shadow-card">
            {options.map((opt) => (
              <a
                key={opt.variant}
                href={`/api/questions/download?variant=${opt.variant}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-[13px] text-ink hover:bg-canvas"
              >
                {opt.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
