import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/78 backdrop-blur-xl">
      <div className="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group inline-flex items-center gap-2.5 text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-ink text-[12px] font-extrabold tracking-[-0.04em] text-white shadow-xs transition-transform duration-150 ease-out group-active:scale-[0.96]">
            K
          </span>
          <span className="text-[15px] font-extrabold tracking-[-0.025em]">KMate</span>
        </Link>

        <nav className="flex items-center gap-2 text-[13px] font-semibold sm:gap-3">
          <Link
            href="/#workspace"
            className="hidden rounded-xl px-3 py-2 text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink sm:inline-flex"
          >
            Workspace
          </Link>
          <Link
            href="/about"
            className="hidden rounded-xl px-3 py-2 text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink sm:inline-flex"
          >
            About
          </Link>
          <Link
            href="/login"
            className="pressable inline-flex h-10 items-center gap-2 rounded-[13px] bg-ink px-4 text-white shadow-xs hover:shadow-card"
          >
            Sign in
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
