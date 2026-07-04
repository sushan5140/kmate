import Link from "next/link";

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-[13px] text-muted hover:text-ink">
        ← Back
      </Link>
      <div className="mt-4">{children}</div>
    </main>
  );
}
