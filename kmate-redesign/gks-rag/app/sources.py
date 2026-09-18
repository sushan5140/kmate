"""
Loads and verifies the official-guideline source manifest
(data/official/sources.json).

The point of this module is that ingestion is reproducible and offline: it
resolves each source to a committed local PDF and refuses to proceed if the
bytes don't match the sha256 recorded when that PDF was reviewed. A source
is never re-downloaded as a side effect of building the index.
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from app.settings import ROOT, SOURCES_FILE

# Repo root -- sources.json stores paths relative to it (e.g.
# "public/official-guidelines/..."), since two of the three PDFs are served
# by KMate itself and shouldn't be duplicated into gks-rag/.
REPO_ROOT = ROOT.parent


@dataclass(frozen=True)
class OfficialSource:
    id: str
    scholarship: str
    program: str
    cycle: str
    title: str
    path: Path
    source_url: str
    origin_url: str | None
    retrieved_at: str
    sha256: str
    bytes: int
    notes: str
    # False = superseded edition kept for version history / audit only. Still
    # hash-verified so the archived copy can't drift, but never ingested.
    active: bool = True
    edition: str | None = None
    supersedes: str | None = None
    superseded_by: str | None = None
    excluded_reason: str | None = None


class SourceVerificationError(RuntimeError):
    pass


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_sources() -> list[OfficialSource]:
    raw = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    sources = []
    for entry in raw["sources"]:
        sources.append(
            OfficialSource(
                id=entry["id"],
                scholarship=entry["scholarship"],
                program=entry["program"],
                cycle=entry["cycle"],
                title=entry["title"],
                path=REPO_ROOT / entry["path"],
                source_url=entry["source_url"],
                origin_url=entry.get("origin_url"),
                retrieved_at=entry["retrieved_at"],
                sha256=entry["sha256"],
                bytes=entry["bytes"],
                notes=entry.get("notes", ""),
                active=entry.get("active", True),
                edition=entry.get("edition"),
                supersedes=entry.get("supersedes"),
                superseded_by=entry.get("superseded_by"),
                excluded_reason=entry.get("excluded_reason"),
            )
        )
    return sources


def verify(source: OfficialSource) -> None:
    """Raises unless the on-disk file is exactly the reviewed one."""
    if not source.path.exists():
        raise SourceVerificationError(
            f"[{source.id}] missing source PDF: {source.path}\n"
            f"Expected a committed local copy -- ingestion never downloads."
        )
    actual = sha256_of(source.path)
    if actual != source.sha256:
        raise SourceVerificationError(
            f"[{source.id}] sha256 mismatch for {source.path}\n"
            f"  manifest: {source.sha256}\n"
            f"  on disk:  {actual}\n"
            f"The PDF changed since it was reviewed. Refusing to ingest it silently.\n"
            f"Review the new file, then update sha256/retrieved_at/cycle in "
            f"data/official/sources.json deliberately."
        )


def load_verified_sources() -> list[OfficialSource]:
    """
    Every source is hash-verified (archived editions included, so an audit copy
    can't silently drift), but only the ACTIVE ones are returned for ingestion.

    Superseded editions are excluded here rather than at any later stage: it is
    the single choke point every build passes through, so an archived guideline
    cannot reach the index by any route.
    """
    sources = load_sources()
    for s in sources:
        verify(s)
    return [s for s in sources if s.active]
