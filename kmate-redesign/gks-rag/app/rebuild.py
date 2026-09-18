"""
One deterministic command to rebuild every generated artifact from the
committed sources, in the order they depend on each other.

    python -m app.rebuild

Equivalent to running, in sequence:
    python -m app.check_sources            verify the PDFs are the reviewed ones
    python -m app.ingest_official_pdfs     PDFs      -> official_knowledge.jsonl
    python -m app.tag_community_programs   raw chats -> community_knowledge.jsonl
    python -m app.build_index              both      -> index/

Nothing here reaches the network, so the result depends only on what is in the
repository. Run it after changing a source PDF, the manifest, or any
ingestion/tagging rule.
"""

import sys

from app import build_index, check_sources, ingest_official_pdfs, tag_community_programs


def main() -> int:
    steps = [
        ("Verifying official sources", check_sources.main),
        ("Ingesting official PDFs", ingest_official_pdfs.main),
        ("Tagging community programs", tag_community_programs.main),
        ("Building index", build_index.main),
    ]
    for i, (label, fn) in enumerate(steps, start=1):
        print(f"\n=== [{i}/{len(steps)}] {label} ===")
        result = fn()
        if isinstance(result, int) and result != 0:
            print(f"\nAborted: '{label}' reported a problem.", file=sys.stderr)
            return result
    print("\nRebuild complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
