export interface ScholarshipStudioRow {
  id: string;
  university_name: string;
  scholarship_name: string;
  scholarship_type: string | null;
  degree_level: string | null;
  benefit_type: string | null;
  tuition_coverage: string | null;
  gpa_requirement: string | null;
  topik_requirement: string | null;
  application_required: boolean | null;
  automatic_consideration: boolean | null;
  deadline: string | null;
  deadline_type: string | null;
  status: string;
  source_url: string;
  content_hash: string | null;
  last_verified_at: string | null;
  deadline_label: string;
}

export interface ScholarshipStudioProfileSeed {
  major: string;
  applicationYear: number | null;
  track: string | null;
}

export interface StudioProfile {
  degree: "" | "undergraduate" | "graduate";
  major: string;
  nationality: string;
  education: string;
  gradingScale: "" | "100" | "4.0" | "4.3" | "5.0";
  gpa: string;
  topik: string;
  ielts: string;
  toefl: string;
  intake: string;
  funding: "any" | "full" | "living";
}

export interface StudioApplication {
  stage: "Researching" | "Preparing documents" | "Ready to submit" | "Submitted" | "Interview" | "Result";
  docs: Record<StudioDocumentType, boolean>;
  requirements: {
    source: boolean;
    criteria: boolean;
    deadline: boolean;
  };
  submission: "Not started" | "Preparing" | "Submitted";
  interview: "Not started" | "Preparing" | "Scheduled" | "Completed" | "Not applicable";
  result: "Pending" | "Awarded" | "Not awarded" | "Waitlisted";
  notes: string;
  targetDate: string;
}

export type StudioDocumentType =
  | "transcript"
  | "graduation"
  | "language"
  | "identity"
  | "recommendation"
  | "essay"
  | "specific";

export interface StudioReminder {
  id: string;
  label: string;
  date: string;
  awardId: string;
}

export interface StudioWatch {
  id: string;
  university: string;
  query: string;
  deadline: string;
}

export interface StudioNotification {
  id: string;
  title: string;
  body: string;
  kind: string;
  read: boolean;
  createdAt: string;
}

export interface StudioReview {
  id: string;
  awardId: string;
  artifact: string;
  focus: string;
  createdAt: string;
}

export interface StudioCommunityNote {
  id: string;
  awardId: string;
  body: string;
  createdAt: string;
}

export interface StudioSnapshot {
  capturedAt: string;
  deadline: string;
  funding: string;
  gpa: string;
  topik: string;
  contentHash: string | null;
}

export interface StudioWorkspace {
  tracked: string[];
  compare: string[];
  profile: StudioProfile;
  applications: Record<string, StudioApplication>;
  reminders: StudioReminder[];
  watches: StudioWatch[];
  cycleWatches: string[];
  notifications: StudioNotification[];
  reviews: StudioReview[];
  communityNotes: StudioCommunityNote[];
  snapshots: Record<string, StudioSnapshot[]>;
}

export interface VaultFileRecord {
  id: string;
  type: StudioDocumentType;
  name: string;
  size: number;
  mime: string;
  issuedDate: string;
  notes: string;
  savedAt: string;
  bytes: ArrayBuffer;
}

export interface EligibilityCheck {
  label: string;
  result: "met" | "review" | "not_met";
  detail: string;
}

export interface EligibilityResult {
  status: "met" | "review" | "not_met";
  label: string;
  checks: EligibilityCheck[];
}

export const DOC_LABELS: Record<StudioDocumentType, string> = {
  transcript: "Academic transcript",
  graduation: "Graduation / expected-graduation evidence",
  language: "Language evidence",
  identity: "Passport / identity evidence",
  recommendation: "Recommendation letter",
  essay: "Essay / statement",
  specific: "Scholarship-specific evidence",
};

export const DOCUMENT_TYPES = Object.keys(DOC_LABELS) as StudioDocumentType[];
export const COMMON_DOCUMENT_TYPES: StudioDocumentType[] = [
  "transcript",
  "graduation",
  "language",
  "identity",
];

