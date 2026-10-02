"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  GitCompareArrows,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  COMMON_DOCUMENT_TYPES,
  DOC_LABELS,
  DOCUMENT_TYPES,
  applicationProgress,
  buildPacketZip,
  downloadBlob,
  evaluateEligibility,
  formatShortDate,
  initialApplication,
  initialProfile,
  parseEmailUpdate,
  planTasks,
  profileCompletion,
  readWorkspace,
  relevanceScore,
  saveWorkspace,
  snapshotFor,
  sourceFreshness,
  vaultAll,
  vaultDelete,
  vaultGet,
  vaultPut,
  workload,
  type EligibilityResult,
  type ScholarshipStudioProfileSeed,
  type ScholarshipStudioRow,
  type StudioApplication,
  type StudioDocumentType,
  type StudioNotification,
  type StudioSnapshot,
  type StudioWorkspace,
  type VaultFileRecord,
} from "./studio-client";

export type {
  ScholarshipStudioProfileSeed,
  ScholarshipStudioRow,
} from "./studio-client";

type StudioView = "discover" | "eligibility" | "applications" | "compare";

const NOT_STATED = "Not stated in the official source";

function degreeLabel(value: string | null) {
  if (!value) return "Degree not stated";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sourceDate(value: string | null) {
  if (!value) return "Not verified yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function cloneApplication(app: StudioApplication): StudioApplication {
  return {
    ...app,
    docs: { ...app.docs },
    requirements: { ...app.requirements },
  };
}

function mergeApplication(
  current: StudioWorkspace,
  id: string,
  patch: Partial<StudioApplication>
): StudioWorkspace {
  const existing = cloneApplication(current.applications[id] ?? initialApplication());
  return {
    ...current,
    applications: {
      ...current.applications,
      [id]: {
        ...existing,
        ...patch,
        docs: patch.docs ? { ...existing.docs, ...patch.docs } : existing.docs,
        requirements: patch.requirements
          ? { ...existing.requirements, ...patch.requirements }
          : existing.requirements,
      },
    },
  };
}

function fundingModel(row: ScholarshipStudioRow) {
  const text = `${row.tuition_coverage ?? ""} ${row.benefit_type ?? ""}`;
  let tuitionPct = 0;
  if (/full tuition|100\s*%/i.test(text)) tuitionPct = 100;
  else {
    const percent = text.match(/([0-9]{1,3})\s*%/);
    if (percent) tuitionPct = Math.min(100, Number(percent[1]));
  }

  let stipendMonthly = 0;
  const stipend = text.match(/(?:₩|KRW\s*)([0-9][0-9,]*)[^.]{0,30}(?:month|monthly)/i);
  if (stipend) stipendMonthly = Number(stipend[1].replaceAll(",", ""));

  return { tuitionPct, stipendMonthly };
}

function compareSnapshotFields(previous: StudioSnapshot, current: StudioSnapshot) {
  return [
    ["Deadline", previous.deadline, current.deadline],
    ["Funding", previous.funding, current.funding],
    ["GPA", previous.gpa, current.gpa],
    ["TOPIK", previous.topik, current.topik],
  ] as const;
}

export default function ScholarshipStudio({
  rows,
  archivedRows,
  profileSeed,
}: {
  rows: ScholarshipStudioRow[];
  archivedRows: ScholarshipStudioRow[];
  profileSeed: ScholarshipStudioProfileSeed;
}) {
  const universities = useMemo(
    () => [...new Set(rows.map((row) => row.university_name))],
    [rows]
  );

  const [view, setView] = useState<StudioView>("discover");
  const [activeUniversity, setActiveUniversity] = useState("all");
  const [previewUniversity, setPreviewUniversity] = useState(universities[0] ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "expiring">("all");
  const [deadlineFilter, setDeadlineFilter] = useState<"all" | "fixed" | "admission_schedule" | "automatic">("all");
  const [pointer, setPointer] = useState({ x: 78, y: 28 });
  const [workspace, setWorkspace] = useState<StudioWorkspace>(() => ({
    tracked: [],
    compare: [],
    profile: initialProfile(profileSeed),
    applications: {},
    reminders: [],
    watches: [],
    cycleWatches: [],
    notifications: [],
    reviews: [],
    communityNotes: [],
    snapshots: {},
  }));
  const [hydrated, setHydrated] = useState(false);
  const [vaultFiles, setVaultFiles] = useState<VaultFileRecord[]>([]);
  const [selectedAwardId, setSelectedAwardId] = useState<string | null>(null);
  const [assistantAwardId, setAssistantAwardId] = useState<string | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderAwardId, setReminderAwardId] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailAwardId, setEmailAwardId] = useState("");
  const [emailText, setEmailText] = useState("");
  const [pendingEmailUpdate, setPendingEmailUpdate] = useState<Partial<StudioApplication> | null>(null);
  const [communityDraft, setCommunityDraft] = useState("");
  const [reviewDraft, setReviewDraft] = useState<{ awardId: string; artifact: string; focus: string } | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [calcTuition, setCalcTuition] = useState("8000000");
  const [calcLiving, setCalcLiving] = useState("1000000");
  const [calcMonths, setCalcMonths] = useState("12");
  const [calcOneTime, setCalcOneTime] = useState("1500000");

  const toast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(""), 2200);
  };

  useEffect(() => {
    const task = window.setTimeout(async () => {
      setWorkspace(readWorkspace(profileSeed));
      try {
        setVaultFiles(await vaultAll());
      } catch {
        // IndexedDB can be unavailable in hardened browsers. The rest of the
        // Studio remains usable and the Vault UI will show an empty state.
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(task);
  }, [profileSeed]);

  useEffect(() => {
    if (!hydrated) return;
    saveWorkspace(workspace);
  }, [workspace, hydrated]);

  useEffect(() => {
    document.body.style.overflow = selectedAwardId ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedAwardId]);

  const rowById = useMemo(
    () => new Map([...rows, ...archivedRows].map((row) => [row.id, row])),
    [rows, archivedRows]
  );

  const selectedAward = selectedAwardId ? rowById.get(selectedAwardId) ?? null : null;
  const compareRows = workspace.compare
    .map((id) => rowById.get(id))
    .filter((row): row is ScholarshipStudioRow => Boolean(row));
  const trackedRows = workspace.tracked
    .map((id) => rowById.get(id))
    .filter((row): row is ScholarshipStudioRow => Boolean(row));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeUniversity !== "all" && row.university_name !== activeUniversity) return false;
      if (statusFilter === "expiring" && row.status !== "expiring_soon") return false;
      if (deadlineFilter !== "all" && row.deadline_type !== deadlineFilter) return false;
      if (!needle) return true;
      return [
        row.university_name,
        row.scholarship_name,
        row.scholarship_type,
        row.benefit_type,
        row.tuition_coverage,
        row.gpa_requirement,
        row.topik_requirement,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
  }, [rows, query, activeUniversity, statusFilter, deadlineFilter]);

  const activePreview = useMemo(() => {
    const name = previewUniversity || universities[0] || "";
    const universityRows = rows.filter((row) => row.university_name === name);
    return {
      name,
      count: universityRows.length,
      place:
        name === "KAIST"
          ? "Daejeon"
          : name === "UNIST"
            ? "Ulsan"
            : name === "Korea University"
              ? "Seoul"
              : name === "Ajou University"
                ? "Suwon"
                : "South Korea",
      headline:
        universityRows.find((row) => row.tuition_coverage)?.tuition_coverage ??
        universityRows.find((row) => row.benefit_type)?.benefit_type ??
        "University-funded scholarship options",
    };
  }, [previewUniversity, rows, universities]);

  const completion = profileCompletion(workspace.profile);

  const eligibilityResults = useMemo(
    () =>
      rows
        .map((row) => ({
          row,
          evaluation: evaluateEligibility(row, workspace.profile),
          relevance: relevanceScore(row, workspace.profile),
        }))
        .sort((a, b) => {
          const statusRank = { met: 0, review: 1, not_met: 2 };
          return (
            statusRank[a.evaluation.status] - statusRank[b.evaluation.status] ||
            b.relevance.score - a.relevance.score
          );
        }),
    [rows, workspace.profile]
  );

  const gapActions = useMemo(() => {
    const actions: Array<{
      row: ScholarshipStudioRow;
      check: EligibilityResult["checks"][number];
    }> = [];
    for (const item of eligibilityResults) {
      for (const check of item.evaluation.checks) {
        if (check.result !== "met") actions.push({ row: item.row, check });
        if (actions.length >= 8) return actions;
      }
    }
    return actions;
  }, [eligibilityResults]);

  const radarRows = useMemo(
    () =>
      rows
        .map((row) => ({ row, ...relevanceScore(row, workspace.profile) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4),
    [rows, workspace.profile]
  );

  const pathwayTasks = useMemo(
    () =>
      workspace.tracked
        .flatMap((id) => planTasks(id, workspace.applications[id] ?? initialApplication()))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [workspace.tracked, workspace.applications]
  );

  const timelineItems = useMemo(() => {
    const manual = workspace.reminders.map((item) => ({ ...item, auto: false }));
    const auto = pathwayTasks.map((item) => ({ ...item, auto: true }));
    return [...manual, ...auto].sort((a, b) => a.date.localeCompare(b.date));
  }, [workspace.reminders, pathwayTasks]);

  const nextAction = useMemo(() => {
    if (completion < 70) {
      return {
        eyebrow: "Profile foundation",
        title: "Finish your reusable scholarship profile",
        detail: "A complete degree, academic, language, and intake profile makes the eligibility and relevance tools substantially more useful.",
        action: () => setView("eligibility" as StudioView),
        cta: "Open Eligibility",
      };
    }

    if (!trackedRows.length) {
      const top = radarRows[0]?.row;
      return {
        eyebrow: "Start a portfolio",
        title: top?.scholarship_name ?? "Choose a scholarship to track",
        detail: "Tracking one scholarship unlocks workload, pathway, packet, and portfolio planning.",
        action: () => top && setSelectedAwardId(top.id),
        cta: "Inspect scholarship",
      };
    }

    const withoutDate = trackedRows.find(
      (row) => !(workspace.applications[row.id] ?? initialApplication()).targetDate
    );
    if (withoutDate) {
      return {
        eyebrow: withoutDate.university_name,
        title: "Set a target submission date",
        detail: "A target date unlocks the automatic preparation pathway and collision-aware timeline.",
        action: () => setView("applications" as StudioView),
        cta: "Open Applications",
      };
    }

    const sourceGap = trackedRows.find(
      (row) => !(workspace.applications[row.id] ?? initialApplication()).requirements.source
    );
    if (sourceGap) {
      return {
        eyebrow: sourceGap.university_name,
        title: "Review the official scholarship source",
        detail: "The source-verification checkpoint is still open for this tracked application.",
        action: () => setView("applications" as StudioView),
        cta: "Open workspace",
      };
    }

    return {
      eyebrow: "Portfolio",
      title: "Review the next application milestone",
      detail: "Your tracked scholarships have dates and source checks. Review the combined pathway for the next task.",
      action: () => setView("applications" as StudioView),
      cta: "Open pathway",
    };
  }, [completion, trackedRows, radarRows, workspace.applications]);

  const pushNotification = (title: string, body: string, kind: string) => {
    setWorkspace((current) => {
      if (current.notifications.some((item) => !item.read && item.title === title && item.body === body)) {
        return current;
      }
      const notification: StudioNotification = {
        id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        body,
        kind,
        read: false,
        createdAt: new Date().toISOString(),
      };
      return {
        ...current,
        notifications: [notification, ...current.notifications].slice(0, 40),
      };
    });
  };

  const toggleTracked = (id: string) => {
    setWorkspace((current) => {
      const exists = current.tracked.includes(id);
      const tracked = exists
        ? current.tracked.filter((value) => value !== id)
        : [...current.tracked, id];
      const applications = { ...current.applications };
      if (!exists && !applications[id]) applications[id] = initialApplication();
      return { ...current, tracked, applications };
    });
  };

  const toggleCompare = (id: string) => {
    setWorkspace((current) => {
      if (current.compare.includes(id)) {
        return { ...current, compare: current.compare.filter((value) => value !== id) };
      }
      if (current.compare.length >= 3) {
        toast("Comparison is limited to three scholarships.");
        return current;
      }
      return { ...current, compare: [...current.compare, id] };
    });
  };

  const updateApplication = (id: string, patch: Partial<StudioApplication>) => {
    setWorkspace((current) => mergeApplication(current, id, patch));
  };

  const updateDocument = (id: string, type: StudioDocumentType, checked: boolean) => {
    setWorkspace((current) => {
      const app = cloneApplication(current.applications[id] ?? initialApplication());
      app.docs[type] = checked;
      return {
        ...current,
        applications: { ...current.applications, [id]: app },
      };
    });
  };

  const updateRequirement = (
    id: string,
    key: keyof StudioApplication["requirements"],
    checked: boolean
  ) => {
    setWorkspace((current) => {
      const app = cloneApplication(current.applications[id] ?? initialApplication());
      app.requirements[key] = checked;
      return {
        ...current,
        applications: { ...current.applications, [id]: app },
      };
    });
  };

  const filterUniversity = (university: string) => {
    setActiveUniversity(university);
    setPreviewUniversity(university === "all" ? universities[0] ?? "" : university);
    requestAnimationFrame(() => {
      document.getElementById("scholarship-stream")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const saveSearchWatch = () => {
    const signature = JSON.stringify({
      university: activeUniversity,
      query: query.trim(),
      deadline: deadlineFilter,
    });
    if (
      workspace.watches.some(
        (watch) =>
          JSON.stringify({
            university: watch.university,
            query: watch.query,
            deadline: watch.deadline,
          }) === signature
      )
    ) {
      toast("That search is already being watched.");
      return;
    }
    const id = `watch-${Date.now()}`;
    const watch = {
      id,
      university: activeUniversity,
      query: query.trim(),
      deadline: deadlineFilter,
    };
    setWorkspace((current) => ({
      ...current,
      watches: [...current.watches, watch],
    }));
    const count = filtered.length;
    pushNotification(
      "Saved search watch created",
      `This search currently matches ${count} live scholarship${count === 1 ? "" : "s"}.`,
      "watch"
    );
  };

  const toggleCycleWatch = (id: string) => {
    const enabling = !workspace.cycleWatches.includes(id);
    setWorkspace((current) => ({
      ...current,
      cycleWatches: enabling
        ? [...current.cycleWatches, id]
        : current.cycleWatches.filter((value) => value !== id),
    }));
    const row = rowById.get(id);
    if (enabling && row) {
      pushNotification(
        "Cycle Watch enabled",
        `${row.university_name} · ${row.scholarship_name} is on your future-cycle watchlist.`,
        "cycle"
      );
    }
  };

  const handleVaultUpload = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) {
      toast("Choose a file first.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast("Vault limit: 15 MB per file.");
      return;
    }

    try {
      const record: VaultFileRecord = {
        id: `vault-${Date.now()}`,
        type: String(data.get("type") ?? "specific") as StudioDocumentType,
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        issuedDate: String(data.get("issuedDate") ?? ""),
        notes: String(data.get("notes") ?? ""),
        savedAt: new Date().toISOString(),
        bytes: await file.arrayBuffer(),
      };
      await vaultPut(record);
      setVaultFiles(await vaultAll());
      form.reset();
      toast("Document saved in your browser Vault.");
    } catch {
      toast("This browser could not write to the document Vault.");
    }
  };

  const removeVaultFile = async (id: string) => {
    try {
      await vaultDelete(id);
      setVaultFiles(await vaultAll());
    } catch {
      toast("Could not delete that Vault file.");
    }
  };

  const downloadVaultFile = async (id: string) => {
    const file = await vaultGet(id);
    if (!file) return;
    downloadBlob(
      file.name,
      new Blob([file.bytes], { type: file.mime || "application/octet-stream" })
    );
  };

  const buildPacket = async (row: ScholarshipStudioRow) => {
    const app = workspace.applications[row.id] ?? initialApplication();
    const files = await vaultAll();
    const packet = await buildPacketZip(row, app, files);
    downloadBlob(packet.name, packet.blob);
    toast("Application packet built.");
  };

  const exportCalendar = () => {
    const items = [
      ...workspace.reminders.map((item) => ({
        awardId: item.awardId,
        date: item.date,
        label: item.label,
      })),
      ...pathwayTasks,
    ];
    if (!items.length) {
      toast("Add reminders or target submission dates first.");
      return;
    }

    const escapeIcs = (value: string) =>
      value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KMate//Scholarship Studio//EN"];
    items.forEach((item, index) => {
      const row = rowById.get(item.awardId);
      lines.push(
        "BEGIN:VEVENT",
        `UID:kmate-${Date.now()}-${index}@scholarship-studio`,
        `DTSTART;VALUE=DATE:${item.date.replaceAll("-", "")}`,
        `SUMMARY:${escapeIcs(`${item.label}${row ? ` · ${row.university_name}` : ""}`)}`,
        `DESCRIPTION:${escapeIcs(row?.scholarship_name ?? "Scholarship Studio reminder")}`,
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    downloadBlob(
      "kmate-scholarship-calendar.ics",
      new Blob([lines.join("\r\n")], { type: "text/calendar" })
    );
  };

  const exportWorkspace = () => {
    const vaultManifest = vaultFiles.map(({ bytes: _bytes, ...meta }) => meta);
    void vaultManifest;
    downloadBlob(
      "kmate-scholarship-workspace.json",
      new Blob(
        [
          JSON.stringify(
            {
              version: 2,
              exportedAt: new Date().toISOString(),
              workspace,
              vaultManifest: vaultFiles.map((file) => ({
                id: file.id,
                type: file.type,
                name: file.name,
                size: file.size,
                mime: file.mime,
                issuedDate: file.issuedDate,
                notes: file.notes,
                savedAt: file.savedAt,
              })),
            },
            null,
            2
          ),
        ],
        { type: "application/json" }
      )
    );
  };

  const importWorkspace = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { workspace?: StudioWorkspace };
      if (!parsed.workspace || typeof parsed.workspace !== "object") throw new Error("Invalid workspace");
      setWorkspace(parsed.workspace);
      toast("Scholarship Studio workspace imported.");
    } catch {
      toast("That file is not a valid Scholarship Studio export.");
    }
  };

  const captureSnapshots = () => {
    const targets = compareRows.length
      ? compareRows
      : trackedRows.length
        ? trackedRows
        : rows.slice(0, 5);

    setWorkspace((current) => {
      const snapshots = { ...current.snapshots };
      const notifications: StudioNotification[] = [];
      targets.forEach((row) => {
        const currentSnapshot = snapshotFor(row);
        const previous = snapshots[row.id]?.[0];
        if (previous?.contentHash && currentSnapshot.contentHash && previous.contentHash !== currentSnapshot.contentHash) {
          notifications.push({
            id: `source-${row.id}-${Date.now()}`,
            title: "Scholarship source changed",
            body: `${row.university_name} · ${row.scholarship_name} has a different verified content hash than your previous snapshot.`,
            kind: "source",
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
        snapshots[row.id] = [currentSnapshot, ...(snapshots[row.id] ?? [])].slice(0, 10);
      });
      return {
        ...current,
        snapshots,
        notifications: [...notifications, ...current.notifications].slice(0, 40),
      };
    });
    toast("Current source state captured.");
  };

  const answerScholarship = () => {
    const row = assistantAwardId ? rowById.get(assistantAwardId) : null;
    if (!row) return;
    const question = assistantQuestion.toLowerCase();
    let answer = `${row.tuition_coverage ?? row.benefit_type ?? NOT_STATED}. Deadline: ${row.deadline_label}.`;

    if (/deadline|date|when/.test(question)) answer = row.deadline_label;
    else if (/topik|korean|language/.test(question)) answer = row.topik_requirement ?? NOT_STATED;
    else if (/gpa|grade|academic/.test(question)) answer = row.gpa_requirement ?? NOT_STATED;
    else if (/fund|tuition|stipend|money|benefit/.test(question)) {
      answer = row.tuition_coverage ?? row.benefit_type ?? NOT_STATED;
    } else if (/automatic|application required|apply/.test(question)) {
      answer = row.automatic_consideration
        ? "The verified record marks this scholarship as automatically considered."
        : row.application_required === false
          ? "The verified record says a separate scholarship application is not required."
          : row.application_required === true
            ? "The verified record says an application is required."
            : "Application mechanics are not stated in the structured record. Check the official source.";
    } else if (/chance|probability|win|selected/.test(question)) {
      answer =
        "Scholarship Studio does not estimate selection probability. It can only show the verified published criteria and source record.";
    }

    setAssistantAnswer(answer);
  };

  const profileFacts = [
    ["Major", workspace.profile.major || "Not entered"],
    [
      "Academic",
      workspace.profile.gpa && workspace.profile.gradingScale
        ? `${workspace.profile.gpa} / ${workspace.profile.gradingScale}`
        : "Not entered",
    ],
    ["TOPIK", workspace.profile.topik ? `Level ${workspace.profile.topik}` : "—"],
    ["IELTS", workspace.profile.ielts || "—"],
    ["Intake", workspace.profile.intake || "Not entered"],
  ];

  const evidenceSummary = {
    files: vaultFiles.length,
    applications: trackedRows.length,
    reuseLinks: vaultFiles.length * Math.max(1, trackedRows.length),
  };

  const dependencyNodes = [
    {
      label: "Profile",
      detail: completion >= 70 ? "Reusable profile ready" : "Complete the reusable profile",
      ready: completion >= 70,
    },
    {
      label: "Language evidence",
      detail:
        workspace.profile.topik || workspace.profile.ielts || workspace.profile.toefl
          ? "Language score recorded"
          : "TOPIK / IELTS / TOEFL missing",
      ready: Boolean(workspace.profile.topik || workspace.profile.ielts || workspace.profile.toefl),
    },
    {
      label: "Core evidence",
      detail:
        COMMON_DOCUMENT_TYPES.filter((type) => vaultFiles.some((file) => file.type === type)).length >= 3
          ? "Vault coverage is strong"
          : "Add core documents to the Vault",
      ready:
        COMMON_DOCUMENT_TYPES.filter((type) => vaultFiles.some((file) => file.type === type)).length >= 3,
    },
    {
      label: "Source review",
      detail:
        trackedRows.length &&
        trackedRows.every(
          (row) => (workspace.applications[row.id] ?? initialApplication()).requirements.source
        )
          ? "Tracked sources checked"
          : "Verify official sources",
      ready:
        trackedRows.length > 0 &&
        trackedRows.every(
          (row) => (workspace.applications[row.id] ?? initialApplication()).requirements.source
        ),
    },
  ];
  const dependenciesReady = dependencyNodes.every((node) => node.ready);

  const unreadNotifications = workspace.notifications.filter((item) => !item.read).length;

  const comparisonCost = {
    tuition: Number(calcTuition) || 0,
    living: Number(calcLiving) || 0,
    months: Math.max(1, Number(calcMonths) || 12),
    oneTime: Number(calcOneTime) || 0,
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-5 sm:px-6 lg:px-8">
      <nav className="sticky top-2 z-30 mb-3 flex items-center gap-1 overflow-x-auto rounded-xl border border-hairline bg-surface/90 p-1 shadow-xs backdrop-blur-xl md:top-3">
        {([
          ["discover", "Discover"],
          ["eligibility", "Eligibility"],
          ["applications", "Applications"],
          ["compare", "Compare"],
        ] as Array<[StudioView, string]>).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              "h-10 shrink-0 rounded-lg px-3.5 text-[12px] font-semibold transition-colors",
              view === id
                ? "bg-primary text-white shadow-[0_4px_14px_rgba(62,99,221,0.16)]"
                : "text-muted hover:bg-canvas hover:text-ink"
            )}
          >
            {label}
            {id === "applications" && (
              <span className="ml-1.5 rounded-full bg-current/10 px-1.5 py-0.5 text-[8px]">
                {workspace.tracked.length}
              </span>
            )}
            {id === "compare" && (
              <span className="ml-1.5 rounded-full bg-current/10 px-1.5 py-0.5 text-[8px]">
                {workspace.compare.length}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setNotificationsOpen(true)}
          className="ml-auto h-10 shrink-0 rounded-lg border border-border bg-white px-3 text-[10px] font-semibold text-muted hover:bg-primary-soft hover:text-primary"
        >
          Alerts {unreadNotifications > 0 && <b className="ml-1 text-primary">{unreadNotifications}</b>}
        </button>
        <button
          type="button"
          onClick={() => {
            setAssistantAwardId(workspace.compare[0] ?? workspace.tracked[0] ?? rows[0]?.id ?? null);
            setAssistantQuestion("");
            setAssistantAnswer("");
          }}
          className="h-10 shrink-0 rounded-lg border border-border bg-white px-3 text-[10px] font-semibold text-muted hover:bg-primary-soft hover:text-primary"
        >
          Ask scholarship
        </button>
      </nav>

      {view === "discover" && (
        <>
          <section
            id="discover"
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setPointer({
                x: ((event.clientX - rect.left) / rect.width) * 100,
                y: ((event.clientY - rect.top) / rect.height) * 100,
              });
            }}
            className="relative isolate min-h-[560px] overflow-hidden rounded-[28px] bg-surface text-ink shadow-card ring-1 ring-hairline"
            style={{
              backgroundImage: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, rgba(62,99,221,.10), transparent 24%), radial-gradient(ellipse 52% 48% at 76% 34%, rgba(62,99,221,.07), transparent 72%)`,
            }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(18,21,33,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(18,21,33,.045)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_82%_76%_at_50%_0%,black_38%,transparent_92%)]" />

            <div className="relative z-10 flex items-center justify-between gap-4 border-b border-hairline px-5 py-4 text-[10px] font-semibold text-muted/60 sm:px-7">
              <span>KMATE / SCHOLARSHIP STUDIO</span>
              <span className="hidden sm:block">UNIVERSITY FUNDING · KOREA</span>
              <span>{rows.length} LIVE INDEXED AWARDS</span>
            </div>

            <div className="relative z-10 grid min-h-[396px] gap-10 px-5 py-12 sm:px-7 lg:grid-cols-[minmax(0,1.18fr)_minmax(310px,.82fr)] lg:px-10 lg:py-14">
              <div className="flex flex-col justify-end">
                <p className="mb-5 flex items-center gap-2 text-[11px] font-semibold text-muted">
                  <CircleDot className="h-3.5 w-3.5 text-gks-u" />
                  Source-linked university scholarships
                </p>
                <h1 className="max-w-[860px] text-balance text-[clamp(48px,6.8vw,92px)] font-semibold leading-[0.96] tracking-[-0.045em] text-ink">
                  Scholarships{" "}
                  <em className="font-serif font-normal italic tracking-normal text-primary">
                    worth your time.
                  </em>
                </h1>
                <p className="mt-6 max-w-[610px] text-[14px] leading-7 text-muted sm:text-[15px]">
                  Find university funding, inspect the published rules, save the awards that matter, and run the entire application workflow inside KMate.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-5">
                  <button
                    type="button"
                    onClick={() =>
                      document.getElementById("scholarship-stream")?.scrollIntoView({ behavior: "smooth" })
                    }
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[12px] font-medium text-white shadow-xs transition-[transform,box-shadow,background] duration-150 hover:bg-ink/90 hover:shadow-card active:scale-[0.97]"
                  >
                    Explore scholarships
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("eligibility")}
                    className="inline-flex h-11 items-center gap-2 text-[12px] font-medium text-muted transition-colors hover:text-ink"
                  >
                    Check my profile
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="relative flex items-end lg:justify-end">
                <div className="glow-wash pointer-events-none absolute -inset-6 opacity-80" aria-hidden />
                <div className="relative w-full max-w-[390px] rounded-[24px] bg-white p-5 shadow-card ring-1 ring-primary/15 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                      Live funding signal
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gks-u/10 px-2 py-1 text-[8px] font-semibold text-gks-u">
                      <span className="h-1.5 w-1.5 rounded-full bg-gks-u" />
                      Scholarship Studio
                    </span>
                  </div>
                  <div className="mt-7 min-h-[170px]">
                    <p className="text-[12px] text-muted">{activePreview.place}</p>
                    <p className="mt-2 text-[clamp(34px,3.8vw,54px)] font-semibold leading-[0.98] tracking-[-0.045em] text-ink">
                      {activePreview.name || "University"}
                    </p>
                    <div className="mt-4 flex items-center gap-3 text-[11px] text-muted">
                      <span>
                        <b className="text-primary">{activePreview.count}</b> indexed awards
                      </span>
                      <span className="h-1 w-1 rounded-full bg-muted/30" />
                      <span>official sources</span>
                    </div>
                    <p className="mt-6 max-w-[320px] text-[12px] leading-6 text-muted">
                      {activePreview.headline}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => filterUniversity(activePreview.name)}
                    className="mt-5 inline-flex items-center gap-2 text-[11px] font-semibold text-primary hover:text-primary-hover"
                  >
                    Show these awards
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="relative z-10 grid border-t border-hairline bg-white/62 sm:grid-cols-2 lg:grid-cols-4">
              {universities.slice(0, 4).map((university, index) => {
                const count = rows.filter((row) => row.university_name === university).length;
                const active = previewUniversity === university;
                return (
                  <button
                    key={university}
                    type="button"
                    onPointerEnter={() => setPreviewUniversity(university)}
                    onFocus={() => setPreviewUniversity(university)}
                    onClick={() => filterUniversity(university)}
                    className={cn(
                      "group relative min-h-[88px] border-b border-hairline px-5 py-4 text-left transition-colors sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0",
                      active ? "bg-primary-soft" : "hover:bg-canvas"
                    )}
                  >
                    <span className="text-[9px] font-semibold text-muted/45">0{index + 1}</span>
                    <p className="mt-4 text-[16px] font-semibold tracking-[-0.025em] text-ink transition-colors group-hover:text-primary">
                      {university}
                    </p>
                    <p className="mt-1 text-[9px] text-muted">{count} awards</p>
                    <span
                      className={cn(
                        "absolute bottom-3 left-0 top-3 w-[2px] rounded-full bg-primary transition-opacity",
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-3 grid overflow-hidden rounded-xl border border-hairline bg-surface sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["01", "Discover", "Find university funding", "discover"],
              ["02", "Check", "Evaluate published criteria", "eligibility"],
              ["03", "Track", "Run application workspaces", "applications"],
              ["04", "Compare", "Put the terms side by side", "compare"],
            ].map(([number, label, detail, target]) => (
              <button
                key={label}
                type="button"
                onClick={() => setView(target as StudioView)}
                className="group relative grid min-h-[88px] grid-cols-[22px_1fr] gap-2 border-r border-hairline px-4 py-4 text-left transition-colors last:border-r-0 hover:bg-primary-soft"
              >
                <span className="text-[9px] font-semibold text-muted/45">{number}</span>
                <div>
                  <p className="text-[16px] font-medium tracking-[-0.025em] text-ink">{label}</p>
                  <p className="mt-1 text-[10px] text-muted">{detail}</p>
                </div>
                <ArrowUpRight className="absolute right-4 top-4 h-3.5 w-3.5 text-muted/30 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            ))}
          </section>

          <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
            <div className="rounded-2xl border border-hairline bg-surface p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
                    Personalized radar
                  </p>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">
                    Your scholarship signal
                  </h2>
                  <p className="mt-1 text-[10px] text-muted">
                    Relevance from your profile and published fields — never a selection probability.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView("eligibility")}
                  className="text-[9px] font-semibold text-primary"
                >
                  Edit profile
                </button>
              </div>
              {completion < 35 ? (
                <div className="mt-4 rounded-xl border border-dashed border-hairline-strong bg-canvas p-5">
                  <p className="text-[12px] font-semibold">Build your profile to personalize the radar.</p>
                  <button
                    type="button"
                    onClick={() => setView("eligibility")}
                    className="mt-3 text-[9px] font-semibold text-primary"
                  >
                    Complete profile →
                  </button>
                </div>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {radarRows.map(({ row, reasons }) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelectedAwardId(row.id)}
                      className="relative min-h-[92px] rounded-xl border border-hairline bg-canvas p-3 text-left hover:border-primary/20 hover:bg-primary-soft"
                    >
                      <span className="text-[8px] font-semibold text-primary">{row.university_name}</span>
                      <strong className="mt-1 block pr-6 text-[11px] leading-4">{row.scholarship_name}</strong>
                      <small className="mt-2 block text-[8px] text-muted">
                        {reasons.length ? reasons.join(" · ") : "Needs source review"}
                      </small>
                      <ArrowUpRight className="absolute right-3 top-3 h-3 w-3 text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="rounded-2xl border border-hairline bg-surface p-5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Saved search watch</p>
              <h3 className="mt-1 text-[18px] font-semibold tracking-[-0.03em]">Watch this search</h3>
              <p className="mt-2 text-[9px] leading-4 text-muted">
                Save the current university, deadline, and search filters. Watch events stay inside your Studio alerts.
              </p>
              <button
                type="button"
                onClick={saveSearchWatch}
                className="mt-4 h-10 w-full rounded-full bg-ink text-[9px] font-semibold text-white"
              >
                ＋ Save current search
              </button>
              <div className="mt-3 grid gap-1.5">
                {workspace.watches.length ? (
                  workspace.watches.map((watch) => (
                    <div
                      key={watch.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-canvas px-2.5 py-2 text-[8px]"
                    >
                      <span className="truncate">
                        {watch.university === "all" ? "All universities" : watch.university}
                        {watch.query ? ` · “${watch.query}”` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setWorkspace((current) => ({
                            ...current,
                            watches: current.watches.filter((item) => item.id !== watch.id),
                          }))
                        }
                        aria-label="Remove saved search"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="mt-1 text-[8px] text-muted">No saved searches yet.</p>
                )}
              </div>
            </aside>
          </section>

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
                  Next Best Action
                </p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">
                  One useful move, right now.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => nextAction.action()}
                className="hidden text-[9px] font-semibold text-primary sm:block"
              >
                {nextAction.cta} →
              </button>
            </div>
            <article className="mt-4 flex min-h-[116px] flex-col justify-between gap-5 rounded-xl border border-primary/10 bg-[radial-gradient(circle_at_90%_0,rgba(62,99,221,.07),transparent_35%)] bg-canvas p-5 sm:flex-row sm:items-center">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">
                  {nextAction.eyebrow}
                </span>
                <h3 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">{nextAction.title}</h3>
                <p className="mt-1 max-w-[760px] text-[9.5px] leading-4 text-muted">{nextAction.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => nextAction.action()}
                className="h-10 shrink-0 rounded-full bg-ink px-4 text-[9px] font-semibold text-white"
              >
                {nextAction.cta} →
              </button>
            </article>
          </section>

          <section id="scholarship-stream" className="scroll-mt-24 pt-8">
            <div className="sticky top-[70px] z-20 rounded-xl border border-hairline bg-surface/95 p-4 shadow-xs backdrop-blur-xl">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gks-u">
                    Scholarship stream
                  </p>
                  <h2 className="mt-1 text-[clamp(26px,3vw,38px)] font-medium tracking-[-0.045em]">
                    {rows.length} awards. One working view.
                  </h2>
                  <p className="mt-1 text-[11px] text-muted">
                    Click any scholarship row to open its full record.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <CircleDot className="h-3.5 w-3.5 text-success" />
                  Live from KMate&apos;s scholarship index
                </div>
              </div>

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setActiveUniversity("all")}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-2 text-[10px] font-semibold",
                    activeUniversity === "all"
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-white text-muted hover:bg-primary-soft"
                  )}
                >
                  All <span className="ml-1 opacity-60">{rows.length}</span>
                </button>
                {universities.map((university) => (
                  <button
                    key={university}
                    type="button"
                    onClick={() => setActiveUniversity(university)}
                    className={cn(
                      "shrink-0 rounded-lg border px-3 py-2 text-[10px] font-semibold",
                      activeUniversity === university
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-white text-muted hover:bg-primary-soft"
                    )}
                  >
                    {university}{" "}
                    <span className="ml-1 opacity-60">
                      {rows.filter((row) => row.university_name === university).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_170px_170px_auto]">
                <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-canvas/65 px-3 focus-within:border-primary">
                  <Search className="h-4 w-4 text-muted/60" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search awards, funding, GPA, TOPIK…"
                    className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted/50"
                  />
                </label>
                <label className="relative flex h-11 items-center rounded-lg border border-border bg-white">
                  <SlidersHorizontal className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted/55" />
                  <select
                    value={activeUniversity}
                    onChange={(event) => setActiveUniversity(event.target.value)}
                    className="h-full w-full appearance-none bg-transparent pl-9 pr-3 text-[11px] font-medium text-muted outline-none"
                  >
                    <option value="all">All universities</option>
                    {universities.map((university) => (
                      <option key={university} value={university}>
                        {university}
                      </option>
                    ))}
                  </select>
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as "all" | "expiring")}
                  className="h-11 rounded-lg border border-border bg-white px-3 text-[11px] font-medium text-muted outline-none"
                >
                  <option value="all">All statuses</option>
                  <option value="expiring">Closing soon</option>
                </select>
                <select
                  value={deadlineFilter}
                  onChange={(event) =>
                    setDeadlineFilter(
                      event.target.value as "all" | "fixed" | "admission_schedule" | "automatic"
                    )
                  }
                  className="h-11 rounded-lg border border-border bg-white px-3 text-[11px] font-medium text-muted outline-none"
                >
                  <option value="all">All deadline types</option>
                  <option value="fixed">Fixed date</option>
                  <option value="admission_schedule">Admission schedule</option>
                  <option value="automatic">Automatic</option>
                </select>
                <div className="flex h-11 items-center justify-between gap-3 px-1 text-[10px] text-muted">
                  <span>{filtered.length} shown</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveUniversity("all");
                      setQuery("");
                      setStatusFilter("all");
                      setDeadlineFilter("all");
                    }}
                    className="font-semibold text-primary"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-hairline bg-surface">
              {filtered.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <p className="text-[18px] font-medium">Nothing matches this view.</p>
                  <p className="mt-2 text-[11px] text-muted">Try another university, deadline type, or search term.</p>
                </div>
              ) : (
                filtered.map((row, index) => {
                  const isTracked = workspace.tracked.includes(row.id);
                  const isCompared = workspace.compare.includes(row.id);
                  return (
                    <article
                      key={row.id}
                      className={cn(
                        "border-b border-hairline last:border-b-0",
                        isTracked && "bg-success/[0.018]",
                        isCompared && "ring-1 ring-inset ring-primary/10"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedAwardId(row.id)}
                        className="group grid w-full cursor-pointer grid-cols-[50px_minmax(0,1.35fr)] gap-4 px-4 py-5 text-left transition-colors hover:bg-primary/[0.025] focus-visible:bg-primary-soft md:grid-cols-[150px_minmax(0,1.3fr)_minmax(190px,.8fr)_minmax(190px,.9fr)_46px] md:items-start md:px-5"
                      >
                        <div>
                          <p className="text-[9px] text-muted/40">{String(index + 1).padStart(2, "0")}</p>
                          <p className="mt-3 text-[11px] font-semibold">{row.university_name}</p>
                          <p className="mt-1 text-[8px] text-muted">{degreeLabel(row.degree_level)}</p>
                          <span className="mt-2 inline-flex rounded-full bg-success-soft px-2 py-1 text-[7px] font-semibold text-success">
                            {row.status === "expiring_soon" ? "Closing soon" : "Active"}
                          </span>
                        </div>
                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-primary">
                            {row.scholarship_type ?? "University scholarship"}
                          </p>
                          <h3 className="mt-1 text-[clamp(18px,2vw,26px)] font-semibold leading-[1.05] tracking-[-0.04em]">
                            {row.scholarship_name}
                          </h3>
                          <p className="mt-2 text-[9px] text-muted">
                            Deadline · <b className="text-ink">{row.deadline_label}</b>
                          </p>
                        </div>
                        <div className="hidden border-l border-hairline pl-4 md:block">
                          <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-muted/45">
                            Published funding
                          </p>
                          <strong className="mt-2 block text-[11px] leading-4">
                            {row.tuition_coverage ?? row.benefit_type ?? NOT_STATED}
                          </strong>
                        </div>
                        <div className="hidden border-l border-hairline pl-4 md:block">
                          <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-muted/45">
                            Published criteria
                          </p>
                          <strong className="mt-2 block text-[10px] leading-4">
                            {row.topik_requirement ?? "Review language rules"}
                          </strong>
                          <p className="mt-1 text-[8px] leading-4 text-muted">
                            {row.gpa_requirement ?? "Review academic rules"}
                          </p>
                        </div>
                        <span className="hidden h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-muted transition-colors group-hover:border-primary/30 group-hover:bg-primary-soft group-hover:text-primary md:flex">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-hairline bg-surface p-5">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Previous cycles</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">Archive & Cycle Watch</h2>
              <p className="mt-1 text-[10px] text-muted">
                Expired rows come from KMate&apos;s real scholarship archive. Previous terms are reference only.
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              {archivedRows.length ? (
                archivedRows.slice(0, 20).map((row) => {
                  const watched = workspace.cycleWatches.includes(row.id);
                  return (
                    <article
                      key={row.id}
                      className="flex flex-col justify-between gap-4 rounded-xl border border-hairline bg-canvas p-3 sm:flex-row sm:items-center"
                    >
                      <div>
                        <span className="text-[8px] font-semibold text-primary">{row.university_name}</span>
                        <h3 className="mt-1 text-[11px] font-semibold">{row.scholarship_name}</h3>
                        <p className="mt-1 text-[8px] text-muted">{row.deadline_label}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCycleWatch(row.id)}
                          className={cn(
                            "h-9 rounded-lg border px-3 text-[8px] font-semibold",
                            watched
                              ? "border-primary/20 bg-primary-soft text-primary"
                              : "border-border bg-white text-ink"
                          )}
                        >
                          {watched ? "✓ Watching next cycle" : "◌ Watch next cycle"}
                        </button>
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex h-9 items-center rounded-lg bg-ink px-3 text-[8px] font-semibold text-white"
                        >
                          Source ↗
                        </a>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="rounded-xl border border-dashed border-hairline-strong bg-canvas p-5 text-[9px] text-muted">
                  No expired scholarship rows are currently stored in KMate&apos;s archive.
                </p>
              )}
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Community context</p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">
                  Applicant notes, separate from official facts.
                </h2>
                <p className="mt-1 text-[10px] text-muted">
                  Local notes never overwrite the verified scholarship record.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!communityDraft.trim()) return;
                  const awardId = workspace.tracked[0] ?? "";
                  setWorkspace((current) => ({
                    ...current,
                    communityNotes: [
                      {
                        id: `community-${Date.now()}`,
                        awardId,
                        body: communityDraft.trim(),
                        createdAt: new Date().toISOString(),
                      },
                      ...current.communityNotes,
                    ],
                  }));
                  setCommunityDraft("");
                }}
                className="flex gap-2"
              >
                <input
                  value={communityDraft}
                  onChange={(event) => setCommunityDraft(event.target.value)}
                  placeholder="Add a process observation — never an official rule."
                  className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-[12px] outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  className="h-11 rounded-lg bg-ink px-4 text-[9px] font-semibold text-white"
                >
                  Add note
                </button>
              </form>
              {workspace.communityNotes.map((note) => {
                const row = rowById.get(note.awardId);
                return (
                  <article
                    key={note.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-canvas p-3"
                  >
                    <div>
                      <span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-primary">
                        Community note{row ? ` · ${row.university_name}` : ""}
                      </span>
                      <p className="mt-1 text-[9px] leading-4 text-muted">{note.body}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setWorkspace((current) => ({
                          ...current,
                          communityNotes: current.communityNotes.filter((item) => item.id !== note.id),
                        }))
                      }
                      aria-label="Delete community note"
                      className="text-muted"
                    >
                      ×
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {view === "eligibility" && (
        <>
          <header className="grid gap-8 border-b border-hairline py-10 lg:grid-cols-[1fr_280px] lg:items-end">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Eligibility workspace</p>
              <h1 className="mt-2 max-w-[900px] text-[clamp(38px,5vw,68px)] font-semibold leading-[.97] tracking-[-0.05em]">
                One profile. Every published criterion in view.
              </h1>
              <p className="mt-4 max-w-[720px] text-[11px] leading-5 text-muted">
                Explainable checks only. Scholarship Studio does not predict admission or scholarship selection.
              </p>
            </div>
            <div className="rounded-2xl border border-hairline bg-surface p-4">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Profile completeness</span>
              <strong className="mt-2 block text-[30px] tracking-[-0.05em]">{completion}%</strong>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
                <i className="block h-full rounded-full bg-primary" style={{ width: `${completion}%` }} />
              </div>
            </div>
          </header>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                toast("Profile saved in Scholarship Studio.");
              }}
              className="rounded-2xl border border-hairline bg-surface p-5"
            >
              <div className="border-b border-hairline pb-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-primary">Reusable profile</p>
                <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">Your scholarship profile</h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["Major", "major"],
                  ["Nationality", "nationality"],
                  ["Education status", "education"],
                  ["GPA / score", "gpa"],
                  ["TOPIK level", "topik"],
                  ["IELTS", "ielts"],
                  ["TOEFL iBT", "toefl"],
                  ["Target intake", "intake"],
                ].map(([label, key]) => (
                  <label key={key} className="grid gap-1.5">
                    <span className="text-[8px] font-semibold text-muted">{label}</span>
                    <input
                      value={String(workspace.profile[key as keyof typeof workspace.profile] ?? "")}
                      onChange={(event) =>
                        setWorkspace((current) => ({
                          ...current,
                          profile: {
                            ...current.profile,
                            [key]: event.target.value,
                          },
                        }))
                      }
                      className="h-11 rounded-lg border border-border bg-white px-3 text-[13px] outline-none focus:border-primary"
                    />
                  </label>
                ))}
                <label className="grid gap-1.5">
                  <span className="text-[8px] font-semibold text-muted">Degree</span>
                  <select
                    value={workspace.profile.degree}
                    onChange={(event) =>
                      setWorkspace((current) => ({
                        ...current,
                        profile: {
                          ...current.profile,
                          degree: event.target.value as typeof current.profile.degree,
                        },
                      }))
                    }
                    className="h-11 rounded-lg border border-border bg-white px-3 text-[12px]"
                  >
                    <option value="">Choose…</option>
                    <option value="undergraduate">Undergraduate</option>
                    <option value="graduate">Graduate</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[8px] font-semibold text-muted">Grading scale</span>
                  <select
                    value={workspace.profile.gradingScale}
                    onChange={(event) =>
                      setWorkspace((current) => ({
                        ...current,
                        profile: {
                          ...current.profile,
                          gradingScale: event.target.value as typeof current.profile.gradingScale,
                        },
                      }))
                    }
                    className="h-11 rounded-lg border border-border bg-white px-3 text-[12px]"
                  >
                    <option value="">Choose…</option>
                    <option value="100">100-point</option>
                    <option value="4.0">4.0</option>
                    <option value="4.3">4.3</option>
                    <option value="5.0">5.0</option>
                  </select>
                </label>
                <label className="grid gap-1.5 sm:col-span-2">
                  <span className="text-[8px] font-semibold text-muted">Funding preference</span>
                  <select
                    value={workspace.profile.funding}
                    onChange={(event) =>
                      setWorkspace((current) => ({
                        ...current,
                        profile: {
                          ...current.profile,
                          funding: event.target.value as typeof current.profile.funding,
                        },
                      }))
                    }
                    className="h-11 rounded-lg border border-border bg-white px-3 text-[12px]"
                  >
                    <option value="any">Any published funding</option>
                    <option value="full">Full tuition preferred</option>
                    <option value="living">Tuition + living support preferred</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
                <p className="text-[8px] text-muted">
                  Major and application year are seeded from your KMate profile when available.
                </p>
                <button type="submit" className="h-10 rounded-full bg-ink px-4 text-[9px] font-semibold text-white">
                  Save profile
                </button>
              </div>
            </form>

            <aside className="self-start rounded-2xl border border-hairline bg-surface p-5 xl:sticky xl:top-20">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-primary">Profile reuse</p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">
                {workspace.profile.major || "Build once. Reuse everywhere."}
              </h2>
              <p className="mt-2 text-[9px] leading-4 text-muted">
                Structured checks only evaluate criteria that KMate can represent safely.
              </p>
              <div className="mt-4 divide-y divide-hairline border-y border-hairline">
                {profileFacts.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 py-2.5">
                    <span className="text-[8px] text-muted">{label}</span>
                    <b className="max-w-[65%] text-right text-[8px]">{value}</b>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <section className="mt-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Explainable matching</p>
                <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">Published-criteria signals</h2>
              </div>
              <p className="text-[8px] text-muted">Met · Review · Not met</p>
            </div>
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {eligibilityResults.map(({ row, evaluation }) => (
                <article
                  key={row.id}
                  className={cn(
                    "rounded-2xl border bg-surface p-4",
                    evaluation.status === "met"
                      ? "border-success/20 shadow-[inset_3px_0_0_var(--color-success)]"
                      : evaluation.status === "not_met"
                        ? "border-danger/20 shadow-[inset_3px_0_0_var(--color-danger)]"
                        : "border-gold/20 shadow-[inset_3px_0_0_var(--color-gold)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-[8px] font-semibold text-primary">{row.university_name}</span>
                      <h3 className="mt-1 text-[14px] font-semibold leading-5">{row.scholarship_name}</h3>
                    </div>
                    <span className="rounded-full bg-canvas px-2 py-1 text-[7px] font-semibold text-muted">
                      {evaluation.label}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 border-t border-hairline pt-3">
                    {evaluation.checks.map((check) => (
                      <div key={`${row.id}-${check.label}`} className="grid grid-cols-[10px_1fr] gap-2">
                        <i
                          className={cn(
                            "mt-1.5 h-2 w-2 rounded-full",
                            check.result === "met"
                              ? "bg-success"
                              : check.result === "not_met"
                                ? "bg-danger"
                                : "bg-gold"
                          )}
                        />
                        <div>
                          <b className="block text-[8px]">{check.label}</b>
                          <span className="mt-0.5 block text-[8px] leading-4 text-muted">{check.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
                    <button
                      type="button"
                      onClick={() => toggleTracked(row.id)}
                      className="h-8 rounded-lg border border-border bg-white px-2.5 text-[8px] font-semibold"
                    >
                      {workspace.tracked.includes(row.id) ? "✓ Tracked" : "＋ Track"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCompare(row.id)}
                      className="h-8 rounded-lg border border-border bg-white px-2.5 text-[8px] font-semibold"
                    >
                      Compare
                    </button>
                    <a
                      href={row.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="ml-auto inline-flex h-8 items-center rounded-lg bg-ink px-2.5 text-[8px] font-semibold text-white"
                    >
                      Official source ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-hairline bg-surface p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Gap Analyzer</p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">
              What should you fix or verify next?
            </h2>
            <div className="mt-4 grid gap-2">
              {gapActions.map(({ row, check }, index) => (
                <article
                  key={`${row.id}-${check.label}-${index}`}
                  className="grid gap-3 rounded-xl border border-hairline bg-canvas p-3 sm:grid-cols-[34px_1fr_auto] sm:items-center"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[8px] font-semibold text-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <small className="text-[7px] font-semibold text-primary">
                      {row.university_name} · {row.scholarship_name}
                    </small>
                    <h3 className="mt-1 text-[10px] font-semibold">{check.label}</h3>
                    <p className="mt-1 text-[8.5px] leading-4 text-muted">{check.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAwardId(row.id)}
                    className="text-left text-[8px] font-semibold text-primary"
                  >
                    Open award ↗
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
                  Universal Evidence Graph
                </p>
                <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">
                  One evidence portfolio across applications.
                </h2>
              </div>
              <div className="flex gap-3 text-[8px] text-muted">
                <b className="text-[18px] text-ink">{evidenceSummary.files}</b> files
                <b className="text-[18px] text-ink">{evidenceSummary.applications}</b> applications
                <b className="text-[18px] text-ink">{evidenceSummary.reuseLinks}</b> reuse links
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <div className="min-w-[760px]">
                {DOCUMENT_TYPES.map((type) => (
                  <article
                    key={type}
                    className="grid grid-cols-[260px_1fr] items-center gap-4 border-t border-hairline py-3 first:border-t-0"
                  >
                    <div className="flex items-center gap-3">
                      <i
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          vaultFiles.some((file) => file.type === type)
                            ? "bg-success shadow-[0_0_0_5px_var(--color-success-soft)]"
                            : "bg-gold shadow-[0_0_0_5px_var(--color-gold-soft)]"
                        )}
                      />
                      <div>
                        <span className="block text-[9px] font-semibold">{DOC_LABELS[type]}</span>
                        <small className="mt-0.5 block text-[7px] text-muted">
                          {vaultFiles.filter((file) => file.type === type).length
                            ? `${vaultFiles.filter((file) => file.type === type).length} saved file(s)`
                            : "Not in Vault"}
                        </small>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(trackedRows.length ? trackedRows : rows.slice(0, 4)).map((row) => {
                        const app = workspace.applications[row.id];
                        const checked = app?.docs[type] ?? false;
                        const available = vaultFiles.some((file) => file.type === type);
                        return (
                          <span
                            key={row.id}
                            className={cn(
                              "rounded-full border px-2.5 py-1.5 text-[7.5px] font-semibold",
                              available
                                ? "border-success/20 bg-success-soft text-success"
                                : "border-hairline bg-canvas text-muted"
                            )}
                          >
                            {row.university_name}{checked ? " ✓" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">
              Requirement Dependency Graph
            </p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">What unlocks what?</h2>
            <div className="mt-4 overflow-x-auto">
              <div className="flex min-w-[760px] items-stretch">
                {[...dependencyNodes, {
                  label: "Application readiness",
                  detail: dependenciesReady ? "Dependencies cleared" : "Blocked by upstream items",
                  ready: dependenciesReady,
                }].map((node, index, nodes) => (
                  <div key={node.label} className="flex min-w-0 flex-1 items-center">
                    <article
                      className={cn(
                        "min-h-[104px] min-w-[142px] flex-1 rounded-xl border p-3",
                        node.ready
                          ? "border-success/20 bg-success-soft"
                          : "border-gold/20 bg-gold-soft"
                      )}
                    >
                      <span className="text-[7px] font-bold text-muted">0{index + 1}</span>
                      <b className="mt-4 block text-[10px]">{node.label}</b>
                      <small className="mt-1 block text-[7.5px] leading-3 text-muted">{node.detail}</small>
                    </article>
                    {index < nodes.length - 1 && (
                      <i className="w-7 shrink-0 text-center text-[12px] not-italic text-muted">→</i>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Document Vault</p>
                <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.035em]">Store once. Reuse across applications.</h2>
                <p className="mt-1 text-[9px] text-muted">
                  Files are stored in this browser using IndexedDB. They are not uploaded to KMate yet.
                </p>
              </div>
              <div className="text-[8px] text-muted">
                <b className="mr-1 text-[22px] text-ink">{vaultFiles.length}</b> saved files
              </div>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_.9fr]">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleVaultUpload(event.currentTarget);
                }}
                className="rounded-xl border border-hairline bg-canvas p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-[8px] font-semibold text-muted">Document type</span>
                    <select name="type" className="h-11 rounded-lg border border-border bg-white px-3 text-[12px]">
                      {DOCUMENT_TYPES.map((type) => (
                        <option key={type} value={type}>{DOC_LABELS[type]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[8px] font-semibold text-muted">File</span>
                    <input
                      name="file"
                      type="file"
                      required
                      className="h-11 rounded-lg border border-border bg-white p-2 text-[11px]"
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[8px] font-semibold text-muted">Issued / valid date</span>
                    <input name="issuedDate" type="date" className="h-11 rounded-lg border border-border bg-white px-3 text-[12px]" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-[8px] font-semibold text-muted">Notes</span>
                    <input name="notes" placeholder="apostilled, English original…" className="h-11 rounded-lg border border-border bg-white px-3 text-[12px]" />
                  </label>
                </div>
                <button type="submit" className="mt-4 h-10 rounded-full bg-ink px-4 text-[9px] font-semibold text-white">
                  Save document
                </button>
              </form>

              <div className="rounded-xl border border-hairline bg-canvas p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-primary">Saved evidence</p>
                <div className="mt-3 grid gap-2">
                  {vaultFiles.length ? vaultFiles.map((file) => (
                    <article key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-white p-2.5">
                      <div className="min-w-0">
                        <span className="text-[7px] font-semibold text-primary">{DOC_LABELS[file.type]}</span>
                        <h3 className="truncate text-[10px] font-semibold">{file.name}</h3>
                        <p className="text-[7px] text-muted">{Math.ceil(file.size / 1024)} KB{file.issuedDate ? ` · ${formatShortDate(file.issuedDate)}` : ""}</p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => void downloadVaultFile(file.id)} className="h-8 rounded-lg border border-border px-2 text-[7px]">Download</button>
                        <button type="button" onClick={() => void removeVaultFile(file.id)} className="h-8 rounded-lg border border-border px-2 text-[7px] text-danger">Delete</button>
                      </div>
                    </article>
                  )) : (
                    <p className="rounded-lg border border-dashed border-hairline-strong bg-white p-4 text-[8px] text-muted">
                      Your Vault is empty.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {view === "applications" && (
        <>
          <header className="grid gap-8 border-b border-hairline py-10 lg:grid-cols-[1fr_280px] lg:items-end">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Application workspace</p>
              <h1 className="mt-2 max-w-[900px] text-[clamp(38px,5vw,68px)] font-semibold leading-[.97] tracking-[-0.05em]">
                Every tracked scholarship gets its own control room.
              </h1>
            </div>
            <div className="rounded-2xl border border-hairline bg-surface p-4">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Active workspaces</span>
              <strong className="mt-2 block text-[30px] tracking-[-0.05em]">{trackedRows.length}</strong>
              <p className="mt-1 text-[8px] text-muted">Tracked scholarships in this Studio</p>
            </div>
          </header>

          <section className="mt-5 grid gap-3 xl:grid-cols-2">
            <article className="rounded-2xl border border-hairline bg-surface p-5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Workload Map</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">How much work is left?</h2>
              <div className="mt-4 grid gap-2">
                {trackedRows.length ? trackedRows.map((row) => {
                  const app = workspace.applications[row.id] ?? initialApplication();
                  const load = workload(app);
                  return (
                    <article key={row.id} className="grid gap-2 rounded-xl border border-hairline bg-canvas p-3 md:grid-cols-[1fr_140px_180px] md:items-center">
                      <div>
                        <span className="text-[7px] font-semibold text-primary">{row.university_name}</span>
                        <b className="mt-1 block text-[9px]">{row.scholarship_name}</b>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <i className="block h-full rounded-full bg-primary" style={{ width: `${load.readiness}%` }} />
                      </div>
                      <div>
                        <strong className="block text-[9px]">{load.level} effort</strong>
                        <small className="mt-0.5 block text-[7px] text-muted">
                          {load.docs} docs · {load.requirements} source checks · {app.targetDate ? "date set" : "date missing"}
                        </small>
                      </div>
                    </article>
                  );
                }) : (
                  <p className="rounded-xl border border-dashed border-hairline-strong bg-canvas p-5 text-[9px] text-muted">Track scholarships to map workload.</p>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-hairline bg-surface p-5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Portfolio Planner</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">Reuse more. Duplicate less.</h2>
              {trackedRows.length ? (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      ["Applications", trackedRows.length],
                      ["Document slots done", trackedRows.reduce((sum, row) => sum + Object.values((workspace.applications[row.id] ?? initialApplication()).docs).filter(Boolean).length, 0)],
                      ["Vault doc types", new Set(vaultFiles.map((file) => file.type)).size],
                      ["Open source checks", trackedRows.reduce((sum, row) => sum + Object.values((workspace.applications[row.id] ?? initialApplication()).requirements).filter((value) => !value).length, 0)],
                      ["Target dates set", trackedRows.filter((row) => (workspace.applications[row.id] ?? initialApplication()).targetDate).length],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl border border-hairline bg-canvas p-3">
                        <span className="block text-[7px] text-muted">{label}</span>
                        <b className="mt-1 block text-[18px]">{value}</b>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[8px] leading-4 text-muted">
                    {new Set(vaultFiles.map((file) => file.type)).size
                      ? "Saved evidence can be reused across tracked applications where the official requirement is compatible."
                      : "Add documents to the Vault to unlock evidence reuse."}
                  </p>
                </>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-hairline-strong bg-canvas p-5 text-[9px] text-muted">
                  Track scholarships to build a portfolio.
                </p>
              )}
            </article>
          </section>

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Application Pathway</p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">One plan across every tracked scholarship.</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setEmailAwardId(trackedRows[0]?.id ?? ""); setEmailText(""); setPendingEmailUpdate(null); setEmailOpen(true); }} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">Import email update</button>
                <button type="button" onClick={exportCalendar} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">Export calendar</button>
                <button type="button" onClick={exportWorkspace} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">Export workspace</button>
                <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">
                  Import workspace
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importWorkspace(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Tracked", trackedRows.length],
                ["Docs completed", trackedRows.reduce((sum, row) => sum + Object.values((workspace.applications[row.id] ?? initialApplication()).docs).filter(Boolean).length, 0)],
                ["Open source checks", trackedRows.reduce((sum, row) => sum + Object.values((workspace.applications[row.id] ?? initialApplication()).requirements).filter((value) => !value).length, 0)],
                ["Generated tasks", pathwayTasks.length],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-hairline bg-canvas p-3">
                  <span className="text-[7px] text-muted">{label}</span>
                  <b className="mt-1 block text-[18px]">{value}</b>
                </div>
              ))}
            </div>

            <div className="mt-4 divide-y divide-hairline border-t border-hairline">
              {pathwayTasks.length ? pathwayTasks.map((task) => {
                const row = rowById.get(task.awardId);
                return (
                  <article key={task.id} className="grid gap-2 py-3 sm:grid-cols-[110px_1fr]">
                    <time className="text-[8px] font-semibold">{formatShortDate(task.date)}</time>
                    <div>
                      <span className="text-[7px] font-semibold text-primary">{row?.university_name}</span>
                      <b className="mt-0.5 block text-[9px]">{task.label}</b>
                      <small className="text-[7px] text-muted">{row?.scholarship_name}</small>
                    </div>
                  </article>
                );
              }) : (
                <p className="py-5 text-[9px] text-muted">Set target submission dates below to generate the combined pathway.</p>
              )}
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Deadline intelligence</p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">Timeline & collision watch</h2>
              </div>
              <button type="button" onClick={() => { setReminderAwardId(trackedRows[0]?.id ?? ""); setReminderOpen(true); }} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">＋ Add reminder</button>
            </div>
            <div className="mt-4 grid gap-2">
              {timelineItems.length ? timelineItems.map((item, index) => {
                const previous = timelineItems[index - 1];
                const next = timelineItems[index + 1];
                const currentDate = new Date(`${item.date}T00:00:00`);
                const collision = [previous, next].filter(Boolean).some((other) => {
                  const otherDate = new Date(`${other!.date}T00:00:00`);
                  return Math.abs(otherDate.getTime() - currentDate.getTime()) / 86_400_000 <= 3;
                });
                const row = rowById.get(item.awardId);
                return (
                  <article key={`${item.id}-${item.auto ? "auto" : "manual"}`} className={cn("grid gap-3 rounded-xl border p-3 sm:grid-cols-[120px_1fr_auto_auto] sm:items-center", collision ? "border-gold/20 bg-gold-soft" : "border-hairline bg-canvas")}>
                    <div>
                      <b className="block text-[9px]">{formatShortDate(item.date)}</b>
                      <small className="text-[7px] text-muted">{item.auto ? "auto plan" : "reminder"}</small>
                    </div>
                    <div>
                      <span className="text-[7px] font-semibold text-primary">{row?.university_name ?? "General"}</span>
                      <strong className="mt-0.5 block text-[9px]">{item.label}</strong>
                    </div>
                    {collision && <span className="text-[7px] font-semibold text-gold">Deadline collision</span>}
                    {!item.auto && (
                      <button
                        type="button"
                        onClick={() => setWorkspace((current) => ({ ...current, reminders: current.reminders.filter((reminder) => reminder.id !== item.id) }))}
                        className="h-8 w-8 rounded-lg bg-white text-muted"
                      >
                        ×
                      </button>
                    )}
                  </article>
                );
              }) : (
                <p className="rounded-xl border border-dashed border-hairline-strong bg-canvas p-5 text-[9px] text-muted">No timeline items yet.</p>
              )}
            </div>
          </section>

          <div className="mt-4 grid gap-3">
            {trackedRows.length ? trackedRows.map((row) => {
              const app = workspace.applications[row.id] ?? initialApplication();
              const progress = applicationProgress(app);
              const reviews = workspace.reviews.filter((review) => review.awardId === row.id);
              return (
                <article key={row.id} className="rounded-2xl border border-hairline bg-surface p-5">
                  <div className="grid gap-4 lg:grid-cols-[1fr_160px]">
                    <div>
                      <span className="text-[8px] font-semibold text-primary">{row.university_name}</span>
                      <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">{row.scholarship_name}</h2>
                      <p className="mt-1 text-[8px] text-muted">{row.tuition_coverage ?? row.benefit_type ?? NOT_STATED} · {row.deadline_label}</p>
                    </div>
                    <div>
                      <strong className="block text-right text-[18px]">{progress}%</strong>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
                        <i className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                      <small className="mt-1 block text-right text-[7px] text-muted">workspace progress</small>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 border-y border-hairline py-3 md:grid-cols-[1fr_1fr_90px_auto]">
                    <label>
                      <span className="block text-[7px] font-bold uppercase tracking-[0.08em] text-muted">Stage</span>
                      <select value={app.stage} onChange={(event) => updateApplication(row.id, { stage: event.target.value as StudioApplication["stage"] })} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-2 text-[9px]">
                        {["Researching", "Preparing documents", "Ready to submit", "Submitted", "Interview", "Result"].map((value) => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="block text-[7px] font-bold uppercase tracking-[0.08em] text-muted">Target submission</span>
                      <input type="date" value={app.targetDate} onChange={(event) => updateApplication(row.id, { targetDate: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-2 text-[9px]" />
                    </label>
                    <div>
                      <span className="block text-[7px] font-bold uppercase tracking-[0.08em] text-muted">Reminders</span>
                      <b className="mt-2 block text-[14px]">{workspace.reminders.filter((item) => item.awardId === row.id).length}</b>
                    </div>
                    <a href={row.source_url} target="_blank" rel="noreferrer noopener" className="self-center text-[8px] font-semibold text-primary">Official source ↗</a>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    <section className="rounded-xl border border-hairline bg-canvas p-3">
                      <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">Documents</p>
                      <div className="mt-3 grid gap-2">
                        {DOCUMENT_TYPES.map((type) => (
                          <label key={type} className="flex gap-2 text-[8.5px]">
                            <input type="checkbox" checked={app.docs[type]} onChange={(event) => updateDocument(row.id, type, event.target.checked)} className="accent-primary" />
                            <span>{DOC_LABELS[type]}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-hairline bg-canvas p-3">
                      <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">Requirements</p>
                      <div className="mt-3 grid gap-2">
                        {([
                          ["source", "Official source reviewed"],
                          ["criteria", "Published criteria checked"],
                          ["deadline", "Current deadline behavior checked"],
                        ] as const).map(([key, label]) => (
                          <label key={key} className="flex gap-2 text-[8.5px]">
                            <input type="checkbox" checked={app.requirements[key]} onChange={(event) => updateRequirement(row.id, key, event.target.checked)} className="accent-primary" />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-hairline bg-canvas p-3">
                      <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">Milestones</p>
                      <div className="mt-3 grid gap-2">
                        <label className="grid grid-cols-[80px_1fr] items-center gap-2 text-[8px]">
                          <span>Submission</span>
                          <select value={app.submission} onChange={(event) => updateApplication(row.id, { submission: event.target.value as StudioApplication["submission"] })} className="h-9 rounded-lg border border-border bg-white px-2">
                            {["Not started", "Preparing", "Submitted"].map((value) => <option key={value}>{value}</option>)}
                          </select>
                        </label>
                        <label className="grid grid-cols-[80px_1fr] items-center gap-2 text-[8px]">
                          <span>Interview</span>
                          <select value={app.interview} onChange={(event) => updateApplication(row.id, { interview: event.target.value as StudioApplication["interview"] })} className="h-9 rounded-lg border border-border bg-white px-2">
                            {["Not started", "Preparing", "Scheduled", "Completed", "Not applicable"].map((value) => <option key={value}>{value}</option>)}
                          </select>
                        </label>
                        <label className="grid grid-cols-[80px_1fr] items-center gap-2 text-[8px]">
                          <span>Result</span>
                          <select value={app.result} onChange={(event) => updateApplication(row.id, { result: event.target.value as StudioApplication["result"] })} className="h-9 rounded-lg border border-border bg-white px-2">
                            {["Pending", "Awarded", "Not awarded", "Waitlisted"].map((value) => <option key={value}>{value}</option>)}
                          </select>
                        </label>
                      </div>
                    </section>
                  </div>

                  <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-primary/10 bg-primary-soft p-3 lg:flex-row lg:items-center">
                    <div>
                      <span className="text-[7px] font-bold uppercase tracking-[0.08em] text-primary">KMate handoffs</span>
                      <p className="mt-1 text-[8px] text-muted">Carry this application into writing, interview preparation, review, or packet building.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/gks" className="inline-flex h-9 items-center rounded-lg border border-primary/15 bg-white px-3 text-[8px] font-semibold text-primary">GKS Assistant ↗</Link>
                      <Link href="/interview-db" className="inline-flex h-9 items-center rounded-lg border border-primary/15 bg-white px-3 text-[8px] font-semibold text-primary">Interview DB ↗</Link>
                      <button type="button" onClick={() => setReviewDraft({ awardId: row.id, artifact: "Personal statement", focus: "" })} className="h-9 rounded-lg border border-primary/15 bg-white px-3 text-[8px] font-semibold text-primary">＋ Peer review</button>
                      <button type="button" onClick={() => void buildPacket(row)} className="h-9 rounded-lg border border-primary/15 bg-white px-3 text-[8px] font-semibold text-primary">Build packet .zip</button>
                    </div>
                  </div>

                  {reviews.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {reviews.map((review) => (
                        <article key={review.id} className="flex items-start justify-between gap-3 rounded-lg border border-hairline bg-canvas p-2.5">
                          <div>
                            <span className="text-[7px] font-semibold text-primary">{review.artifact}</span>
                            <p className="mt-1 text-[8px] text-muted">{review.focus}</p>
                          </div>
                          <button type="button" onClick={() => setWorkspace((current) => ({ ...current, reviews: current.reviews.filter((item) => item.id !== review.id) }))} className="text-muted">×</button>
                        </article>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 border-t border-hairline pt-4 lg:grid-cols-[1fr_auto]">
                    <label>
                      <span className="text-[8px] font-semibold text-muted">Notes</span>
                      <textarea value={app.notes} onChange={(event) => updateApplication(row.id, { notes: event.target.value })} placeholder="Questions, document issues, interview notes…" className="mt-1 min-h-[88px] w-full resize-y rounded-lg border border-border bg-white p-3 text-[11px] outline-none focus:border-primary" />
                    </label>
                    <div className="flex flex-wrap items-end gap-2">
                      <button type="button" onClick={() => { setReminderAwardId(row.id); setReminderOpen(true); }} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">＋ Reminder</button>
                      <button type="button" onClick={() => toggleCompare(row.id)} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">⇄ Compare</button>
                      <button type="button" onClick={() => { setAssistantAwardId(row.id); setAssistantQuestion(""); setAssistantAnswer(""); }} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">Ask scholarship</button>
                      <button type="button" onClick={() => toggleTracked(row.id)} className="h-9 rounded-lg border border-danger/20 bg-danger-soft px-3 text-[8px] font-semibold text-danger">Remove workspace</button>
                    </div>
                  </div>
                </article>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-hairline-strong bg-surface px-6 py-14 text-center">
                <p className="text-[18px] font-medium">No application workspaces yet.</p>
                <button type="button" onClick={() => setView("discover")} className="mt-3 text-[9px] font-semibold text-primary">Browse scholarships →</button>
              </div>
            )}
          </div>
        </>
      )}

      {view === "compare" && (
        <>
          <header className="grid gap-8 border-b border-hairline py-10 lg:grid-cols-[1fr_240px] lg:items-end">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Comparison field</p>
              <h1 className="mt-2 max-w-[900px] text-[clamp(38px,5vw,68px)] font-semibold leading-[.97] tracking-[-0.05em]">
                Compare the terms, not the hype.
              </h1>
            </div>
            <div className="rounded-2xl border border-hairline bg-surface p-4">
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Selected</span>
              <strong className="mt-2 block text-[30px] tracking-[-0.05em]">{compareRows.length}/3</strong>
              <button type="button" onClick={() => setWorkspace((current) => ({ ...current, compare: [] }))} className="mt-2 text-[8px] font-semibold text-primary">Clear comparison</button>
            </div>
          </header>

          <section className="mt-5 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">What Changed?</p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">Current verified record vs your previous snapshot.</h2>
                <p className="mt-1 text-[9px] text-muted">No historical value is invented. A diff appears only after two local snapshots.</p>
              </div>
              <button type="button" onClick={captureSnapshots} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">Capture current snapshot</button>
            </div>
            <div className="mt-4 grid gap-2">
              {(compareRows.length ? compareRows : trackedRows.length ? trackedRows.slice(0, 3) : rows.slice(0, 3)).map((row) => {
                const snapshots = workspace.snapshots[row.id] ?? [];
                const current = snapshots[0];
                const previous = snapshots[1];
                return (
                  <article key={row.id} className="rounded-xl border border-hairline bg-canvas p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[7px] font-semibold text-primary">{row.university_name}</span>
                        <h3 className="mt-1 text-[10px] font-semibold">{row.scholarship_name}</h3>
                      </div>
                      <button type="button" onClick={() => setSelectedAwardId(row.id)} className="text-[8px] font-semibold text-primary">Open ↗</button>
                    </div>
                    {!previous || !current ? (
                      <p className="mt-3 text-[8px] text-muted">Need two local snapshots before a diff can be shown.</p>
                    ) : (
                      <div className="mt-3 grid gap-1.5">
                        {compareSnapshotFields(previous, current).map(([label, before, after]) => (
                          <div key={label} className={cn("grid gap-1 rounded-lg border p-2 text-[7.5px] sm:grid-cols-[80px_1fr_20px_1fr]", before !== after ? "border-gold/20 bg-gold-soft" : "border-hairline bg-white")}>
                            <b>{label}</b>
                            <span className="text-muted">{before}</span>
                            <i className="not-italic text-muted">→</i>
                            <strong>{after}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Funding calculator</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">Estimate the gap after published support.</h2>
            <p className="mt-1 text-[9px] text-muted">Planning calculator only. It uses your assumptions and only scholarship values that can be parsed from KMate&apos;s verified fields.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Annual tuition assumption (₩)", calcTuition, setCalcTuition],
                ["Monthly living budget (₩)", calcLiving, setCalcLiving],
                ["Study months", calcMonths, setCalcMonths],
                ["One-time costs (₩)", calcOneTime, setCalcOneTime],
              ].map(([label, value, setter]) => (
                <label key={String(label)} className="grid gap-1.5">
                  <span className="text-[8px] font-semibold text-muted">{String(label)}</span>
                  <input value={String(value)} onChange={(event) => (setter as (value: string) => void)(event.target.value)} type="number" className="h-10 rounded-lg border border-border bg-white px-3 text-[11px]" />
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-2 xl:grid-cols-3">
              {(compareRows.length ? compareRows : trackedRows.slice(0, 3)).map((row) => {
                const model = fundingModel(row);
                const base = comparisonCost.tuition + comparisonCost.living * comparisonCost.months + comparisonCost.oneTime;
                const support = comparisonCost.tuition * (model.tuitionPct / 100) + model.stipendMonthly * comparisonCost.months;
                const gap = Math.max(0, base - support);
                return (
                  <article key={row.id} className="rounded-xl border border-hairline bg-canvas p-3">
                    <span className="text-[7px] font-semibold text-primary">{row.university_name}</span>
                    <h3 className="mt-1 min-h-[34px] text-[10px] font-semibold">{row.scholarship_name}</h3>
                    <div className="mt-3 grid gap-1 text-[8px] text-muted">
                      <p className="flex justify-between gap-3"><span>Assumed annual cost</span><b className="text-ink">₩{Math.round(base).toLocaleString()}</b></p>
                      <p className="flex justify-between gap-3"><span>Modeled support</span><b className="text-ink">₩{Math.round(support).toLocaleString()}</b></p>
                      <p className="flex justify-between gap-3 border-t border-hairline pt-2 text-ink"><span>Estimated gap</span><b>₩{Math.round(gap).toLocaleString()}</b></p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {compareRows.length ? (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-hairline bg-surface">
              <table className="min-w-[800px] w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline bg-canvas/60">
                    <th className="w-[150px] px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted/50">Field</th>
                    {compareRows.map((row) => (
                      <th key={row.id} className="min-w-[220px] border-l border-hairline px-4 py-3 align-top">
                        <p className="text-[9px] font-semibold text-primary">{row.university_name}</p>
                        <p className="mt-1 text-[14px] font-medium leading-5 tracking-[-0.025em]">{row.scholarship_name}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Deadline", (row: ScholarshipStudioRow) => row.deadline_label],
                    ["Funding", (row: ScholarshipStudioRow) => row.tuition_coverage ?? row.benefit_type ?? NOT_STATED],
                    ["GPA", (row: ScholarshipStudioRow) => row.gpa_requirement ?? NOT_STATED],
                    ["TOPIK", (row: ScholarshipStudioRow) => row.topik_requirement ?? NOT_STATED],
                    ["Application", (row: ScholarshipStudioRow) => row.automatic_consideration ? "Automatic consideration" : row.application_required === false ? "No separate application stated" : row.application_required === true ? "Application required" : NOT_STATED],
                  ].map(([label, getter]) => (
                    <tr key={String(label)} className="border-b border-hairline last:border-0">
                      <th className="bg-canvas/35 px-4 py-4 text-[10px] font-medium text-muted">{String(label)}</th>
                      {compareRows.map((row) => (
                        <td key={row.id} className="border-l border-hairline px-4 py-4 text-[11px] leading-5">
                          {(getter as (row: ScholarshipStudioRow) => string)(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-hairline-strong bg-surface px-6 py-12 text-center">
              <GitCompareArrows className="mx-auto h-6 w-6 text-muted/35" />
              <p className="mt-4 text-[18px] font-medium">Your comparison is empty.</p>
              <button type="button" onClick={() => setView("discover")} className="mt-3 text-[9px] font-semibold text-primary">Choose scholarships →</button>
            </div>
          )}

          <section className="mt-3 rounded-2xl border border-hairline bg-surface p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Source history</p>
                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.035em]">Freshness, health & local change audit</h2>
              </div>
              <button type="button" onClick={captureSnapshots} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">Capture source state</button>
            </div>
            <div className="mt-4 grid gap-2">
              {(compareRows.length ? compareRows : trackedRows.length ? trackedRows : rows.slice(0, 5)).map((row) => {
                const freshness = sourceFreshness(row);
                const snapshots = workspace.snapshots[row.id] ?? [];
                const changed = snapshots[0]?.contentHash && snapshots[1]?.contentHash && snapshots[0].contentHash !== snapshots[1].contentHash;
                return (
                  <article key={row.id} className="grid gap-3 rounded-xl border border-hairline bg-canvas p-3 md:grid-cols-[1.2fr_130px_130px_1fr_auto] md:items-center">
                    <div>
                      <span className="text-[7px] font-semibold text-primary">{row.university_name}</span>
                      <h3 className="mt-1 text-[10px] font-semibold">{row.scholarship_name}</h3>
                    </div>
                    <div>
                      <small className="block text-[7px] text-muted">Last verified</small>
                      <b className="mt-1 block text-[8px]">{sourceDate(row.last_verified_at)}</b>
                    </div>
                    <div>
                      <small className="block text-[7px] text-muted">Source health</small>
                      <b className={cn("mt-1 block text-[8px]", freshness.state === "fresh" ? "text-success" : freshness.state === "stale" ? "text-danger" : "text-gold")}>
                        {freshness.label}{freshness.days !== null ? ` · ${freshness.days}d` : ""}
                      </b>
                    </div>
                    <div className="text-[8px] text-muted">
                      {changed ? "Verified content hash differs from the previous local snapshot." : snapshots.length ? `${snapshots.length} local snapshot${snapshots.length === 1 ? "" : "s"}` : "No local snapshot yet"}
                    </div>
                    <a href={row.source_url} target="_blank" rel="noreferrer noopener" className="text-[8px] font-semibold text-primary">Source ↗</a>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {selectedAward && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/35 p-3 backdrop-blur-[8px] sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={selectedAward.scholarship_name}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedAwardId(null);
          }}
        >
          <article className="flex h-[min(820px,78vh)] w-[min(1220px,78vw)] flex-col overflow-hidden rounded-[26px] border border-hairline bg-white shadow-pop max-[760px]:h-[88vh] max-[760px]:w-[94vw]">
            <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-hairline bg-white/95 px-5 backdrop-blur-xl">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">{selectedAward.university_name}</span>
                <p className="mt-1 text-[9px] text-muted">{selectedAward.scholarship_type ?? "University scholarship"} · {degreeLabel(selectedAward.degree_level)}</p>
              </div>
              <button type="button" onClick={() => setSelectedAwardId(null)} aria-label="Close scholarship details" className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-canvas text-[20px] text-muted hover:bg-white">×</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(ellipse_48%_36%_at_88%_4%,rgba(62,99,221,.055),transparent_72%)] p-5 sm:p-7">
              <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-primary">Scholarship record</span>
                  <h2 className="mt-2 max-w-[800px] text-[clamp(34px,4vw,62px)] font-semibold leading-[.96] tracking-[-0.05em]">{selectedAward.scholarship_name}</h2>
                  <p className="mt-4 text-[11px] text-muted">Deadline · {selectedAward.deadline_label}</p>
                </div>
                <div className="flex min-h-[190px] flex-col justify-end rounded-[20px] border border-primary/10 bg-canvas p-5">
                  <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted">Published funding</span>
                  <strong className="mt-2 text-[clamp(22px,2.4vw,34px)] leading-[1.05] tracking-[-0.04em]">{selectedAward.tuition_coverage ?? selectedAward.benefit_type ?? NOT_STATED}</strong>
                </div>
              </section>

              <section className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["TOPIK / language", selectedAward.topik_requirement ?? NOT_STATED],
                  ["Academic", selectedAward.gpa_requirement ?? NOT_STATED],
                  ["Application mechanics", selectedAward.automatic_consideration ? "Automatic consideration" : selectedAward.application_required === true ? "Application required" : selectedAward.application_required === false ? "No separate scholarship application stated" : NOT_STATED],
                  ["Source health", (() => { const health = sourceFreshness(selectedAward); return `${health.label}${health.days !== null ? ` · ${health.days}d` : ""}`; })()],
                ].map(([label, value]) => (
                  <article key={label} className="min-h-[116px] rounded-xl border border-hairline bg-white p-4">
                    <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted">{label}</span>
                    <strong className="mt-2 block text-[10px] leading-5">{value}</strong>
                  </article>
                ))}
              </section>

              <section className="mt-2 grid gap-2 lg:grid-cols-2">
                <article className="rounded-xl border border-hairline bg-white p-4">
                  <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted">Source verification</span>
                  <p className="mt-2 text-[10px] leading-5 text-muted">
                    Last verified {sourceDate(selectedAward.last_verified_at)}. Scholarship Studio only exposes structured values stored from the linked official source.
                  </p>
                </article>
                <article className="rounded-xl border border-gold/15 bg-gold-soft p-4">
                  <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-gold">Caution</span>
                  <p className="mt-2 text-[10px] leading-5 text-muted">
                    Confirm the current intake&apos;s full eligibility, documents, and program conditions before relying on this record.
                  </p>
                </article>
              </section>
            </div>

            <footer className="flex min-h-[72px] flex-col justify-between gap-2 border-t border-hairline bg-white/95 p-3 backdrop-blur-xl sm:flex-row sm:items-center sm:px-5">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => toggleTracked(selectedAward.id)} className={cn("h-9 rounded-lg border px-3 text-[8px] font-semibold", workspace.tracked.includes(selectedAward.id) ? "border-success/25 bg-success-soft text-success" : "border-border bg-white")}>
                  {workspace.tracked.includes(selectedAward.id) ? "✓ Tracked" : "＋ Track"}
                </button>
                <button type="button" onClick={() => toggleCompare(selectedAward.id)} className={cn("h-9 rounded-lg border px-3 text-[8px] font-semibold", workspace.compare.includes(selectedAward.id) ? "border-primary/25 bg-primary-soft text-primary" : "border-border bg-white")}>
                  {workspace.compare.includes(selectedAward.id) ? "✓ In comparison" : "⇄ Compare"}
                </button>
                <button type="button" onClick={() => { setSelectedAwardId(null); setView("eligibility"); }} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">Check eligibility</button>
                <button type="button" onClick={() => { setAssistantAwardId(selectedAward.id); setAssistantQuestion(""); setAssistantAnswer(""); setSelectedAwardId(null); }} className="h-9 rounded-lg border border-border bg-white px-3 text-[8px] font-semibold">Ask scholarship</button>
              </div>
              <a href={selectedAward.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-ink px-3 text-[8px] font-semibold text-white">
                Official source <ExternalLink className="h-3 w-3" />
              </a>
            </footer>
          </article>
        </div>
      )}

      {assistantAwardId && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-2xl border border-hairline bg-white p-5 shadow-pop">
            <div className="flex justify-between gap-3">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">Source-grounded assistant</span>
                <h2 className="mt-1 text-[20px] font-semibold">Ask this scholarship</h2>
              </div>
              <button type="button" onClick={() => setAssistantAwardId(null)} className="h-9 w-9 rounded-lg bg-canvas text-muted">×</button>
            </div>
            <select value={assistantAwardId} onChange={(event) => { setAssistantAwardId(event.target.value); setAssistantAnswer(""); }} className="mt-4 h-11 w-full rounded-lg border border-border bg-white px-3 text-[10px]">
              {rows.map((row) => <option key={row.id} value={row.id}>{row.university_name} · {row.scholarship_name}</option>)}
            </select>
            <textarea value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="What does the verified record say about funding, TOPIK, GPA, deadline…?" className="mt-3 min-h-[110px] w-full resize-y rounded-lg border border-border p-3 text-[11px] outline-none focus:border-primary" />
            <div className="mt-3 min-h-[90px] rounded-xl border border-hairline bg-canvas p-3">
              {assistantAnswer ? <p className="text-[10px] leading-5">{assistantAnswer}</p> : <p className="text-[9px] text-muted">Answers use only KMate&apos;s structured scholarship record. Open the official source for the full rule.</p>}
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={answerScholarship} className="h-10 rounded-lg bg-primary px-4 text-[9px] font-semibold text-white">Answer from verified record</button>
            </div>
          </div>
        </div>
      )}

      {notificationsOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-2xl border border-hairline bg-white p-5 shadow-pop">
            <div className="flex justify-between gap-3">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">Scholarship alerts</span>
                <h2 className="mt-1 text-[20px] font-semibold">Notification center</h2>
              </div>
              <button type="button" onClick={() => setNotificationsOpen(false)} className="h-9 w-9 rounded-lg bg-canvas text-muted">×</button>
            </div>
            <div className="mt-4 max-h-[55vh] overflow-y-auto">
              {workspace.notifications.length ? workspace.notifications.map((item) => (
                <article key={item.id} className={cn("mb-2 rounded-xl border border-hairline bg-canvas p-3", item.read && "opacity-55")}>
                  <span className="text-[7px] font-semibold uppercase text-primary">{item.kind}</span>
                  <h3 className="mt-1 text-[10px] font-semibold">{item.title}</h3>
                  <p className="mt-1 text-[8px] leading-4 text-muted">{item.body}</p>
                </article>
              )) : <p className="rounded-xl border border-dashed border-hairline-strong bg-canvas p-5 text-[9px] text-muted">No alerts yet.</p>}
            </div>
            <button type="button" onClick={() => setWorkspace((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, read: true })) }))} className="mt-3 h-9 rounded-lg border border-border px-3 text-[8px] font-semibold">Mark all read</button>
          </div>
        </div>
      )}

      {reminderOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/30 p-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const label = String(data.get("label") ?? "").trim();
              const date = String(data.get("date") ?? "");
              if (!label || !date) return;
              setWorkspace((current) => ({
                ...current,
                reminders: [
                  ...current.reminders,
                  { id: `reminder-${Date.now()}`, label, date, awardId: reminderAwardId },
                ],
              }));
              setReminderOpen(false);
            }}
            className="w-full max-w-[430px] rounded-2xl border border-hairline bg-white p-5 shadow-pop"
          >
            <div className="flex justify-between gap-3">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">Reminder</span>
                <h2 className="mt-1 text-[20px] font-semibold">Add a scholarship reminder</h2>
              </div>
              <button type="button" onClick={() => setReminderOpen(false)} className="h-9 w-9 rounded-lg bg-canvas text-muted">×</button>
            </div>
            <label className="mt-4 grid gap-1.5">
              <span className="text-[8px] font-semibold text-muted">Label</span>
              <input name="label" required className="h-11 rounded-lg border border-border px-3 text-[12px]" />
            </label>
            <label className="mt-3 grid gap-1.5">
              <span className="text-[8px] font-semibold text-muted">Date</span>
              <input name="date" type="date" required className="h-11 rounded-lg border border-border px-3 text-[12px]" />
            </label>
            <label className="mt-3 grid gap-1.5">
              <span className="text-[8px] font-semibold text-muted">Application</span>
              <select value={reminderAwardId} onChange={(event) => setReminderAwardId(event.target.value)} className="h-11 rounded-lg border border-border px-3 text-[10px]">
                <option value="">General</option>
                {trackedRows.map((row) => <option key={row.id} value={row.id}>{row.university_name} · {row.scholarship_name}</option>)}
              </select>
            </label>
            <button type="submit" className="mt-4 h-10 rounded-lg bg-primary px-4 text-[9px] font-semibold text-white">Save reminder</button>
          </form>
        </div>
      )}

      {emailOpen && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-2xl border border-hairline bg-white p-5 shadow-pop">
            <div className="flex justify-between gap-3">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">Application update parser</span>
                <h2 className="mt-1 text-[20px] font-semibold">Turn an email into a suggested update</h2>
              </div>
              <button type="button" onClick={() => setEmailOpen(false)} className="h-9 w-9 rounded-lg bg-canvas text-muted">×</button>
            </div>
            <select value={emailAwardId} onChange={(event) => { setEmailAwardId(event.target.value); setPendingEmailUpdate(null); }} className="mt-4 h-11 w-full rounded-lg border border-border px-3 text-[10px]">
              {trackedRows.map((row) => <option key={row.id} value={row.id}>{row.university_name} · {row.scholarship_name}</option>)}
            </select>
            <textarea value={emailText} onChange={(event) => setEmailText(event.target.value)} placeholder="Paste the relevant university email. This preview parser never reads your inbox automatically." className="mt-3 min-h-[130px] w-full resize-y rounded-lg border border-border p-3 text-[11px]" />
            <div className="mt-3 rounded-xl border border-hairline bg-canvas p-3">
              {pendingEmailUpdate ? (
                <>
                  <span className="text-[7px] font-semibold uppercase text-primary">Suggested update</span>
                  <p className="mt-1 text-[9px] leading-4">{Object.entries(pendingEmailUpdate).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</p>
                  <small className="mt-2 block text-[7px] text-muted">Nothing changes until you approve.</small>
                </>
              ) : (
                <p className="text-[8px] text-muted">Paste an email and parse it. Unsupported wording produces no change.</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setPendingEmailUpdate(parseEmailUpdate(emailText))} className="h-9 rounded-lg border border-border px-3 text-[8px] font-semibold">Parse update</button>
              <button
                type="button"
                disabled={!pendingEmailUpdate || !emailAwardId}
                onClick={() => {
                  if (!pendingEmailUpdate || !emailAwardId) return;
                  const existing = workspace.applications[emailAwardId] ?? initialApplication();
                  updateApplication(emailAwardId, {
                    ...pendingEmailUpdate,
                    notes: `${existing.notes ? `${existing.notes}\n\n` : ""}Email update (${new Date().toLocaleDateString()}): ${emailText.slice(0, 280)}`,
                  });
                  setEmailOpen(false);
                  setPendingEmailUpdate(null);
                  toast("Suggested email update applied.");
                }}
                className="h-9 rounded-lg bg-primary px-3 text-[8px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply suggested update
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewDraft && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/30 p-4 backdrop-blur-sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!reviewDraft.focus.trim()) return;
              setWorkspace((current) => ({
                ...current,
                reviews: [
                  {
                    id: `review-${Date.now()}`,
                    awardId: reviewDraft.awardId,
                    artifact: reviewDraft.artifact,
                    focus: reviewDraft.focus.trim(),
                    createdAt: new Date().toISOString(),
                  },
                  ...current.reviews,
                ],
              }));
              setReviewDraft(null);
            }}
            className="w-full max-w-[460px] rounded-2xl border border-hairline bg-white p-5 shadow-pop"
          >
            <div className="flex justify-between gap-3">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-primary">Peer review request</span>
                <h2 className="mt-1 text-[20px] font-semibold">Create a review checklist</h2>
              </div>
              <button type="button" onClick={() => setReviewDraft(null)} className="h-9 w-9 rounded-lg bg-canvas text-muted">×</button>
            </div>
            <select value={reviewDraft.artifact} onChange={(event) => setReviewDraft({ ...reviewDraft, artifact: event.target.value })} className="mt-4 h-11 w-full rounded-lg border border-border px-3 text-[10px]">
              <option>Personal statement</option>
              <option>Study plan</option>
              <option>Scholarship essay</option>
              <option>Application packet</option>
            </select>
            <textarea value={reviewDraft.focus} onChange={(event) => setReviewDraft({ ...reviewDraft, focus: event.target.value })} placeholder="What should the reviewer focus on?" className="mt-3 min-h-[110px] w-full resize-y rounded-lg border border-border p-3 text-[11px]" />
            <button type="submit" className="mt-3 h-10 rounded-lg bg-primary px-4 text-[9px] font-semibold text-white">Create review request</button>
          </form>
        </div>
      )}

      {compareRows.length > 0 && view !== "compare" && (
        <div className="fixed bottom-4 left-1/2 z-50 flex w-[min(620px,calc(100vw-28px))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink/95 p-2.5 pl-4 text-white shadow-pop backdrop-blur-xl md:left-[calc(210px+(100vw-210px)/2)] md:w-[min(620px,calc(100vw-250px))]">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-white/42">{compareRows.length}/3 selected</p>
            <div className="mt-1 flex max-w-[340px] gap-1.5 overflow-hidden">
              {compareRows.map((row) => (
                <button key={row.id} type="button" onClick={() => toggleCompare(row.id)} className="flex h-7 max-w-[110px] items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[8px] text-white/70">
                  <span className="truncate">{row.university_name}</span>
                  <X className="h-2.5 w-2.5 shrink-0 text-primary" />
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setView("compare")} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-3.5 text-[10px] font-semibold text-white">
            Compare now
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[100] rounded-xl bg-ink px-4 py-3 text-[9px] font-semibold text-white shadow-pop">
          {toastMessage}
        </div>
      )}
    </main>
  );
}
