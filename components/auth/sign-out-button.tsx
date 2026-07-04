"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser-client";
import { Button } from "@/components/ui/button";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleSignOut}>
      Sign out
    </Button>
  );
}
