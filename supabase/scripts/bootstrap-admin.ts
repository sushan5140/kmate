/**
 * One-time admin-bootstrap ceremony. Promotes a user to is_admin=true when
 * no admin session exists yet to do it through the normal app flow (the
 * guard_profiles_is_admin() trigger otherwise reverts every is_admin write
 * that doesn't come from an existing admin's own session -- including the
 * service-role key). See SECURITY.md "Admin bootstrap" for the full
 * writeup and the one-time secret setup this depends on.
 *
 * Deliberately NOT wired into any route or exposed to the deployed app --
 * run by hand, locally, only when actually needed.
 *
 * Usage:
 *   ADMIN_BOOTSTRAP_SECRET=<your-secret> npx tsx supabase/scripts/bootstrap-admin.ts <email> <secret>
 *   ADMIN_BOOTSTRAP_SECRET=<your-secret> npx tsx supabase/scripts/bootstrap-admin.ts <email> --secret <your-secret>
 *
 * The ADMIN_BOOTSTRAP_SECRET env var and the secret argument must both be
 * set AND match each other -- this is a deliberate local sanity check (you
 * must have actually configured the secret in your shell, not just typed it
 * inline) on top of the real gate, which is the database-side hash
 * comparison inside admin_bootstrap_promote() (see supabase/schema.sql).
 * This script never sees or needs the raw hash -- only the plaintext
 * secret you chose when you set it up.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

function parseArgs(argv: string[]) {
  const [email, ...rest] = argv;
  let secret: string | undefined;
  const flagIndex = rest.indexOf("--secret");
  if (flagIndex !== -1) {
    secret = rest[flagIndex + 1];
  } else {
    secret = rest[0];
  }
  return { email, secret };
}

async function main() {
  const { email, secret } = parseArgs(process.argv.slice(2));

  if (!email) {
    console.error("Usage: npx tsx supabase/scripts/bootstrap-admin.ts <email> <secret>");
    console.error("       npx tsx supabase/scripts/bootstrap-admin.ts <email> --secret <secret>");
    process.exit(1);
  }

  const envSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!envSecret) {
    console.error("ADMIN_BOOTSTRAP_SECRET is not set in the environment. This script refuses to run without it,");
    console.error("even if a secret was passed as an argument -- it's a deliberate manual ceremony, not something");
    console.error("that should ever run unattended or from a value typed inline without also being configured.");
    process.exit(1);
  }

  if (!secret) {
    console.error("No secret argument (or --secret flag) provided.");
    process.exit(1);
  }

  if (secret !== envSecret) {
    console.error("The secret argument does not match ADMIN_BOOTSTRAP_SECRET. Refusing to proceed.");
    process.exit(1);
  }

  const env = loadEnvLocal();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await admin.rpc("admin_bootstrap_promote", {
    target_email: email,
    secret,
  });

  if (error) {
    console.error("RPC call failed:", error.message);
    process.exit(1);
  }

  if (data === true) {
    console.log(`Promoted ${email} to admin. Logged in admin_actions_log.`);
    // No explicit process.exit(0) here -- letting Node exit naturally (there's
    // nothing else pending) avoids a benign but alarming-looking libuv
    // teardown assertion on Windows when process.exit() races an in-flight
    // network handle from the just-completed request.
  } else {
    console.error(
      `Promotion did NOT happen (wrong secret, no matching user, or no secret configured on the database).`
    );
    console.error("Check admin_actions_log for the recorded failure reason.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("SCRIPT_ERROR", e);
  process.exit(1);
});
