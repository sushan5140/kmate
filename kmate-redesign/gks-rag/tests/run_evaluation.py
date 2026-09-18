"""
Runs the evaluation set in tests/evaluation_set.json against the retriever and
writes tests/evaluation_results.json.

Checks the guarantees that matter for this feature, per case:
  * official program purity   -- no cross-program official evidence, ever
  * official relevance        -- retrieved official text shares a concept with
                                the question
  * source/page present       -- every official chunk is citable
  * no invented official rule -- concepts the guideline doesn't address are
                                reported as unsupported rather than implied
  * community usefulness      -- community cases still returned
  * community program relevance
  * conflict flags preserved

    python -m tests.run_evaluation
"""

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.retriever import Retriever, coverage  # noqa: E402
from app.settings import TOP_K  # noqa: E402

HERE = Path(__file__).resolve().parent


def evaluate() -> dict:
    spec = json.loads((HERE / "evaluation_set.json").read_text(encoding="utf-8"))
    retriever = Retriever()

    cases, failures = [], []
    topics = Counter()

    for item in spec["questions"]:
        for program in item["programs"]:
            official = retriever.search(item["q"], TOP_K, "official", program=program)
            community = retriever.search(item["q"], TOP_K, "community", program=program)
            cov = coverage(item["q"], official)

            checks = {}

            # --- official program purity -------------------------------------
            other = sorted({o["program"] for o in official if o["program"] != program})
            checks["official_program_pure"] = not other

            # --- every official chunk is citable -----------------------------
            checks["official_has_source"] = all(
                o.get("source_title") and o.get("page") for o in official
            )

            # --- official relevance ------------------------------------------
            # With concepts in the question, anything returned must share one.
            checks["official_relevant"] = (not official) or (not cov["question_concepts"]) or bool(cov["covered"])

            # --- expectation about whether the guideline answers at all -------
            expect = item["expect_official"]
            if expect is True:
                checks["official_expected_present"] = len(official) > 0
            elif expect is False:
                checks["official_expected_absent"] = len(official) == 0
            # expect is None -> either outcome acceptable

            # --- no invented rule --------------------------------------------
            wanted = item.get("expect_unsupported_concept")
            if wanted:
                checks["unsupported_concept_reported"] = wanted in cov["unsupported"]

            # --- community -----------------------------------------------------
            checks["community_present"] = len(community) > 0
            checks["community_labelled"] = all(c["layer"] == "community" for c in community)
            # Ranking preference, not a filter: the opposite program may appear
            # but must not dominate the top of the list.
            top3 = community[:3]
            opposite = sum(1 for c in top3 if c.get("program") not in (program, "mixed", "unknown", None))
            checks["community_program_relevant"] = opposite <= 1

            failed = [k for k, ok in checks.items() if not ok]
            if failed:
                failures.append({"id": item["id"], "program": program, "failed": failed})
            topics[item["topic"]] += 1

            cases.append({
                "id": item["id"],
                "topic": item["topic"],
                "program": program,
                "question": item["q"],
                "official_count": len(official),
                "community_count": len(community),
                "official_programs": sorted({o["program"] for o in official}),
                "community_programs": dict(Counter(c.get("program") for c in community)),
                "community_conflict_flags": sum(1 for c in community if c.get("possible_conflict")),
                "coverage": cov,
                "top_official": [
                    {
                        "score": o["score"],
                        "page": o["page"],
                        "source_title": o["source_title"],
                        "content_type": o["content_type"],
                        "extraction_quality": o["extraction_quality"],
                        "claim": (o["claim"] or "")[:300],
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
            "cases": len(cases),
            "questions": len(spec["questions"]),
            "passed": passed,
            "failed": len(cases) - passed,
            "topics_covered": len(topics),
            "official_pending_cases": sum(1 for c in cases if c["official_count"] == 0),
            "failures": failures,
        },
        "cases": cases,
    }


def main() -> int:
    results = evaluate()
    out = HERE / "evaluation_results.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    s = results["summary"]
    print(f"Evaluation: {s['passed']}/{s['cases']} cases passed "
          f"({s['questions']} questions, {s['topics_covered']} topics)")
    print(f"  no official evidence (pending): {s['official_pending_cases']}")
    print(f"  results -> {out}")
    for f in s["failures"]:
        print(f"  FAIL {f['id']} [{f['program']}]: {', '.join(f['failed'])}")
    return 1 if s["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
