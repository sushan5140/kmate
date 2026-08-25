"""
Community retrieval precision regression tests.

The failure these lock down: asking "ielts" returned transcript problems,
apostille talk, graduation timing and generic application chatter, because a
thread whose *question* mentioned IELTS was allowed to contribute replies
about anything at all -- and because "ietls" produced no recognised concept,
so the topic gate never engaged.

Two rules are asserted here:

  * a misspelling must retrieve the same thing as the correct spelling
  * every surfaced answer must be about the topic that was asked

Recall matters too, so the "enough evidence survives" tests guard the opposite
failure: gating so hard that ordinary questions return nothing.

    python -m tests.test_topic_precision
"""

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.query_normalize import normalize_query  # noqa: E402
from app.retriever import Retriever, query_concepts  # noqa: E402

_retriever: Retriever | None = None


def retriever() -> Retriever:
    global _retriever
    if _retriever is None:
        _retriever = Retriever()
    return _retriever


LANGUAGE_QUERIES = [
    "ielts",
    "ietls",
    "do i need ielts",
    "is topik enough without ielts",
    "english proficiency requirement",
]

# Topics that must NOT appear in an answer to a language-test question.
OFF_TOPIC_MARKERS = (
    "apostille", "apostil", "transcript", "marksheet", "mark sheet",
    "birth certificate", "passport", "notaris", "notariz",
)

# At least one of these should appear in a language-test answer.
ON_TOPIC_MARKERS = (
    "ielts", "toefl", "topik", "english", "language", "proficiency", "moi",
    "medium of instruction",
)


def community_answers(question: str, program: str = "UG") -> list[dict]:
    out = []
    for cluster in retriever().search(question, 6, "community", program=program):
        for a in cluster["answers"]:
            out.append({**a, "cluster_score": cluster["score"], "cluster_id": cluster["cluster_id"]})
    return out


# --- query normalisation --------------------------------------------------------

def test_misspellings_normalise_to_the_canonical_term():
    for typo in ("ietls", "ilets", "iets", "ieltz", "ielt"):
        assert "ielts" in normalize_query(typo).lower(), f"{typo!r} did not normalise"
    for typo in ("tofel", "toefel", "tofl"):
        assert "toefl" in normalize_query(typo).lower(), f"{typo!r} did not normalise"


def test_phrases_expand_to_the_terms_they_mean():
    for phrase in ("english test", "english proficiency", "language requirement", "proof of english"):
        expanded = normalize_query(phrase).lower()
        assert "ielts" in expanded or "toefl" in expanded, f"{phrase!r} did not expand: {expanded!r}"


def test_normalisation_leaves_ordinary_questions_alone():
    for q in ("Do I need to apostille my transcript?", "What is the age limit to apply?"):
        assert normalize_query(q) == q, f"unnecessarily rewritten: {q!r}"


def test_misspelled_query_recovers_the_concept():
    assert "language_test" in query_concepts(normalize_query("ietls"))
    assert "language_test" in query_concepts(normalize_query("english test"))


# --- precision -------------------------------------------------------------------

def test_language_queries_return_only_language_answers():
    for q in LANGUAGE_QUERIES:
        answers = community_answers(q)
        assert answers, f"no community evidence at all for {q!r}"
        for a in answers:
            text = a["text"].lower()
            assert any(m in text for m in ON_TOPIC_MARKERS), \
                f"{q!r} surfaced an answer with no language-test content: {a['text'][:90]!r}"


def test_no_document_or_apostille_answers_for_language_queries():
    for q in LANGUAGE_QUERIES:
        for a in community_answers(q):
            text = a["text"].lower()
            # An off-topic marker is only a failure when the answer is not also
            # about the language test -- "I apostilled my IELTS certificate"
            # is a legitimate answer to a language question.
            if any(m in text for m in OFF_TOPIC_MARKERS):
                assert any(m in text for m in ON_TOPIC_MARKERS), \
                    f"{q!r} surfaced an unrelated document answer: {a['text'][:90]!r}"


def test_typo_and_correct_spelling_agree():
    correct = [a["text"] for a in community_answers("ielts")]
    typo = [a["text"] for a in community_answers("ietls")]
    assert typo == correct, "a typo produced different results from the correct spelling"


def test_unrelated_query_does_not_borrow_language_answers():
    """The gate has to cut both ways, or it is just a keyword boost."""
    for a in community_answers("Do I need to apostille my transcript?"):
        text = a["text"].lower()
        if "ielts" in text or "toefl" in text:
            assert any(m in text for m in ("apostille", "transcript", "document", "attest", "notar")), \
                f"language answer leaked into a document question: {a['text'][:90]!r}"


# --- recall: the gate must not starve ordinary questions -------------------------

def test_common_questions_still_return_evidence():
    for q in ("What is the age limit to apply?",
              "Can Korean citizens apply for this scholarship?",
              "What should I include in my personal statement?",
              "Do I need to apostille my transcript?"):
        assert community_answers(q), f"gate starved a normal question: {q!r}"


def test_fewer_but_relevant_beats_padding():
    """
    A narrow question should not be padded up to the cap with weak matches --
    the count is allowed to be small, but everything returned must be on topic.
    """
    answers = community_answers("ielts")
    assert 1 <= len(answers) <= 9, f"unexpected answer count: {len(answers)}"
    on_topic = [a for a in answers if any(m in a["text"].lower() for m in ON_TOPIC_MARKERS)]
    assert len(on_topic) == len(answers), "padding with off-topic answers"


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
    print(f"\n{passed}/{len(tests)} topic-precision tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
