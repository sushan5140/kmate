import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { CONTACT_TYPES } from "@/lib/constants";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await getSupabaseAdmin()
    .from("contact_methods")
    .select("type, value")
    .eq("user_id", user.id);

  return NextResponse.json({ contacts: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`contacts:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { contacts } = (await request.json()) as { contacts: { type: string; value: string }[] };
  if (!Array.isArray(contacts)) {
    return NextResponse.json({ error: "invalid_contacts" }, { status: 400 });
  }
  for (const c of contacts) {
    if (!CONTACT_TYPES.includes(c.type as (typeof CONTACT_TYPES)[number])) {
      return NextResponse.json({ error: "invalid_contact_type" }, { status: 400 });
    }
  }

  const admin = getSupabaseAdmin();
  await admin.from("contact_methods").delete().eq("user_id", user.id);

  const rows = contacts.filter((c) => c.value?.trim()).map((c) => ({ user_id: user.id, type: c.type, value: c.value }));
  if (rows.length) {
    const { error } = await admin.from("contact_methods").insert(rows);
    if (error) return NextResponse.json({ error: "server_error" }, { status: 500 });

    // The contact wallet is no longer empty -- clear the sign-in nag (see
    // app/auth/callback/route.ts) so the notification bell doesn't keep
    // flagging an already-resolved "add a contact" reminder.
    await admin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("type", "contact_wallet_empty")
      .is("read_at", null);
  }

  return NextResponse.json({ ok: true });
}
