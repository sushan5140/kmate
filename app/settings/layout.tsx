import Link from "next/link";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-ink">Settings</h1>
      <nav className="mt-4 flex gap-4 border-b border-border text-[14px]">
        <Link href="/settings/profile" className="pb-3 text-ink hover:text-primary">
          Profile
        </Link>
        <Link href="/settings/contacts" className="pb-3 text-ink hover:text-primary">
          Contact vault
        </Link>
      </nav>
      <div className="mt-6">{children}</div>
    </main>
  );
}
