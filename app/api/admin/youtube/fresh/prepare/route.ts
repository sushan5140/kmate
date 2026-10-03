import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuthorizedAdmin } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { FRESH_BATCH_SIZE, FRESH_TOPIC_PREFIX, productFromTopic } from "@/lib/youtube/fresh-outreach";
import { promotionCategoryOf } from "@/lib/youtube/classify";\nimport { recordEvent } from "@/lib/youtube/queue";

const SCHEMA = {
  type: "object",
  properties: {
    drafts: {
      type: "array",
      minItems: 1,
      maxItems: FRESH_BATCH_SIZE,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          action: { type: "string", enum: ["DRAFT", "SKIP"] },
          reply: { type: "string" },
        },
        required: ["id", "action", "reply"],
        additionalProperties: false,
      },
    },
  },
  required: ["drafts"],
  additionalProperties: false,
} as const;

const SYSTEM = `You write HUMAN YouTube replies for a Korean scholarship / Korean-learning outreach review queue.

Rules:
- Answer the commenter's actual question or struggle FIRST. Never open with a pitch.
- Match the commenter's natural language and register. Hinglish -> natural Hinglish. Roman Urdu -> Roman Urdu. Spanish/Portuguese/etc -> that language. English -> natural conversational English.
- Sound like a real helpful person in YouTube comments, not customer support and not an AI assistant.
- Keep it concise: usually 2-4 short sentences.
- Slightly casual phrasing is good. Do not make every reply grammatically polished.
- Max one emoji, and only if it genuinely fits. Do not repeat the same emoji pattern.
- Never use manipulative urgency, marketing hype, "check us out", "DM me", or generic sales copy.
- Mention the assigned product at most once and only when it naturally follows from the answer.
- Do NOT include a product URL. Links are added manually later only when appropriate.
- KMATE = GKS application/university/document/deadline/interview helper.
- HALLIUM = practical Korean companion for Hangul, grammar, speaking, pronunciation and contextual practice.
- VIDEOLAB = Korean listening/real-life video/dialogue practice.
- For GKS rules that may change by year/university, do NOT invent a rule. Say to verify the current 2027 official guideline or university notice where needed.
- If the comment is praise, spam, creator self-promotion, unrelated, or a product mention would be forced, return SKIP with an empty reply.
- Do not claim personal experiences you do not have.
- Avoid repeating the same sentence structure across rows.`;

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAuthorizedAdmin(user))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ai_not_configured", detail: "ANTHROPIC_API_KEY is not configured." }, { status: 501 });
  }

  const rate = checkRateLimit(`youtube-fresh-prepare:${user.id}`, 4, 10 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("youtube_reply_queue")
    .select("id, author_name, original_text, video_title, topic, score")
    .eq("status", "SCRAPED")
    .like("topic", `${FRESH_TOPIC_PREFIX}%`)
    .is("final_draft", null)
    .order("score", { ascending: false })
    .order("comment_posted_at", { ascending: false })
    .limit(FRESH_BATCH_SIZE);

  if (error) return NextResponse.json({ error: "queue_read_failed" }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "no_pending_fresh_rows" }, { status: 409 });

  const input = data.map((row) => ({
    id: String(row.id),
    product: productFromTopic(row.topic as string | null),
    author: row.author_name,
    comment: row.original_text,
    video: row.video_title,
  }));

  const anthropic = new Anthropic();
  let drafts: Array<{ id: string; action: "DRAFT" | "SKIP"; reply: string }>;
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2200,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(input) }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("no_text");
    drafts = JSON.parse(block.text).drafts;
  } catch {
    return NextResponse.json({ error: "draft_generation_failed" }, { status: 502 });
  }

  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  let drafted = 0;
  let skipped = 0;

  for (const row of data) {
    const id = String(row.id);
    const draft = byId.get(id);
    if (!draft) continue;

    if (draft.action === "SKIP" || !draft.reply.trim()) {
      await admin
        .from("youtube_reply_queue")
        .update({
          status: "SKIP",
          automation_action: "SKIP",
          reply_status: "AI review: skip",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "SCRAPED");
      await recordEvent({
        queueId: id,
        eventType: "SKIPPED",
        fromStatus: "SCRAPED",
        toStatus: "SKIP",
        actorUserId: user.id,
        metadata: { source: "fresh_outreach_ai", reason: "AI review: skip" },
      });
      skipped++;
      continue;
    }

    const text = draft.reply.trim().slice(0, 1200);
    const product = productFromTopic(row.topic as string | null);
    await admin
      .from("youtube_reply_queue")
      .update({
        status: "DRAFTED",
        automation_action: "POST",
        final_draft: text,
        general_reply: text,
        kmate_reply: product === "KMATE" ? text : null,
        use_kmate: product === "KMATE",
        best_choice: product ?? "General",
        promotion_category: promotionCategoryOf(text),
        reply_status: "AI drafted — human review required",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "SCRAPED");
    await recordEvent({
      queueId: id,
      eventType: "DRAFT_EDITED",
      fromStatus: "SCRAPED",
      toStatus: "DRAFTED",
      actorUserId: user.id,
      metadata: { source: "fresh_outreach_ai", product },
    });
    drafted++;
  }

  return NextResponse.json({
    ok: true,
    drafted,
    skipped,
    batch_size: data.length,
    note: "Nothing was approved or posted.",
  });
}
