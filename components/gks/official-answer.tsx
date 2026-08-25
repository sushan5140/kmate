"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck, ExternalLink } from "lucide-react";
import type { AskResult } from "@/components/gks/types";

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/**
 * The official layer -- shown first and given the most visual authority, but
 * through weight and a quiet badge rather than colour or decoration.
 *
 * Everything here is quoted guideline text with a citation. When retrieval
 * finds nothing relevant, this says so plainly instead of falling back to the
 * community layer, because an applicant reading an official-looking section
 * must never be shown something that isn't official.
 */
export function OfficialAnswer({ result }: { result: AskResult }) {
  const [showAll, setShowAll] = useState(false);
  const official = result.evidence.official;
  const unsupported = result.coverage?.unsupported_labels ?? [];
  const shown = showAll ? official : official.slice(0, 3);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Official answer</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <ShieldCheck className="h-3 w-3" />
            Official
          </span>
        </div>
        <p className="text-[12px] text-muted">Based on official GKS guideline sources</p>
      </div>

      {official.length === 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-gold/10 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <div>
            <p className="text-[13.5px] font-medium text-ink">Official verification pending</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              The guideline for this program doesn&apos;t appear to address this directly. Anything below is
              applicant experience, not a rule — check with your embassy or university.
            </p>
          </div>
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-3.5">
            {shown.map((item, i) => (
              <li key={i} className="border-t border-hairline pt-3.5 first:border-t-0 first:pt-0">
                <p className="text-[14px] leading-relaxed text-ink">{item.claim}</p>
                {item.extraction_quality === "needs_review" && (
                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold">
                    <AlertTriangle className="h-3 w-3" />
                    Table layout uncertain — check the source page
                  </p>
                )}
                {(item.source_title || item.source_url) && (
                  <p className="mt-1.5 text-[12px] text-muted">
                    {item.source_url ? (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {item.source_title ?? item.source_url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      item.source_title
                    )}
                    {item.cycle ? ` · ${item.cycle}` : ""}
                    {item.page ? ` · page ${item.page}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {!showAll && official.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mt-3 text-[12.5px] font-medium text-primary hover:underline"
            >
              Show {official.length - 3} more official excerpt{official.length - 3 === 1 ? "" : "s"}
            </button>
          )}
        </>
      )}

      {/* Retrieval is topical, so related guideline text comes back even when
          the guideline says nothing about what was actually asked. Say so
          explicitly rather than letting the section imply a rule exists. */}
      {official.length > 0 && unsupported.length > 0 && (
        <div className="mt-3.5 flex items-start gap-2 rounded-xl bg-gold/10 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="text-[13px] leading-relaxed text-ink">
            The selected guideline does not appear to explicitly state {formatList(unsupported)} in the
            retrieved sections. Treat anything below as applicant experience, not a confirmed rule.
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-hairline pt-3.5">
        <a
          href="/official-guidelines"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
        >
          View official guidelines
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </section>
  );
}
