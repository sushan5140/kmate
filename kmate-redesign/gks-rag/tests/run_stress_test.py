"""
Runs the realistic applicant stress-test set (tests/stress_test_set.json) and
writes tests/stress_test_results.json.

Unlike run_evaluation.py, the inputs here are messy on purpose -- typos,
Hinglish, fragments -- so the point is not "does it find something" but
"does it stay honest when the input is bad".

    python -m tests.run_stress_test
"""

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.retriever import Retriever, clarification_for, coverage  # noqa: E402
from app.settings import TOP_K  # noqa: E402

HERE = Path(__file__).resolve().parent


def run() -> dict:
    spec = json.loads((HERE / "stress_test_set.json").read_text(encoding="utf-8"))
    retriever = Retriever()

    cases, failures = [], []
    by_style, by_topic = Counter(), Counter()

    for item in spec["questions"]:
        for program in item["programs"]:
            q = item["q"]
            clarification = clarification_for(q)
            checks = {}

            if clarification:
                official, community, cov = [], [], coverage(q, [])
            else:
                official = retriever.search(q, TOP_K, "official", program=program)
                community = retriever.search(q, TOP_K, "community", program=program)
                cov = coverage(q, official)

            # --- vague input must ask, not guess -----------------------------
            wants_clarification = bool(item.get("expect_clarification"))
            checks["clarification_when_vague"] = bool(clarification) == wants_clarification
            if clarification:
                # Asking a question means claiming nothing.
                checks["no_evidence_when_clarifying"] = not official and not community

            # --- official program purity -------------------------------------
            checks["official_program_pure"] = all(o["program"] == program for o in official)

            # --- citable ------------------------------------------------------
            checks["official_has_source"] = all(o.get("source_title") and o.get("page") for o in official)

            # --- no archived edition ------------------------------------------
            checks["no_archived_source"] = all(
                o.get("source_title") != "GKS-U 2026 Application Guidelines (Original)" for o in official
            )

            # --- relevance ------------------------------------------------------
            checks["official_relevant"] = (
                not official or not cov["question_concepts"] or bool(cov["covered"])
            )

            expect = item.get("expect_official")
            if expect is True and not clarification:
                checks["official_expected_present"] = len(official) > 0
            elif expect is False:
                checks["official_expected_absent"] = len(official) == 0

            wanted = item.get("expect_unsupported_concept")
            if wanted and not clarification:
                checks["unsupported_concept_reported"] = wanted in cov["unsupported"]

            # --- community stays non-official ----------------------------------
            checks["community_labelled"] = all(c["layer"] == "community" for c in community)
            opposite = sum(
                1 for c in community[:3]
                if c.get("program") not in (program, "mixed", "unknown", None)
            )
            checks["community_program_relevant"] = opposite <= 1

            failed = [k for k, ok in checks.items() if not ok]
            if failed:
                failures.append({"id": item["id"], "program": program, "q": q, "failed": failed})

            by_style[item["style"]] += 1
            by_topic[item["topic"]] += 1

            cases.append({
                "id": item["id"],
                "topic": item["topic"],
                "style": item["style"],
                "program": program,
                "question": q,
                "asked_clarification": bool(clarification),
                "clarification": clarification,
                "official_count": len(official),
                "community_count": len(community),
                "official_programs": sorted({o["program"] for o in official}),
                "community_programs": dict(Counter(c.get("program") for c in community)),
                "community_conflict_flags": sum(1 for c in community if c.get("possible_conflict")),
                "coverage": cov,
                # Diagnostics: score / page / source / extraction quality per chunk.
                "top_official": [
                    {
                        "score": o["score"],
                        "page": o["page"],
                        "source_title": o["source_title"],
                        "category": o["category"],
                        "content_type": o["content_type"],
                        "extraction_quality": o["extraction_quality"],
                        "claim": (o["claim"] or "")[:260],
                    }
                    for o in official[:3]
                ],
                "top_community": [
                    {
                        "score": c["score"],
                        "program": c.get("program"),
                        "confidence": c.get("answer_confidence"),
                        "possible_conflict": c.get("possible_conflict"),
                        "question": c.get("question"),
                    }
                    for c in community[:3]
                ],
                "checks": checks,
                "passed": not failed,
            })

    passed = sum(1 for c in cases if c["passed"])
    return {
        "summary": {
            "questions": len(spec["questions"]),
            "cases": len(cases),
            "passed": passed,
            "failed": len(cases) - passed,
            "clarifications_asked": sum(1 for c in cases if c["asked_clarification"]),
            "official_pending": sum(1 for c in cases if c["official_count"] == 0 and not c["asked_clarification"]),
            "styles": dict(by_style),
            "topics": dict(by_topic),
            "failures": failures,
        },
        "cases": cases,
    }


def main() -> int:
    results = run()
    out = HERE / "stress_test_results.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    s = results["summary"]
    print(f"Stress test: {s['passed']}/{s['cases']} cases passed "
          f"({s['questions']} questions, {len(s['topics'])} topics, {len(s['styles'])} input styles)")
    print(f"  clarifications asked: {s['clarifications_asked']}")
    print(f"  no official evidence: {s['official_pending']}")
    print(f"  results -> {out}")
    for f in s["failures"][:25]:
        print(f"  FAIL {f['id']} [{f['program']}] {f['q'][:52]!r}: {', '.join(f['failed'])}")
    if len(s["failures"]) > 25:
        print(f"  ... and {len(s['failures']) - 25} more")
    return 1 if s["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
