"""
Retrieval regression tests for the guarantees this feature depends on.

Deliberately dependency-free (plain asserts, own runner) so they can run in CI
without pytest/httpx being installed. Function names are pytest-compatible, so
`pytest` also picks them up if it is available.

    python -m tests.test_retrieval
"""

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError  # noqa: E402

from app.main import AskRequest  # noqa: E402
from app.retriever import Retriever, coverage  # noqa: E402
from app.settings import INDEX_DIR  # noqa: E402
from app.sources import load_sources, load_verified_sources  # noqa: E402
import json  # noqa: E402

_retriever: Retriever | None = None


def retriever() -> Retriever:
    global _retriever
    if _retriever is None:
        _retriever = Retriever()
    return _retriever


PROGRAM_QUESTIONS = [
    "Do I need to apostille my transcript?",
    "Who should write my recommendation letter?",
    "How many universities can I choose?",
    "Can I apply through University Track after Embassy Track rejection?",
    "How many sets of documents do I need?",
    "What is the minimum GPA required to apply?",
    "Do I need a TOPIK score to apply?",
]

OFF_TOPIC_QUESTIONS = [
    "Can I bring my pet dog with me to Korea?",
    "What is the best neighbourhood to rent an apartment in Busan?",
    "What is the weather like in Seoul in December?",
    "Which football team should I support in Korea?",
]


# --- program isolation ------------------------------------------------------

def test_ug_official_never_returns_graduate_chunks():
    r = retriever()
    for q in PROGRAM_QUESTIONS:
        for item in r.search(q, 6, "official", program="UG"):
            assert item["program"] == "UG", f"UG query leaked {item['program']} chunk: {q!r}"


def test_g_official_never_returns_undergraduate_chunks():
    r = retriever()
    for q in PROGRAM_QUESTIONS:
        for item in r.search(q, 6, "official", program="G"):
            assert item["program"] == "G", f"G query leaked {item['program']} chunk: {q!r}"


def test_official_results_are_always_citable():
    r = retriever()
    for q in PROGRAM_QUESTIONS:
        for program in ("UG", "G"):
            for item in r.search(q, 6, "official", program=program):
                assert item["source_title"], f"official chunk without source_title: {q!r}"
                assert item["page"], f"official chunk without page: {q!r}"


# --- relevance threshold ----------------------------------------------------

def test_off_topic_questions_return_no_official_evidence():
    r = retriever()
    for q in OFF_TOPIC_QUESTIONS:
        for program in ("UG", "G"):
            got = r.search(q, 6, "official", program=program)
            assert got == [], f"off-topic question returned official evidence: {q!r} -> {len(got)}"


def test_off_topic_questions_still_return_community_experience():
    # The official layer going quiet must not empty the page.
    r = retriever()
    for q in OFF_TOPIC_QUESTIONS:
        assert r.search(q, 6, "community", program="UG"), f"no community fallback for {q!r}"


# --- explicit-rule safety ---------------------------------------------------

def test_stamp_signature_is_reported_as_unsupported_not_implied():
    """
    The guidelines discuss transcripts at length but do not state a school
    stamp/signature requirement. Retrieval is topical, so transcript chunks
    come back regardless -- the response must flag the gap rather than let
    that similarity read as an official rule.
    """
    r = retriever()
    q = "Does my transcript need a school stamp or signature?"
    for program in ("UG", "G"):
        official = r.search(q, 6, "official", program=program)
        cov = coverage(q, official)
        assert "stamp_signature" in cov["unsupported"], (
            f"[{program}] stamp/signature not reported as unsupported: {cov}"
        )
        assert cov["unsupported_labels"], "expected a human-readable unsupported label"


def test_coverage_reports_supported_concepts_when_genuinely_present():
    r = retriever()
    q = "Do I need to apostille my transcript?"
    official = r.search(q, 6, "official", program="UG")
    cov = coverage(q, official)
    assert "apostille" in cov["covered"], f"apostille should be covered: {cov}"
    assert "apostille" not in cov["unsupported"]


# --- community labelling ----------------------------------------------------

def test_community_results_are_always_labelled_community():
    r = retriever()
    for q in PROGRAM_QUESTIONS + OFF_TOPIC_QUESTIONS:
        for item in r.search(q, 6, "community", program="UG"):
            assert item["layer"] == "community", "community evidence lost its non-official label"
            assert "program" in item, "community evidence missing program tag"


def test_official_and_community_layers_never_mix():
    r = retriever()
    q = "Do I need to apostille my transcript?"
    assert all(i["layer"] == "official" for i in r.search(q, 6, "official", program="UG"))
    assert all(i["layer"] == "community" for i in r.search(q, 6, "community", program="UG"))


