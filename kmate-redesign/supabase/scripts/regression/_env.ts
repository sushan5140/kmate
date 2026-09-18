import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

export function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", "..", "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

export function makeChecker() {
  let pass = 0;
  let fail = 0;
  function check(label: string, condition: boolean) {
    if (condition) {
      pass++;
      console.log(`PASS: ${label}`);
    } else {
      fail++;
      console.log(`FAIL: ${label}`);
    }
  }
  function summarize() {
    console.log(`\n${pass} passed, ${fail} failed`);
    return fail === 0;
  }
  return { check, summarize };
}

export async function createThrowawayUser(
  admin: SupabaseClient,
  label: string
) {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`createUser failed: ${error?.message}`);
  const userId = created.user.id;
  const { error: upsertErr } = await admin.from("profiles").upsert({
    id: userId,
    username: `e2e${label}${Date.now() % 100000}`,
    track: "gks_g",
    major: "Computer Science",
    application_year: 2027,
    onboarding_completed_at: new Date().toISOString(),
  });
  if (upsertErr) throw new Error(`profile upsert failed: ${upsertErr.message}`);
  return { userId, email };
}

export async function cleanupUser(
  admin: SupabaseClient,
  userId: string
) {
  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
}