const WORKSPACE_KEY = "kmate-scholarship-studio-workspace-v4";
const LEGACY_TRACKED_KEY = "kmate-scholarship-studio-tracked";
const LEGACY_COMPARE_KEY = "kmate-scholarship-studio-compare";
const VAULT_DB = "kmate-scholarship-studio-vault";
const VAULT_STORE = "files";

export function initialProfile(seed: ScholarshipStudioProfileSeed): StudioProfile {
  return {
    degree: seed.track === "gks_u" ? "undergraduate" : seed.track === "gks_g" ? "graduate" : "",
    major: seed.major ?? "",
    nationality: "",
    education: "",
    gradingScale: "",
    gpa: "",
    topik: "",
    ielts: "",
    toefl: "",
    intake: seed.applicationYear ? String(seed.applicationYear) : "",
    funding: "any",
  };
}

export function initialApplication(): StudioApplication {
  return {
    stage: "Researching",
    docs: {
      transcript: false,
      graduation: false,
      language: false,
      identity: false,
      recommendation: false,
      essay: false,
      specific: false,
    },
    requirements: {
      source: false,
      criteria: false,
      deadline: false,
    },
    submission: "Not started",
    interview: "Not started",
    result: "Pending",
    notes: "",
    targetDate: "",
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function safeApplication(value: unknown): StudioApplication {
  const base = initialApplication();
  if (!value || typeof value !== "object") return base;
  const item = value as Partial<StudioApplication>;
  return {
    ...base,
    ...item,
    docs: { ...base.docs, ...(item.docs ?? {}) },
    requirements: { ...base.requirements, ...(item.requirements ?? {}) },
  };
}

export function readWorkspace(seed: ScholarshipStudioProfileSeed): StudioWorkspace {
  const empty: StudioWorkspace = {
    tracked: [],
    compare: [],
    profile: initialProfile(seed),
    applications: {},
    reminders: [],
    watches: [],
    cycleWatches: [],
    notifications: [],
    reviews: [],
    communityNotes: [],
    snapshots: {},
  };
  if (typeof window === "undefined") return empty;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_KEY) ?? "null") as Partial<StudioWorkspace> | null;
    if (parsed) {
      const applications = Object.fromEntries(
        Object.entries(parsed.applications ?? {}).map(([id, value]) => [id, safeApplication(value)])
      );
      return {
        ...empty,
        ...parsed,
        tracked: stringArray(parsed.tracked),
        compare: stringArray(parsed.compare).slice(0, 3),
        profile: { ...empty.profile, ...(parsed.profile ?? {}) },
        applications,
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        watches: Array.isArray(parsed.watches) ? parsed.watches : [],
        cycleWatches: stringArray(parsed.cycleWatches),
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
        communityNotes: Array.isArray(parsed.communityNotes) ? parsed.communityNotes : [],
        snapshots: parsed.snapshots ?? {},
      };
    }
  } catch {
    // Fall through to the legacy migration below.
  }

  try {
    empty.tracked = stringArray(JSON.parse(window.localStorage.getItem(LEGACY_TRACKED_KEY) ?? "[]"));
    empty.compare = stringArray(JSON.parse(window.localStorage.getItem(LEGACY_COMPARE_KEY) ?? "[]")).slice(0, 3);
  } catch {
    // A malformed legacy key should never block Scholarship Studio.
  }
  return empty;
}

export function saveWorkspace(workspace: StudioWorkspace) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  window.localStorage.setItem(LEGACY_TRACKED_KEY, JSON.stringify(workspace.tracked));
  window.localStorage.setItem(LEGACY_COMPARE_KEY, JSON.stringify(workspace.compare.slice(0, 3)));
}

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(VAULT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) {
        db.createObjectStore(VAULT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open document vault"));
  });
}

export async function vaultAll(): Promise<VaultFileRecord[]> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, "readonly");
    const request = tx.objectStore(VAULT_STORE).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as VaultFileRecord[]);
    request.onerror = () => reject(request.error ?? new Error("Could not read document vault"));
  });
}