def test_opposite_program_community_case_does_not_rank_first():
    """Community filtering is a preference, not a filter -- but the opposite
    program must not lead the list."""
    r = retriever()
    for q in PROGRAM_QUESTIONS:
        for program, opposite in (("UG", "G"), ("G", "UG")):
            top = r.search(q, 6, "community", program=program)[:1]
            for item in top:
                assert item.get("program") != opposite, (
                    f"[{program}] top community case was {opposite}: {q!r}"
                )


# --- superseded editions stay out of retrieval ------------------------------

def test_archived_sources_are_not_ingested():
    """
    A superseded guideline is kept for version history, never for answering.
    The 2026 UG original (pre-NIRS-fire) contradicts the active revision on
    deadlines, submission method and document counts, so a chunk of it
    surfacing as "official" would state a withdrawn rule as current.
    """
    archived = {s.id for s in load_sources() if not s.active}
    assert archived, "expected at least one archived edition in the manifest"

    r = retriever()
    indexed = {rec.get("source_id") for rec in r.records if rec.get("_layer") == "official"}
    leaked = archived & indexed
    assert not leaked, f"archived edition(s) present in the index: {sorted(leaked)}"


def test_archived_sources_are_still_hash_verified():
    """Audit copies must not be able to drift just because they aren't indexed."""
    load_verified_sources()  # verifies every source, active or not; raises on mismatch


def test_exactly_one_active_source_per_program():
    active = [s for s in load_sources() if s.active]
    for program in ("UG", "G"):
        matches = [s.id for s in active if s.program == program]
        assert len(matches) == 1, f"expected 1 active {program} source, got {matches}"


# --- shipped index integrity ------------------------------------------------

def test_build_info_matches_source_manifest():
    """
    The index is shipped prebuilt to Vercel, whose build step cannot run the PDF
    ingestion. BUILD_INFO.json is how the source-verification guarantees travel
    with the artifact: if the shipped index was not built from the currently
    declared sources, that is a deploy-time discrepancy, not a runtime one.
    """
    info = json.loads((INDEX_DIR / "BUILD_INFO.json").read_text(encoding="utf-8"))
    sources = load_sources()

    active = {s.id: s.sha256 for s in sources if s.active}
    shipped = {s["id"]: s["sha256"] for s in info["active_sources"]}
    assert shipped == active, f"index built from different sources: {shipped} != {active}"

    archived = {s.id for s in sources if not s.active}
    assert set(info["archived_sources_excluded"]) == archived
    assert not (archived & set(info["source_ids_in_index"])), "archived edition present in shipped index"

    # One active source per program, reflected in what actually got indexed.
    assert set(info["official_by_program"]) == {"UG", "G"}
    assert all(v > 0 for v in info["official_by_program"].values())


def test_build_info_file_hashes_match_shipped_index():
    """Catches an index directory that was partially rebuilt or hand-edited."""
    import hashlib

    info = json.loads((INDEX_DIR / "BUILD_INFO.json").read_text(encoding="utf-8"))
    for name, meta in info["index_files"].items():
        f = INDEX_DIR / name
        assert f.exists(), f"index file missing: {name}"
        digest = hashlib.sha256(f.read_bytes()).hexdigest()
        assert digest == meta["sha256"], f"index file changed since build: {name}"


# --- API validation ---------------------------------------------------------

def test_missing_program_is_rejected():
    try:
        AskRequest(question="Do I need an apostille?")
    except ValidationError:
        return
    raise AssertionError("AskRequest accepted a request with no program")


def test_invalid_program_is_rejected():
    for bad in ("ug", "Graduate", "UG ", "", "PG", None, 1):
        try:
            AskRequest(question="Do I need an apostille?", program=bad)
        except ValidationError:
            continue
        raise AssertionError(f"AskRequest accepted invalid program {bad!r}")


def test_valid_programs_are_accepted():
    for good in ("UG", "G"):
        assert AskRequest(question="Do I need an apostille?", program=good).program == good


def test_short_question_is_rejected():
    try:
        AskRequest(question="hi", program="UG")
    except ValidationError:
        return
    raise AssertionError("AskRequest accepted a too-short question")


def main() -> int:
    tests = [(n, o) for n, o in sorted(globals().items()) if n.startswith("test_") and callable(o)]
    passed, failed = 0, []
    for name, fn in tests:
        try:
            fn()
            passed += 1
            print(f"  PASS  {name}")
        except Exception as e:
            failed.append(name)
            print(f"  FAIL  {name}: {e}")
            traceback.print_exc(limit=1)
    print(f"\n{passed}/{len(tests)} retrieval tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
