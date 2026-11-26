export type WorksheetField = { id: string; label: string; hint: string; kind: "text" | "textarea" | "url" | "date" | "review"; max?: number };
export type WorksheetGroup = { title: string; fields: WorksheetField[] };
export type WorksheetValues = Record<string, string>;
export const REVIEW_OPTIONS = [
  { value: "", label: "Not reviewed" },
  { value: "unknown", label: "Unknown / needs confirmation" },
  { value: "action", label: "Action needed" },
  { value: "reviewed", label: "Personally reviewed against source" },
] as const;
export function safeWorksheetUrl(raw: string): boolean {
  if (!raw) return true;
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".") && raw.length <= 500; }
  catch { return false; }
}
export function worksheetDate(raw: string): boolean {
  if (!raw) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(raw + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}
export function normalizeWorksheet(groups: WorksheetGroup[], input: unknown): WorksheetValues {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: WorksheetValues = {};
  for (const f of groups.flatMap(group => group.fields)) {
    const v = source[f.id];
    if (typeof v !== "string" || !v || v.length > (f.max ?? 500)) continue;
    if (f.kind === "url" && !safeWorksheetUrl(v)) continue;
    if (f.kind === "date" && !worksheetDate(v)) continue;
    if (f.kind === "review" && !REVIEW_OPTIONS.some(option => option.value === v)) continue;
    result[f.id] = v;
  }
  return result;
}
export function parseWorksheet(groups: WorksheetGroup[], raw: string | null): WorksheetValues {
  try { return normalizeWorksheet(groups, raw ? JSON.parse(raw) : {}); } catch { return {}; }
}
export function validateWorksheet(groups: WorksheetGroup[], input: WorksheetValues): string | null {
  const normalized = normalizeWorksheet(groups, input);
  for (const [key, value] of Object.entries(input)) if (value && normalized[key] !== value) return "Invalid or overlong field. Check dates and HTTPS links.";
  const reviews = groups.flatMap(g => g.fields).filter(f => f.kind === "review");
  if (reviews.some(f => input[f.id] === "reviewed") && (!input.source || !input.checked)) return "Enter the official source URL and date checked before marking a review complete.";
  return null;
}
export function countWords(raw: string): number {
  return raw.trim() ? raw.trim().split(/\s+/u).length : 0;
}
const review = (id: string, label: string, hint: string): WorksheetField => ({ id, label, hint, kind: "review" });
const text = (id: string, label: string, hint: string, max = 1000): WorksheetField => ({ id, label, hint, kind: "textarea", max });
const source: WorksheetGroup = { title: "Your source record", fields: [
  { id: "source", label: "Official recipient / department source", hint: "Use the current-cycle official notice; this link is user-provided, not independently verified.", kind: "url" },
  { id: "checked", label: "Date personally checked", hint: "Record when you read the instructions.", kind: "date" },
  text("source_notes", "Source cycle and unresolved questions", "Write the stated cycle, page or section, and any conflicting or missing instructions."),
] };
export const DEPARTMENT_GROUPS: WorksheetGroup[] = [
  source,
  { title: "Language and department verification", fields: [
    review("language_review", "Language test requirements", "Check IELTS, TOEFL, TOPIK, validity, accepted evidence and exemptions; no test is assumed required or waived."),
    text("language_notes", "Language evidence", "Record exact scores or exemption wording only if your source states it."),
    review("consent_review", "Professor or supervisor consent", "Check if prior contact or formal consent is required, optional or unstated."),
    text("consent_notes", "Consent evidence", "Record the exact department instructions and relevant form."),
    review("extra_review", "Additional department documents", "Check portfolio, research plan, interviews and other requirements."),
    text("extra_notes", "Additional document evidence", "List only what the source actually states."),
    review("method_review", "Submission method and copies", "Confirm the relevant embassy/university instructions."),
    text("method_notes", "Method and delivery evidence", "Record how, where and when to submit according to the source."),
  ] },
];
export const ESSAY_GROUPS: WorksheetGroup[] = [
  { title: "Personal statement · evidence first", fields: [
    text("motivation", "Motivation and turning point", "Describe a real experience that shaped your interest.", 6000),
    text("academic", "Academic and project evidence", "What did you do, what was your contribution, and what can you substantiate?", 6000),
    text("challenges", "Growth and challenges", "Explain what changed in your approach, without exaggeration.", 6000),
  ] },
  { title: "Study plan · goals and feasibility", fields: [
    text("language", "Language preparation", "What is your actual baseline and realistic study plan?", 6000),
    text("fit", "University and department fit", "Link specific verified courses, labs or research themes to your goals.", 6000),
    text("plan", "Study and research roadmap", "Describe realistic milestones, methods and resources.", 6000),
    text("future", "Post-graduation goals", "Explain how this education supports your longer-term goals.", 6000),
  ] },
  { title: "Consistency review", fields: [
    text("checks", "Claims to verify", "Check dates, names, achievements, department fit and consistency across documents. Use the official form and length limits for your cycle.", 4000),
  ] },
];
export const PACKET_GROUPS: WorksheetGroup[] = [
  source,
  { title: "Document packet self-check", fields: [
    review("certificates", "Underlying certificates and academic records", "Check that original or accepted certified copies accompany authentication when the recipient requires them."),
    review("authentication", "Authentication or apostille", "Check document-by-document requirements and the issuing authority."),
    review("translation", "Translations", "Verify accepted languages, certification and attachment instructions; do not assume translations are required for every record."),
    review("forms", "Current-cycle forms and signatures", "Confirm the correct forms, required signatures and recommendation instructions."),
    review("copies", "Copies, originals and ordering", "Use the first-round institution’s stated copy count and format."),
    review("delivery", "Delivery method and deadline", "Verify submission address, portal, receipt process, exact deadline and time zone."),
    review("final", "Final completeness review", "Check the official checklist against the packet. This is not a certification of completeness."),
    text("issues", "Outstanding issues", "List what needs correction or confirmation before submitting."),
  ] },
];