export async function vaultGet(id: string): Promise<VaultFileRecord | null> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, "readonly");
    const request = tx.objectStore(VAULT_STORE).get(id);
    request.onsuccess = () => resolve((request.result as VaultFileRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read document"));
  });
}

export async function vaultPut(record: VaultFileRecord): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, "readwrite");
    tx.objectStore(VAULT_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save document"));
  });
}

export async function vaultDelete(id: string): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, "readwrite");
    tx.objectStore(VAULT_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not delete document"));
  });
}

export function profileCompletion(profile: StudioProfile): number {
  const required = [
    profile.degree,
    profile.major,
    profile.nationality,
    profile.education,
    profile.gradingScale,
    profile.gpa,
    profile.intake,
  ];
  const language = profile.topik || profile.ielts || profile.toefl;
  const complete = required.filter((value) => String(value).trim()).length + (language ? 1 : 0);
  return Math.round((complete / 8) * 100);
}

function parseTopikRequirement(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/(?:TOPIK|level)\D*([1-6])/i);
  return match ? Number(match[1]) : null;
}

function parseGpaRequirement(value: string | null): { threshold: number; scale: string } | null {
  if (!value) return null;
  const scaleMatch = value.match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*(4(?:\.0|\.3)?|5(?:\.0)?|100)/);
  if (scaleMatch) return { threshold: Number(scaleMatch[1]), scale: scaleMatch[2] };
  const percentMatch = value.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (percentMatch) return { threshold: Number(percentMatch[1]), scale: "100" };
  return null;
}

export function evaluateEligibility(row: ScholarshipStudioRow, profile: StudioProfile): EligibilityResult {
  const checks: EligibilityCheck[] = [];

  if (row.degree_level) {
    if (!profile.degree) {
      checks.push({
        label: "Degree level",
        result: "review",
        detail: `Published: ${row.degree_level}. Add your degree level to check it.`,
      });
    } else {
      checks.push({
        label: "Degree level",
        result: profile.degree === row.degree_level.toLowerCase() ? "met" : "not_met",
        detail: `Published: ${row.degree_level}. Profile: ${profile.degree}.`,
      });
    }
  }

  if (row.topik_requirement) {
    const threshold = parseTopikRequirement(row.topik_requirement);
    if (!threshold || !profile.topik) {
      checks.push({
        label: "TOPIK",
        result: "review",
        detail: threshold
          ? `Published TOPIK threshold: level ${threshold}. Add your TOPIK level to check it.`
          : `Published language field: ${row.topik_requirement}. Review the official wording.`,
      });
    } else {
      checks.push({
        label: "TOPIK",
        result: Number(profile.topik) >= threshold ? "met" : "not_met",
        detail: `Published threshold: TOPIK ${threshold}. Profile: TOPIK ${profile.topik}.`,
      });
    }
  }

  if (row.gpa_requirement) {
    const parsed = parseGpaRequirement(row.gpa_requirement);
    if (!parsed || !profile.gpa || !profile.gradingScale) {
      checks.push({
        label: "Academic requirement",
        result: "review",
        detail: `Published field: ${row.gpa_requirement}. Add a compatible grading scale or review the official rule.`,
      });
    } else if (profile.gradingScale !== parsed.scale && !(profile.gradingScale === "4.0" && parsed.scale === "4")) {
      checks.push({
        label: "Academic requirement",
        result: "review",
        detail: `Published scale: ${parsed.scale}. Profile scale: ${profile.gradingScale}. A conversion is not inferred.`,
      });
    } else {
      checks.push({
        label: "Academic requirement",
        result: Number(profile.gpa) >= parsed.threshold ? "met" : "not_met",
        detail: `Published threshold: ${parsed.threshold}/${parsed.scale}. Profile: ${profile.gpa}/${profile.gradingScale}.`,
      });
    }
  }

  checks.push({
    label: "Deadline",
    result: "review",
    detail: row.deadline_label,
  });

  checks.push({
    label: "Official-source review",
    result: "review",
    detail: "Confirm intake-specific nationality, document, and program conditions on the linked official source.",
  });

  const hasNotMet = checks.some((check) => check.result === "not_met");
  const hasReview = checks.some((check) => check.result === "review");
  return {
    status: hasNotMet ? "not_met" : hasReview ? "review" : "met",
    label: hasNotMet
      ? "Published criterion not met"
      : hasReview
        ? "Review / missing data"
        : "Published checks met",
    checks,
  };
}

