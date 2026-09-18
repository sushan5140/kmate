import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-hairline bg-surface/55">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-8 text-[12px] leading-relaxed text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-2xl">
          KMate is an independent GKS application workspace. It is not affiliated with NIIED or the Korean government.
        </p>
        <nav className="flex items-center gap-4 font-semibold">
          <Link href="/about" className="transition-colors hover:text-ink">About</Link>
          <Link href="/guidelines" className="transition-colors hover:text-ink">Guidelines</Link>
        </nav>
      </div>
    </footer>
  );
}
