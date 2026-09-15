import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const META_KEY = "kmate_gks_saved_rules";
const MAX_RULES = 100;

interface SavedRulePayload {
  id: string;
  title: string;
  text: string;
  page?: string | null;
  sourceUrl?: string | null;
  savedAt: string;
  kind: "guideline_rule" | "ai_answer";
  question?: string | null;
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function cleanRule(value: unknown): SavedRulePayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = cleanString(raw.id, 200);
  const title = cleanString(raw.title, 300);
  const text = cleanString(raw.text, 6000);
  const savedAt = cleanString(raw.savedAt, 60);
  const kind = raw.kind === "guideline_rule" || raw.kind === "ai_answer" ? raw.kind : null;
  if (!id || !title || !text || !savedAt || !kind) return null;
  if (Number.isNaN(Date.parse(savedAt))) return null;

  const page = raw.page == null ? null : cleanString(raw.page, 120);
  const sourceUrl = raw.sourceUrl == null ? null : cleanString(raw.sourceUrl, 1200);
  const question = raw.question == null ? null : cleanString(raw.question, 2000);

  return { id, title, text, savedAt, kind, page, sourceUrl, question };
}

async function authMetadataFor(userId: string): Promise<Record<string, unknown> | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    console.error("[gks:saved-rules] could not read auth metadata", error?.message ?? "user_missing");
    return null;
  }
  return (data.user.user_metadata ?? {}) as Record<string, unknown>;
}

function rulesFromMetadata(metadata: Record<string, unknown> | null | undefined): SavedRulePayload[] {
  const raw = metadata?.[META_KEY];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const cleaned: SavedRulePayload[] = [];
  for (const item of raw) {
    const rule = cleanRule(item);
    if (!rule || seen.has(rule.id)) continue;
    seen.add(rule.id);
    cleaned.push(rule);
    if (cleaned.length >= MAX_RULES) break;
  }
  return cleaned;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const metadata = await authMetadataFor(user.id);
  if (metadata === null) {
    return NextResponse.json({ error: "sync_unavailable" }, { status: 503 });
  }

  return NextResponse.json({ items: rulesFromMetadata(metadata) });
}

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.items)) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }

  const deduped = new Map<string, SavedRulePayload>();
  for (const item of body.items.slice(0, MAX_RULES * 2)) {
    const rule = cleanRule(item);
    if (!rule) continue;
    const previous = deduped.get(rule.id);
    if (!previous || Date.parse(rule.savedAt) > Date.parse(previous.savedAt)) {
      deduped.set(rule.id, rule);
    }
  }
  const items = [...deduped.values()]
    .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
    .slice(0, MAX_RULES);

  const currentMetadata = await authMetadataFor(user.id);
  if (currentMetadata === null) {
    return NextResponse.json({ error: "sync_unavailable" }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...currentMetadata, [META_KEY]: items },
  });
  if (error) {
    console.error("[gks:saved-rules] metadata sync failed", error.message);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }

  return NextResponse.json({ items });
}
