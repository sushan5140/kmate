import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-[15px] font-semibold tracking-tight text-ink">
          KMate
        </Link>

        <nav className="flex items-center gap-4 text-[14px]">
          <Link
            href="/#explore-tools"
            className="hidden text-muted transition-colors hover:text-ink sm:inline"
          >
            Explore tools
          </Link>
          <Link href="/about" className="hidden text-muted transition-colors hover:text-ink sm:inline">
            About
          </Link>
          <Link href="/privacy" className="text-muted transition-colors hover:text-ink">
            Privacy
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 font-medium text-white shadow-xs transition-all duration-150 hover:shadow-card active:scale-[0.97]"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
