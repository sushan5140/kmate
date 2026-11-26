export const OUTREACH_STATUSES = ["researching", "ready", "contacted", "replied", "interview", "closed"] as const;
export type OutreachStatus = typeof OUTREACH_STATUSES[number];
export const OUTREACH_LABELS: Record<OutreachStatus, string> = {
  researching: "Researching", ready: "Ready to contact", contacted: "Contacted",
  replied: "Replied", interview: "Interview", closed: "Closed",
};
export const MAX_OUTREACH_RECORDS = 150;
export type OutreachDraft = {
  professor: string; university: string; department: string; researchFit: string;
  officialUrl: string; status: OutreachStatus; contactedOn: string; followUpOn: string; notes: string;
};
export type OutreachRecord = OutreachDraft & { id: string };

export const EMPTY_OUTREACH_DRAFT: OutreachDraft = {
  professor: "", university: "", department: "", researchFit: "", officialUrl: "",
  status: "researching", contactedOn: "", followUpOn: "", notes: "",
};
export function isOutreachStatus(value: unknown): value is OutreachStatus {
  return typeof value === "string" && OUTREACH_STATUSES.some(status => status === value);
}
export function isOutreachDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function normalizeFacultyUrl(value: string): string | null {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".")) return null;
    return url.href.length <= 500 ? url.href : null;
  } catch {
    return null;
  }
}
export function validateOutreachDraft(input: OutreachDraft): { draft: OutreachDraft; error: null } | { error: string } {
  const professor = input.professor.trim(), university = input.university.trim();
  const department = input.department.trim(), researchFit = input.researchFit.trim(), notes = input.notes.trim();
  if (!professor || !university) return { error: "Enter a professor or lab name and university." };
  if (professor.length > 120 || university.length > 160 || department.length > 160 || researchFit.length > 500 || notes.length > 1000) return { error: "One or more fields are too long." };
  const officialUrl = normalizeFacultyUrl(input.officialUrl);
  if (officialUrl === null) return { error: "Use a valid HTTPS faculty or lab page without credentials." };
  if (!isOutreachStatus(input.status)) return { error: "Choose a valid stage." };
  if ((input.contactedOn && !isOutreachDate(input.contactedOn)) || (input.followUpOn && !isOutreachDate(input.followUpOn))) return { error: "Enter valid calendar dates." };
  if (input.contactedOn && input.followUpOn && input.followUpOn < input.contactedOn) return { error: "Follow-up cannot precede the contact date." };
  return { error: null, draft: { professor, university, department, researchFit, notes, officialUrl, status: input.status, contactedOn: input.contactedOn, followUpOn: input.followUpOn } };
}

export function parseOutreachRecords(raw: string | null): OutreachRecord[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const records: OutreachRecord[] = [];
    const ids = new Set<string>();
    for (const item of value) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id)) continue;
      if (!Object.keys(EMPTY_OUTREACH_DRAFT).every(key => typeof item[key] === "string")) continue;
      const result = validateOutreachDraft(item as OutreachDraft);
      if (result.error !== null) continue;
      records.push({ ...result.draft, id: item.id });
      ids.add(item.id);
      if (records.length >= MAX_OUTREACH_RECORDS) break;
    }
    return records;
  } catch {
    return [];
  }
}
export function upsertOutreachRecord(records: OutreachRecord[], record: OutreachRecord): OutreachRecord[] {
  if (records.some(item => item.id === record.id)) return records.map(item => item.id === record.id ? record : item);
  return records.length < MAX_OUTREACH_RECORDS ? [record, ...records] : records;
}
export function removeOutreachRecord(records: OutreachRecord[], id: string): OutreachRecord[] {
  return records.filter(record => record.id !== id);
}
export function localOutreachDate(now: Date): string {
  return [String(now.getFullYear()).padStart(4, "0"), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}
export function isFollowUpDue(record: OutreachRecord, today: string): boolean {
  return record.status === "contacted" && !!record.contactedOn && !!record.followUpOn && record.followUpOn <= today;
}
export function filterOutreachRecords(records: OutreachRecord[], query: string, status: "all" | OutreachStatus | "due", today: string): OutreachRecord[] {
  const q = query.trim().toLowerCase();
  return records.filter(record => {
    const matchesStage = status === "all" || (status === "due" ? isFollowUpDue(record, today) : record.status === status);
    return matchesStage && (!q || [record.professor, record.university, record.department, record.researchFit].some(text => text.toLowerCase().includes(q)));
  });
}
