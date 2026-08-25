"""
Reports whether the committed official PDFs still match their manifest, and
optionally whether the publisher has changed the document upstream.

Read-only by design: it never overwrites a committed PDF and never edits the
manifest. Refreshing a source is a human decision (review the new document,
then update sha256/retrieved_at/cycle in data/official/sources.json).

  python -m app.check_sources            # local integrity only (offline)
  python -m app.check_sources --remote   # also re-fetch origin_url and compare
"""

import sys
import urllib.request

from app.sources import load_sources, sha256_of


def main() -> int:
    check_remote = "--remote" in sys.argv
    drift = 0

    for s in load_sources():
        status = "ACTIVE (indexed)" if s.active else "ARCHIVED (audit only, never indexed)"
        print(f"[{s.id}] program={s.program} cycle={s.cycle} retrieved_at={s.retrieved_at} -> {status}")
        if not s.active:
            if s.superseded_by:
                print(f"  superseded by: {s.superseded_by}")
            if s.excluded_reason:
                print(f"  reason: {s.excluded_reason[:150]}...")

        if not s.path.exists():
            print(f"  LOCAL: MISSING -> {s.path}")
            drift += 1
            continue

        local = sha256_of(s.path)
        if local == s.sha256:
            print(f"  LOCAL: ok ({s.path.name}, {s.path.stat().st_size} bytes)")
        else:
            print(f"  LOCAL: CHANGED\n    manifest={s.sha256}\n    on disk ={local}")
            drift += 1

        if not check_remote:
            continue
        if not s.origin_url:
            print("  REMOTE: skipped (no origin_url recorded)")
            continue
        try:
            with urllib.request.urlopen(s.origin_url, timeout=60) as resp:
                body = resp.read()
        except Exception as e:  # network/permission/404 -- informational only
            print(f"  REMOTE: unreachable ({e.__class__.__name__}: {e})")
            continue

        import hashlib

        remote = hashlib.sha256(body).hexdigest()
        if remote == s.sha256:
            print("  REMOTE: unchanged")
        else:
            print(
                f"  REMOTE: DIFFERS from the reviewed copy\n"
                f"    reviewed={s.sha256}\n"
                f"    upstream={remote} ({len(body)} bytes)\n"
                f"    -> The publisher changed this document. Nothing was written.\n"
                f"       Review it, then update the manifest deliberately."
            )
            drift += 1

    print("\nDrift detected." if drift else "\nAll sources match the manifest.")
    return 1 if drift else 0


if __name__ == "__main__":
    raise SystemExit(main())
