import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { EditContactsForm } from "@/components/settings/edit-contacts-form";
import type { ContactValue } from "@/components/onboarding/contacts-step";

export const metadata: Metadata = {
  title: "Contact vault — GKS Connect",
};

export default async function SettingsContactsPage() {
  const user = await requireOnboarded("/settings/contacts");

  const { data } = await getSupabaseAdmin()
    .from("contact_methods")
    .select("type, value")
    .eq("user_id", user.id);

  return (
    <div>
      <p className="text-[13.5px] text-muted">
        Private -- only visible to people once you accept a connection request from
        them.
      </p>
      <div className="mt-4">
        <EditContactsForm initial={(data ?? []) as ContactValue[]} />
      </div>
    </div>
  );
}
