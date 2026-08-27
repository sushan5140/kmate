import { AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, MinusCircle } from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { TRACK_LABELS } from "@/lib/requirements/options";
import type { CheckerResult } from "@/lib/requirements/matcher";

/**
 * Renders one card per matching record.
 *
 * Records are never merged: a university can hold several records under one
 * track (Konyang, Inje, Kookmin and KOREATECH each do under UIC), and their
 * requirements differ. Merging them would produce a set of requirements that
 * no official source states.
 *
 * The other rule this file exists to enforce: a null requirement renders as
 * "Not stated", never as "no requirement". Absence of information in the
 * dataset says nothing about eligibility.
 */

const VERDICTS = {
  verified: {
    label: "Verified",
    icon: CheckCircle2,
    chip: "bg-success/10 text-success",
    blurb: "Confirmed against the official source recorded below.",
  },
  conditional: {
    label: "Conditional",
    icon: AlertTriangle,
    chip: "bg-gold/10 text-gold",
    blurb: "Partly stated, or some details are withheld. Confirm the rest with the university.",
  },
  not_stated: {
    label: "Not stated",
    icon: HelpCircle,
    chip: "bg-canvas text-muted",
    blurb: "The official source does not state this. That is not the same as there being no requirement.",
  },
  unavailable: {
    label: "Unavailable",
    icon: MinusCircle,
    chip: "bg-danger/10 text-danger",
    blurb: "A verified source excludes this option.",
  },
} as const;

export function RequirementResults({ results }: { results: CheckerResult[] }) {
  if (results.length === 0) {
    return (
      <Card className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <div>
          <p className="text-[14px] font-medium text-ink">No record for this combination</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            The dataset holds no entry for this university under this program and track. That means the
            requirement is <span className="font-medium text-ink">not stated here</span> — it does not mean
            you are ineligible, and ordinary international-admission rules do not apply in its place. Check
            the university&apos;s official GKS page.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {results.length > 1 && (
        <p className="text-[12.5px] text-muted">
          {results.length} separate official records match this selection. They are shown separately because
          their requirements differ.
        </p>
      )}
      {results.map((result) => (
        <ResultCard key={result.record.id} result={result} />
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: CheckerResult }) {
  const { record, verdict, matchedRules, notes } = result;
  const v = VERDICTS[verdict];
  const Icon = v.icon;

  const conditionalRules = record.structured_rules;

  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug text-ink">{record.university}</h2>
          {/* track_label already spells out the type for most records
              ("Embassy Track / Type A"), so the separate Type and the family
              list are only added when they say something the label doesn't. */}
          <p className="mt-1 text-[12px] text-muted">{subtitleFor(record)}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
            v.chip
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {v.label}
        </span>
      </div>

      <p className="text-[12.5px] leading-relaxed text-muted">{v.blurb}</p>

      {record.flags.details_withheld && (
        <div className="flex items-start gap-2 rounded-xl bg-gold/10 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="text-[13px] leading-relaxed text-ink">
            Some university-specific details are withheld because the official source did not state them
            clearly.
          </p>
        </div>
      )}

      <Field label="Verified majors / departments" value={record.requirements.majors_departments} />
      <Field label="Language requirement" value={record.requirements.language} />
      <Field label="Process / extra documents" value={record.requirements.process_extra_documents} />

      {conditionalRules.length > 0 && (
        <div className="border-t border-hairline pt-3">
          <MicroLabel>Conditional rules</MicroLabel>
          <ul className="mt-2 flex flex-col gap-2">
            {conditionalRules.map((rule, i) => {
              const applies = matchedRules.includes(rule);
              return (
                <li
                  key={i}
                  className={cn(
                    "rounded-xl border px-3 py-2.5",
                    applies ? "border-primary bg-primary/5" : "border-hairline"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] font-medium text-ink">
                      {rule.field.replace(/_/g, " ")} · {rule.effect}
                    </span>
                    <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
                      {rule.scope.replace(/_/g, " ")}
                    </span>
                    {applies && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-medium text-primary">
                        applies to your selection
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">{rule.value}</p>
                  {rule.condition && (
                    <p className="mt-0.5 text-[12px] text-muted">Condition: {rule.condition}</p>
                  )}
                  {rule.evidence && (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{rule.evidence}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {notes.map((note, i) => (
            <li key={i} className="text-[12px] leading-relaxed text-muted">
              · {note}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <div className="flex min-w-0 flex-col gap-1">
          <MicroLabel>Official source</MicroLabel>
          {record.sources.length === 0 ? (
            <span className="text-[12.5px] text-muted">Not stated</span>
          ) : (
            record.sources.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex max-w-full items-center gap-1 truncate text-[12.5px] font-medium text-primary hover:underline"
              >
                <span className="truncate">{hostOf(src)}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ))
          )}
        </div>
        <div className="text-right">
          <MicroLabel>Last verified</MicroLabel>
          <p className="text-[12.5px] text-ink">{record.verification.last_verified ?? "Not stated"}</p>
          {record.verification.status && (
            <p className="text-[11.5px] text-muted">{record.verification.status}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** A null requirement is "Not stated" -- never "no requirement". */
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-t border-hairline pt-3">
      <MicroLabel>{label}</MicroLabel>
      {value ? (
        <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{value}</p>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted">
          <span className="font-medium text-ink">Not stated</span> in the official source. This does not mean
          there is no requirement.
        </p>
      )}
    </div>
  );
}

function subtitleFor(record: CheckerResult["record"]): string {
  const parts: string[] = [record.program, record.track_label];

  const label = record.track_label.toLowerCase();
  if (record.university_type && !label.includes(`type ${record.university_type.toLowerCase()}`)) {
    parts.push(`Type ${record.university_type}`);
  }

  // Only worth listing the families this record also belongs to but which the
  // label doesn't already name -- otherwise it just repeats itself.
  //
  // `other` is dropped: it is the internal tag for "the source named no
  // track", so it carries no information for an applicant and would put a
  // classification bucket in front of them as if it were a route.
  const extraFamilies = record.track_families
    .filter((f) => f !== "other")
    .map((f) => TRACK_LABELS[f] ?? f)
    .filter((name) => !label.includes(name.toLowerCase().replace(" track", "")));
  if (extraFamilies.length) parts.push(`also listed under ${extraFamilies.join(", ")}`);

  return parts.join(" · ");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
