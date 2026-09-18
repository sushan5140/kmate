"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const KEY_PREFIX = "kmate:scroll:";

// Next's own scroll-to-top for the incoming page (layout-router.js) runs
// from a ref callback during React's synchronous commit phase -- a plain
// `useEffect` cleanup is a *passive* effect, deferred until after paint, so
// this component's "scroll" listener would still be attached when that
// fires, capturing its native scroll event and clobbering the just-saved
// position with 0 before ever unmounting. `useLayoutEffect` fixes this
// deterministically: React runs every commit's cleanup ("destroy") before
// any new layout effect/ref callback ("create"), so this listener is always
// removed before Next's reset can fire. SSR-safe fallback to `useEffect`
// since this only touches window/sessionStorage, never layout/paint.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Restores scroll position on Discover when the user returns to the exact
 * same filtered URL they left from -- e.g. via the "Back to Discover" link
 * on a profile page. Deliberately not part of the `from`-param restoration
 * logic itself: filters are stable, shareable state that belongs in the
 * URL; scroll position is transient viewport state that doesn't, so it's
 * tracked separately in sessionStorage, keyed by the exact URL (pathname +
 * query string) it was captured on.
 *
 * Next.js's own scroll-to-top only applies to true back/forward (popstate)
 * navigation -- the back-link is a normal forward `<Link>` push, which Next
 * always scrolls to top for, same as any other link click. This restores on
 * top of that default rather than fighting it: it runs after mount/paint,
 * once a saved position exists for this exact URL.
 */
export function DiscoverScrollRestore() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = KEY_PREFIX + pathname + "?" + searchParams.toString();

  useIsomorphicLayoutEffect(() => {
    const saved = sessionStorage.getItem(key);
    if (saved) {
      const y = Number(saved);
      if (Number.isFinite(y)) {
        // rAF, not a bare call: this must land after the browser's own
        // (and Next's) initial scroll-to-top for the new page settles, or
        // the restore gets immediately overwritten back to 0.
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
    }

    let frame: number | null = null;
    function onScroll() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        sessionStorage.setItem(key, String(window.scrollY));
        frame = null;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [key]);

  return null;
}