export function relevanceScore(row: ScholarshipStudioRow, profile: StudioProfile) {
  let score = 0;
  const reasons: string[] = [];

  if (profile.degree && row.degree_level?.toLowerCase() === profile.degree) {
    score += 2;
    reasons.push("degree");
  }
  if (profile.funding === "full" && /full|100%/i.test(`${row.tuition_coverage ?? ""} ${row.benefit_type ?? ""}`)) {
    score += 2;
    reasons.push("funding preference");
  }
  if (profile.topik && row.topik_requirement) {
    const threshold = parseTopikRequirement(row.topik_requirement);
    if (threshold && Number(profile.topik) >= threshold) {
      score += 2;
      reasons.push("TOPIK");
    }
  }
  if (row.automatic_consideration) {
    score += 1;
    reasons.push("automatic consideration");
  }
  return { score, reasons };
}

export function sourceFreshness(row: ScholarshipStudioRow): {
  label: string;
  state: "fresh" | "aging" | "stale" | "unknown";
  days: number | null;
} {
  if (!row.last_verified_at) return { label: "Needs verification", state: "unknown", days: null };
  const checked = new Date(row.last_verified_at);
  const days = Math.max(0, Math.floor((Date.now() - checked.getTime()) / 86_400_000));
  if (days <= 14) return { label: "Fresh", state: "fresh", days };
  if (days <= 30) return { label: "Recheck soon", state: "aging", days };
  return { label: "Stale", state: "stale", days };
}

export function applicationProgress(app: StudioApplication): number {
  const docDone = Object.values(app.docs).filter(Boolean).length;
  const requirementDone = Object.values(app.requirements).filter(Boolean).length;
  const milestoneDone = [
    app.submission !== "Not started",
    app.interview !== "Not started",
    app.result !== "Pending",
  ].filter(Boolean).length;
  return Math.round(((docDone + requirementDone + milestoneDone) / (DOCUMENT_TYPES.length + 3 + 3)) * 100);
}

export function workload(app: StudioApplication) {
  const docs = Object.values(app.docs).filter((value) => !value).length;
  const requirements = Object.values(app.requirements).filter((value) => !value).length;
  const milestones =
    (app.submission === "Not started" ? 1 : 0) +
    (app.interview === "Not started" ? 1 : 0);
  const datePenalty = app.targetDate ? 0 : 2;
  const raw = docs + requirements * 2 + milestones + datePenalty;
  return {
    raw,
    docs,
    requirements,
    level: raw <= 4 ? "Low" : raw <= 8 ? "Medium" : "High",
    readiness: Math.max(8, Math.min(100, 100 - Math.round((raw / 16) * 100))),
  };
}

