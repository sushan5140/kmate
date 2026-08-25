"""
Runs the usefulness audit against the DEPLOYED service and writes
tests/production_usefulness_results.json.

This audits the applicant-facing answer, not retrieval scores: for every case it
records the official evidence, the community answers that were selected, their
usefulness labels, the final answer text, and a pass/fail with notes.

    python -m tests.run_production_usefulness
    GKS_RAG_BASE=http://localhost:8000 python -m tests.run_production_usefulness
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

HERE = Path(__file__).resolve().parent
BASE = os.getenv("GKS_RAG_BASE", "https://gks-rag.vercel.app").rstrip("/")

# Labels that are acceptable to show an applicant.
SHOWABLE = {"useful", "partially_useful", "unsupported_guess"}


def ask(question: str, program: str) -> tuple[dict, float]:
    body = json.dumps({"question": question, "program": program}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/ask", data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read())
    return payload, time.perf_counter() - t0


def audit_case(item: dict, program: str) -> dict:
    data, elapsed = ask(item["q"], program)
    checks: dict[str, bool] = {}
    notes: list[str] = []

    official = data["evidence"]["official"]
    community = data["evidence"]["community"]
    coverage = data.get("coverage", {})
    conflict = data.get("conflict", {}) or {}
    clarified = bool(data.get("needs_clarification"))

    # --- vague questions must ask, not guess ---------------------------------
    wants_clarification = bool(item.get("expect_clarification"))
    checks["clarification_when_vague"] = clarified == wants_clarification
    if clarified:
        checks["no_evidence_when_clarifying"] = not official and not community

    # --- official layer -------------------------------------------------------
    checks["official_program_pure"] = all(o["program"] == program for o in official)
    checks["official_citable"] = all(o.get("source_title") and o.get("page") for o in official)
    checks["no_archived_source"] = all(
        "(Original)" not in (o.get("source_title") or "") for o in official
    )
    expect = item.get("expect_official")
    if expect is True and not clarified:
        checks["official_present_when_expected"] = len(official) > 0
    elif expect is False:
        checks["official_absent_when_expected"] = len(official) == 0
    if item.get("expect_unsupported") and not clarified:
        checks["unsupported_concept_reported"] = item["expect_unsupported"] in coverage.get("unsupported", [])

    # --- community usefulness --------------------------------------------------
    labels = Counter()
    for case in community:
        for a in case.get("answers", []):
            labels[a.get("usefulness") or "unlabelled"] += 1

    checks["community_non_official"] = all(c["layer"] == "community" for c in community)
    checks["no_filler_surfaced"] = all(lbl in SHOWABLE for lbl in labels)
    checks["cases_capped"] = len(community) <= 3
    checks["answers_capped"] = all(len(c.get("answers", [])) <= 3 for c in community)
    checks["every_case_has_an_answer"] = all(c.get("answers") for c in community)
    if not clarified and expect is not False:
        # At least one genuinely substantive reply, not only hedges.
        checks["has_substantive_community_answer"] = any(
            lbl in ("useful", "partially_useful") for lbl in labels
        ) or not community
        if not community:
            notes.append("no community evidence returned")

    # --- answer shape ----------------------------------------------------------
    answer = data.get("answer", "")
    if not clarified:
        checks["answer_has_sections"] = all(
            s in answer for s in ("Official", "What you should do")
        )
        checks["answer_is_compact"] = len(answer) <= 1600
    if conflict.get("against_official"):
        checks["conflict_defers_to_official"] = "follow the guideline" in answer.lower() or \
            "follow the official guideline" in answer.lower()
        notes.append("community conflicts with official guidance")
    elif conflict.get("community_internal"):
        checks["mixed_experience_is_labelled"] = "mixed experiences" in answer.lower()
        notes.append("community replies disagree with each other")

    failed = [k for k, ok in checks.items() if not ok]
    return {
        "id": item["id"], "topic": item["topic"], "program": program, "question": item["q"],
        "elapsed_s": round(elapsed, 3),
        "needs_clarification": clarified,
        "official_evidence": [
            {"score": o["score"], "page": o["page"], "source_title": o["source_title"],
             "claim": (o["claim"] or "")[:240]}
            for o in official[:3]
        ],
        "selected_community_answers": [
            {"cluster_id": c["cluster_id"], "program": c.get("program"),
             "confidence": c.get("answer_confidence"), "possible_conflict": c.get("possible_conflict"),
             "question": c.get("question"),
             "answers": [
                 {"text": a["text"][:240], "usefulness": a.get("usefulness"),
                  "reasons": a.get("usefulness_reasons", [])}
                 for a in c.get("answers", [])
             ]}
            for c in community
        ],
        "usefulness_labels": dict(labels),
        "coverage": coverage,
        "conflict": conflict,
        "final_answer": answer,
        "checks": checks,
        "passed": not failed,
        "failed_checks": failed,
        "notes": notes,
    }


def main() -> int:
    spec = json.loads((HERE / "production_usefulness_set.json").read_text(encoding="utf-8"))
    cases, label_totals = [], Counter()

    print(f"Auditing {BASE}")
    for item in spec["questions"]:
        for program in item["programs"]:
            try:
                result = audit_case(item, program)
            except (urllib.error.URLError, TimeoutError) as e:
                result = {"id": item["id"], "program": program, "question": item["q"],
                          "passed": False, "failed_checks": ["request_failed"], "notes": [str(e)]}
            cases.append(result)
            label_totals.update(result.get("usefulness_labels", {}))

    passed = sum(1 for c in cases if c["passed"])
    summary = {
        "base_url": BASE,
        "questions": len(spec["questions"]),
        "cases": len(cases),
        "passed": passed,
        "failed": len(cases) - passed,
        "pass_rate": round(passed / len(cases), 4) if cases else 0,
        "answer_usefulness_labels": dict(label_totals),
        "median_latency_s": round(
            sorted(c.get("elapsed_s", 0) for c in cases)[len(cases) // 2], 3
        ) if cases else None,
        "failures": [
            {"id": c["id"], "program": c["program"], "q": c["question"], "failed": c["failed_checks"]}
            for c in cases if not c["passed"]
        ],
    }

    out = HERE / "production_usefulness_results.json"
    out.write_text(json.dumps({"summary": summary, "cases": cases}, ensure_ascii=False, indent=2),
                   encoding="utf-8")

    print(f"Usefulness audit: {passed}/{len(cases)} cases passed "
          f"({summary['pass_rate']:.1%}) across {summary['questions']} questions")
    print(f"  answer labels: {dict(label_totals)}")
    print(f"  median latency: {summary['median_latency_s']}s")
    print(f"  results -> {out}")
    for f in summary["failures"][:20]:
        print(f"  FAIL {f['id']} [{f['program']}] {f['q'][:48]!r}: {', '.join(f['failed'])}")
    return 1 if summary["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
