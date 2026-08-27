import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Info,
  Languages,
  ListChecks,
  MinusCircle,
  Route,
} from "lucide-react";
import { Card, MicroLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { TRACK_LABELS } from "@/lib/requirements/options";
import type { CheckerResult } from "@/lib/requirements/matcher";

/**
 * The result view: one university overview, then one panel per matching record.
 *
 * Records are never merged: a university can hold several records under one
 * track (Konyang, Inje, Kookmin and KOREATECH each do under UIC), and their
 * requirements differ. Merging them would produce a set of requirements that
 * no official source states. The overview card therefore carries only what is
 * true of the university as a whole -- its name, the route that was selected,
 * how many records matched -- and every requirement figure lives inside the
 * record it came from.
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
    dot: "bg-success",
    blurb: "Confirmed against the official source recorded below.",
  },
  conditional: {
    label: "Conditional",
    icon: AlertTriangle,
    chip: "bg-gold/10 text-gold",
    dot: "bg-gold",
    blurb: "Partly stated, or some details are withheld. Confirm the rest with the university.",
  },
  not_stated: {
    label: "Not stated",
    icon: HelpCircle,
    chip: "bg-canvas text-muted",
    dot: "bg-muted",
    blurb: "The official source does not state this. That is not the same as there being no requirement.",
  },
  unavailable: {
    label: "Unavailable",
    icon: MinusCircle,
    chip: "bg-danger/10 text-danger",
    dot: "bg-danger",
    blurb: "A verified source excludes this option.",
  },
} as const;

export function RequirementResults({
  results,
  selection,
}: {
  results: CheckerResult[];
  /** The route the applicant picked, for the overview card's chips. */
  selection?: { program: string; trackLabel?: string; subtypeLabel?: string };
}) {
  if (results.length === 0) {
    return (
      <Card className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas">
          <HelpCircle className="h-4 w-4 text-muted" />
        </span>
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

  const university = results[0].record.university;
  const verdicts = [...new Set(results.map((r) => r.verdict))];
  const dates = [...new Set(results.map((r) => r.record.verification.last_verified ?? "Not stated"))];

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- university overview ---------------- */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <GraduationCap className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[18px] font-semibold leading-snug tracking-tight text-ink">{university}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {selection?.program && <Chip>{selection.program}</Chip>}
                {selection?.trackLabel && <Chip>{selection.trackLabel}</Chip>}
                {selection?.subtypeLabel && <Chip>{selection.subtypeLabel}</Chip>}
              </div>
            </div>
          </div>
          {/* One status is only shown when every record agrees on it -- with
              records that differ, a single badge would be a claim no source
              makes. */}
          {verdicts.length === 1 ? (
            <VerdictChip verdict={verdicts[0]} />
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[11.5px] font-medium text-muted">
              Varies by record
            </span>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-3 border-t border-hairline pt-3.5 sm:grid-cols-3">
          <Widget
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Official records"
            value={String(results.length)}
            sub={results.length === 1 ? "one source entry" : "shown separately below"}
          />
          <Widget
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Result status"
            value={verdicts.length === 1 ? VERDICTS[verdicts[0]].label : "Varies by record"}
            sub={verdicts.length === 1 ? VERDICTS[verdicts[0]].blurb : "see each record below"}
          />
          <Widget
            icon={<CalendarCheck className="h-3.5 w-3.5" />}
            label="Last verified"
            value={dates.length === 1 ? dates[0] : "Varies by record"}
          />
        </dl>

        {results.length > 1 && (
          <p className="text-[12.5px] leading-relaxed text-muted">
            {results.length} separate official records match this selection. They are shown separately because
            their requirements differ.
          </p>
        )}
      </Card>

      {/* ---------------- one panel per official record ---------------- */}
      {results.map((result, i) => (
        <RecordPanel key={result.record.id} result={result} index={i + 1} total={results.length} />
      ))}
    </div>
  );
}

function RecordPanel({ result, index, total }: { result: CheckerResult; index: number; total: number }) {
  const { record, verdict, matchedRules, notes } = result;
  const v = VERDICTS[verdict];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Numbered when several match, so two panels never read as an
              accidental duplicate of one another. */}
          <MicroLabel>{total > 1 ? `Official record ${index} of ${total}` : "Official record"}</MicroLabel>
          {/* track_label already spells out the type for most records
              ("Embassy Track / Type A"), so the separate Type and the family
              list are only added when they say something the label doesn't. */}
          <p className="mt-1 text-[14.5px] font-semibold leading-snug text-ink">{record.track_label}</p>
          <p className="mt-0.5 text-[12px] text-muted">{subtitleFor(record)}</p>
        </div>
        <VerdictChip verdict={verdict} />
      </div>

      <p className="text-[12.5px] leading-relaxed text-muted">{v.blurb}</p>

      <dl className="grid grid-cols-1 gap-3 rounded-xl bg-canvas px-3.5 py-3 sm:grid-cols-3">
        <Widget
          icon={<Route className="h-3.5 w-3.5" />}
          label="Track availability"
          value={record.track_label}
          sub={record.university_type ? `Type ${record.university_type}` : undefined}
          flat
        />
        <Widget
          icon={<Languages className="h-3.5 w-3.5" />}
          label="Language of instruction"
          value={record.flags.english_track ? "English-taught track flagged" : "Not stated"}
          sub={record.flags.english_track ? "by the official source" : "no English track stated by the source"}
          flat
        />
        <Widget
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Result status"
          value={v.label}
          flat
        />
      </dl>

      {record.flags.details_withheld && (
        <div className="flex items-start gap-2 rounded-xl bg-gold/10 px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="text-[13px] leading-relaxed text-ink">
            Some university-specific details are withheld because the official source did not state them
            clearly.
          </p>
        </div>
      )}

      <Section icon={<Languages className="h-3.5 w-3.5" />} title="Language Requirements">
        <Field value={record.requirements.language} />
      </Section>

      <Section icon={<ListChecks className="h-3.5 w-3.5" />} title="Other Requirements">
        <MicroLabel>Verified majors / departments</MicroLabel>
        <Field value={record.requirements.majors_departments} />
      </Section>

      <Section icon={<FileText className="h-3.5 w-3.5" />} title="Process &amp; Extra Documents">
        <Field value={record.requirements.process_extra_documents} />
      </Section>

      {record.structured_rules.length > 0 && (
        <Section icon={<ListChecks className="h-3.5 w-3.5" />} title="Conditional Rules">
          <ul className="flex flex-col gap-2">
            {record.structured_rules.map((rule, i) => {
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
        </Section>
      )}

      {notes.length > 0 && (
        <Section icon={<Info className="h-3.5 w-3.5" />} title="Important Notes">
          <ul className="flex flex-col gap-1">
            {notes.map((note, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-muted">
                · {note}
              </li>
            ))}
          </ul>
        </Section>
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

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-hairline pt-3.5">
      <div className="flex items-center gap-1.5 text-muted">
        {icon}
        <MicroLabel>{title}</MicroLabel>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** A null requirement is "Not stated" -- never "no requirement". */
function Field({ value }: { value: string | null }) {
  if (value) {
    return <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{value}</p>;
  }
  return (
    <p className="text-[13px] text-muted">
      <span className="font-medium text-ink">Not stated</span> in the official source. This does not mean
      there is no requirement.
    </p>
  );
}

function VerdictChip({ verdict }: { verdict: CheckerResult["verdict"] }) {
  const v = VERDICTS[verdict];
  const Icon = v.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
        v.chip
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {v.label}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-canvas px-2.5 py-1 text-[11.5px] font-medium text-muted">
      {children}
    </span>
  );
}

function Widget({
  icon,
  label,
  value,
  sub,
  flat,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  flat?: boolean;
}) {
  return (
    <div className={cn(!flat && "rounded-xl bg-canvas px-3.5 py-3")}>
      <dt className="flex items-center gap-1.5 text-muted">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </dt>
      <dd className="mt-1 text-[13.5px] font-medium leading-snug text-ink">{value}</dd>
      {sub && <dd className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{sub}</dd>}
    </div>
  );
}

function subtitleFor(record: CheckerResult["record"]): string {
  const parts: string[] = [record.program];

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
