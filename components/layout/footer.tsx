import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 py-8 text-center text-[13px] text-muted sm:flex-row sm:justify-between sm:text-left">
        <p>
          GKS Connect is an independent, applicant-run community. Not affiliated with
          NIIED or the Korean government.
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/about" className="hover:text-ink">
            About
          </Link>
          <Link href="/guidelines" className="hover:text-ink">
            Guidelines
          </Link>
        </nav>
      </div>
    </footer>
  );
}
