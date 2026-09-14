"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarCheck2,
  Check,
  ClipboardList,
  FileSearch,
  RefreshCw,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const ITEMS = [
  {
    id: "documents",
    icon: FileSearch,
    title: "Document compliance checked",
    body: "I reviewed required certificates, translations, first-round scan requirements, and post-Round-1 authentication requirements.",
  },
  {
    id: "consistency",
    icon: Scale,
    title: "Application consistency checked",
    body: "My name, intended field, university/department names, Personal Statement, Study Plan, and supporting activities do not contradict each other.",
  },
  {
    id: "current-guideline",
    icon: RefreshCw,
    title: "Current guideline checked",
    body: "I confirmed I am using the active 2027 GKS-U guideline and checked Study in Korea for any newer correction or notice.",
  },
  {
    id: "local-rules",
    icon: ShieldCheck,
    title: "Embassy / university instructions checked",
    body: "I checked the first-round institution's own announcement for local submission methods, deadlines, and any additional documents.",
  },
  {
    id: "timeline",
    icon: CalendarCheck2,
    title: "Application timeline written down",
    body: "I recorded my submission deadline, first-round result date, authentication preparation window, and later selection dates.",
  },
  {
    id: "full-audit",
    icon: ClipboardList,
    title: "Whole application audited",
    body: "I reviewed eligibility, route, university combination, forms, certificates, language scores, optional evidence, and signatures as one application.",
  },
  {
    id: "source-check",
    icon: BadgeCheck,
    title: "Doubtful rules source-checked",
    body: "For anything I was unsure about, I opened the official guideline/source instead of relying on applicant anecdotes.",
  },
  {
    id: "pre-submit",
    icon: Check,
    title: "Final pre-submission check complete",
    body: "All required documents are present, required signatures are provided, official university/department names are correct, and the application is in the required order/format.",
  },
] as const;

const STORAGE_KEY = "kmate:gks-u-2027-manual-checklist";

export function GksU2027ManualChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setChecked(JSON.parse(saved) as Record<string, boolean>);
    } catch {
      // Optional browser-only progress.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    } catch {
      // The checklist still works without persistence.
    }
  }, [checked]);

  const count = useMemo(() => ITEMS.filter((item) => checked[item.id]).length, [checked]);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Manual application checklist
          </p>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">
            The rest stays lightweight — no uploads
          </h2>
          <p className="mt-1 max-w-3xl text-[12.75px] leading-relaxed text-muted">
            Use this as a final self-check for the other ideas. KMate does not upload or inspect your files here.
          </p>
        </div>
        <span className="rounded-full bg-primary-soft px-3 py-1.5 text-[12px] font-semibold text-primary">
          {count}/{ITEMS.length} complete
        </span>
      </div>

      <Card className="mt-4 p-0">
        <div className="divide-y divide-hairline">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const isChecked = Boolean(checked[item.id]);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setChecked((current) => ({ ...current, [item.id]: !current[item.id] }))
                }
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas/60"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1",
                    isChecked
                      ? "bg-success/15 text-success ring-success/20"
                      : "bg-white text-muted ring-hairline-strong"
                  )}
                >
                  {isChecked ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[12.75px] font-semibold",
                      isChecked ? "text-muted line-through" : "text-ink"
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                    {item.body}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <p className="mt-3 text-[11.5px] text-muted">
        Checklist progress is saved only in this browser.
      </p>
    </section>
  );
}
