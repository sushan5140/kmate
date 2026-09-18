"""
Tags each community knowledge cluster with the GKS program it came from
(UG / G / mixed / unknown) and writes the generated, tagged dataset that the
index is built from.

  raw (committed, never modified) : data/community/rag_ready_community.jsonl
  generated (gitignored)          : data/community/community_knowledge.jsonl

The dataset is WhatsApp-derived and carries no program field of its own, so
the program is inferred -- conservatively. The WhatsApp group name is the only
strong signal (a group literally called "GKS-U 2027" is unambiguous), so it is
tried first. Message text is used only as a fallback and only when it is
decisive, because applicants routinely discuss the other track in passing and
a stray "master's" is not evidence that a whole cluster is graduate-only.

Anything short of that stays "unknown" rather than being guessed into UG or G:
a wrong program tag is worse than no tag, since retrieval down-ranks the
opposite program.

  python -m app.tag_community_programs
"""

import json
import re
from collections import Counter

from app.sanitize import clean_cluster, count_noise
from app.settings import COMMUNITY_FILE, COMMUNITY_RAW_FILE

# Checked in order -- "mixed" first, because a group covering both tracks
# ("UG and G", "ug_g", "UG and PG") also matches the narrower patterns.
GROUP_RULES = [
    ("mixed", re.compile(r"ug\s*[_&/+-]?\s*(?:and|n)?\s*[_&/+-]?\s*(?:g|pg)\b|\bug\s*and\s*g\b|ug[_/]g", re.I)),
    ("UG", re.compile(r"gks\s*-?\s*u\b|undergrad|\bbachelor", re.I)),
    ("G", re.compile(r"gks\s*-?\s*g\b|(?<!under)\bgraduate\b|\bmaster|\bphd\b|\bdoctoral\b|\bpostgrad", re.I)),
]

# Fallback text evidence. Deliberately narrow: explicit program names only.
TEXT_UG = re.compile(r"\bgks\s*-?\s*u\b|\bundergraduate\b|\bbachelor'?s?\b", re.I)
TEXT_G = re.compile(r"\bgks\s*-?\s*g\b|\bmaster'?s?\b|\bphd\b|\bdoctoral\b|\bpostgraduate\b", re.I)
# A single passing mention proves nothing; require a clear, one-sided signal.
TEXT_MIN_HITS = 2


def classify_group(name: str) -> str:
    for program, pattern in GROUP_RULES:
        if pattern.search(name):
            return program
    return "unknown"


def cluster_text(rec: dict) -> str:
    parts = [rec.get("canonical_question", "")]
    parts.extend(rec.get("question_variants", [])[:20])
    parts.extend(a.get("text", "") for a in rec.get("answers", [])[:8])
    return " ".join(p for p in parts if p)


def classify_from_text(rec: dict) -> str:
    text = cluster_text(rec)
    ug = len(TEXT_UG.findall(text))
    g = len(TEXT_G.findall(text))
    if ug >= TEXT_MIN_HITS and g == 0:
        return "UG"
    if g >= TEXT_MIN_HITS and ug == 0:
        return "G"
    return "unknown"


def program_for(rec: dict) -> tuple[str, str]:
    """Returns (program, basis) so the decision stays auditable."""
    groups = rec.get("source_groups") or []
    labels = {classify_group(g) for g in groups}
    labels.discard("unknown")

    if "mixed" in labels or len(labels) > 1:
        return "mixed", "group_name"
    if labels:
        return labels.pop(), "group_name"

    inferred = classify_from_text(rec)
    return inferred, "message_text" if inferred != "unknown" else "no_evidence"


def main():
    counts, bases = Counter(), Counter()
    out_lines = []
    stats = Counter()

    with COMMUNITY_RAW_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            stats["clusters_in"] += 1

            # Strip WhatsApp export noise before anything else looks at the text:
            # timestamps, system lines, attachments and identity placeholders are
            # not applicant experience and must never reach the index or the UI.
            answers_before = len(rec.get("answers") or [])
            dirty_answers = count_noise(rec)
            if dirty_answers:
                stats["dirty_clusters"] += 1
                stats["dirty_answers"] += dirty_answers

            cleaned = clean_cluster(rec)
            if cleaned is None:
                stats["clusters_dropped"] += 1
                continue
            rec = cleaned
            stats["answers_dropped"] += answers_before - len(rec.get("answers") or [])

            program, basis = program_for(rec)
            rec["program"] = program
            rec["program_basis"] = basis
            counts[program] += 1
            bases[basis] += 1
            out_lines.append(json.dumps(rec, ensure_ascii=False))

    COMMUNITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    COMMUNITY_FILE.write_text("\n".join(out_lines) + "\n", encoding="utf-8")

    total = sum(counts.values())
    print(f"Tagged {total} community clusters -> {COMMUNITY_FILE}")
    for program in ("UG", "G", "mixed", "unknown"):
        n = counts[program]
        print(f"  {program:<8} {n:>5}  ({n / total:.1%})")
    print("  basis:", dict(bases))
    print(
        f"  sanitized: {stats['dirty_answers']} noisy answers in {stats['dirty_clusters']} clusters; "
        f"dropped {stats['answers_dropped']} answers and {stats['clusters_dropped']} empty clusters"
    )
    print("\nGroup name -> program:")
    for name, program in sorted({g: classify_group(g) for g in _all_groups()}.items(), key=lambda kv: kv[1]):
        print(f"  {program:<8} {name}")


def _all_groups() -> set[str]:
    groups: set[str] = set()
    with COMMUNITY_RAW_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                groups.update(json.loads(line).get("source_groups") or [])
    return groups


if __name__ == "__main__":
    main()