export function planTasks(awardId: string, app: StudioApplication) {
  if (!app.targetDate) return [] as Array<{ id: string; awardId: string; date: string; label: string }>;
  const target = new Date(`${app.targetDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return [];

  return [
    [-28, "Review official source & criteria"],
    [-21, "Lock reusable document set"],
    [-14, "Finish scholarship-specific writing/evidence"],
    [-7, "Final document verification"],
    [-2, "Portal-ready application review"],
    [0, "Target submission"],
  ].map(([offset, label]) => {
    const date = new Date(target);
    date.setDate(date.getDate() + Number(offset));
    return {
      id: `${awardId}-${offset}`,
      awardId,
      date: date.toISOString().slice(0, 10),
      label: String(label),
    };
  });
}

export function parseEmailUpdate(text: string): Partial<StudioApplication> | null {
  const value = text.toLowerCase();
  const update: Partial<StudioApplication> = {};

  if (/interview|invited to interview|schedule.*interview/.test(value)) {
    update.stage = "Interview";
    update.interview = "Scheduled";
  }
  if (/application.*received|submission.*received|successfully submitted|application is complete/.test(value)) {
    update.stage = "Submitted";
    update.submission = "Submitted";
  }
  if (/additional document|missing document|submit.*document|provide.*document/.test(value)) {
    update.stage = "Preparing documents";
  }
  if (/congratulations|awarded|selected for the scholarship|scholarship recipient/.test(value)) {
    update.stage = "Result";
    update.result = "Awarded";
  }
  if (/waitlist|wait-listed|waitlisted/.test(value)) {
    update.stage = "Result";
    update.result = "Waitlisted";
  }
  if (/not selected|unsuccessful|not awarded/.test(value)) {
    update.stage = "Result";
    update.result = "Not awarded";
  }

  return Object.keys(update).length ? update : null;
}

export function snapshotFor(row: ScholarshipStudioRow): StudioSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    deadline: row.deadline_label,
    funding: row.tuition_coverage ?? row.benefit_type ?? "Not stated",
    gpa: row.gpa_requirement ?? "Not stated",
    topik: row.topik_requirement ?? "Not stated",
    contentHash: row.content_hash,
  };
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function joinBytes(parts: Uint8Array[]) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function cleanFilename(value: string) {
  return (
    value
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 120) || "file"
  );
}

export async function buildPacketZip(
  row: ScholarshipStudioRow,
  app: StudioApplication,
  files: VaultFileRecord[]
): Promise<{ name: string; blob: Blob }> {
  const encoder = new TextEncoder();
  const entries: Array<{ name: string; data: Uint8Array }> = [];

  const checklist = [
    "KMate Scholarship Studio · Application Packet",
    `${row.university_name} · ${row.scholarship_name}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Official source: ${row.source_url}`,
    "",
    "DOCUMENT CHECKLIST",
    ...DOCUMENT_TYPES.map((type) => `[${app.docs[type] ? "x" : " "}] ${DOC_LABELS[type]}`),
    "",
    "SOURCE / REQUIREMENT CHECKS",
    `[${app.requirements.source ? "x" : " "}] Official source reviewed`,
    `[${app.requirements.criteria ? "x" : " "}] Published criteria checked`,
    `[${app.requirements.deadline ? "x" : " "}] Current deadline behavior checked`,
    "",
    `Stage: ${app.stage}`,
    `Submission: ${app.submission}`,
    `Interview: ${app.interview}`,
    `Result: ${app.result}`,
    `Target date: ${app.targetDate || "Not set"}`,
    "",
    "This packet is a preparation bundle, not an official university submission.",
  ].join("\n");

  entries.push({ name: "00_PACKET_CHECKLIST.txt", data: encoder.encode(checklist) });
  entries.push({
    name: "00_MANIFEST.json",
    data: encoder.encode(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scholarship: row,
          application: app,
          files: files.map(({ bytes: _bytes, ...meta }) => meta),
        },
        null,
        2
      )
    ),
  });

  files.forEach((file, index) => {
    entries.push({
      name: `${String(index + 1).padStart(2, "0")}_${cleanFilename(`${DOC_LABELS[file.type]}_${file.name}`)}`,
      data: new Uint8Array(file.bytes),
    });
  });

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = joinBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      entry.data,
    ]);
    localParts.push(local);

    const central = joinBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = joinBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset),
    u16(0),
  ]);
  const zip = joinBytes([...localParts, ...centralParts, end]);

  return {
    name: `${cleanFilename(`${row.university_name}_${row.scholarship_name}`)}_KMate_Packet.zip`,
    blob: new Blob([zip], { type: "application/zip" }),
  };
}

export function formatShortDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
