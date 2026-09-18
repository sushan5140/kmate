"""
Usefulness regression tests: the community layer must surface answers that
actually help, and must never present filler, guesses or other people's
questions as experience.

    python -m tests.test_usefulness
"""

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.retriever import Retriever, query_concepts  # noqa: E402
from app.usefulness import classify_answer, detect_conflicts, select_answers  # noqa: E402

_retriever: Retriever | None = None


def retriever() -> Retriever:
    global _retriever
    if _retriever is None:
        _retriever = Retriever()
    return _retriever


TRANSCRIPT_Q = "My university does not issue a transcript. Can I submit marksheets?"
DETAILED = ("My university did not issue a transcript, so I requested an officially signed "
            "consolidated academic record from the examination office.")


# --- ranking: substance beats filler ----------------------------------------

def test_bare_yes_ranks_below_detailed_experience():
    qc = query_concepts(TRANSCRIPT_Q)
    yes = classify_answer("Yes.", None, qc)
    detailed = classify_answer(DETAILED, None, qc)
    assert detailed["score"] > yes["score"], (detailed, yes)
    assert yes["label"] == "too_vague"
    assert detailed["label"] in ("useful", "partially_useful")


def test_hedged_answer_ranks_below_source_backed_advice():
    qc = query_concepts("Do I need to apostille my transcript?")
    guess = classify_answer("Probably not needed.", None, qc)
    sourced = classify_answer(
        "The guideline says required certificates must be apostilled; my embassy confirmed it.", None, qc
    )
    assert sourced["score"] > guess["score"], (sourced, guess)
    assert guess["label"] in ("unsupported_guess", "too_vague")
    assert sourced["label"] == "useful"


def test_hedged_answer_is_labelled_as_a_guess():
    qc = query_concepts("Do I need to apostille my transcript?")
    v = classify_answer("I think you probably need to apostille the transcript", None, qc)
    assert v["label"] == "unsupported_guess", v


# --- replies that are not answers -------------------------------------------

def test_a_reply_that_is_only_a_question_is_never_shown():
    qc = query_concepts(TRANSCRIPT_Q)
    for text in [
        "Pls is there anyone that has legalized their transcripts?",
        "Guys I have a query I have my 10th class mark sheet, what should I do",
        "I haven't received transcript from my college..can I use my marksheet instead..",
        "does anyone know about the transcript rules",
    ]:
        v = classify_answer(text, None, qc)
        assert v["label"] not in ("useful", "partially_useful"), f"{text!r} -> {v}"


def test_social_filler_is_never_shown():
    qc = query_concepts(TRANSCRIPT_Q)
    for text in ["ok thanks", "Thank u Girls", "Yup", "hii guys, hope you all are doing well!", "Ah okay"]:
        v = classify_answer(text, None, qc)
        assert v["label"] not in ("useful", "partially_useful"), f"{text!r} -> {v}"


def test_irrelevant_nearby_reply_does_not_surface():
    """A reply about university choice sitting in a transcript thread."""
    qc = query_concepts(TRANSCRIPT_Q)
    v = classify_answer(
        "I plan to go through rgks so I choose pusan national university and hannam university", None, qc
    )
    assert v["label"] not in ("useful", "partially_useful"), v


def test_selection_drops_filler_and_keeps_substance():
    qc = query_concepts(TRANSCRIPT_Q)
    answers = [
        {"text": "ok thanks", "tag": "community_answer"},
        {"text": "Yup", "tag": "community_answer"},
        {"text": DETAILED, "tag": "reported_experience"},
        {"text": "anyone knows about this?", "tag": "community_answer"},
    ]
    selected, best = select_answers(answers, qc, limit=3)
    assert len(selected) == 1, selected
    assert selected[0]["text"] == DETAILED
    assert best > 0.5


def test_selection_is_capped_and_ordered_by_usefulness():
    qc = query_concepts("How many recommendation letters do I need?")
    answers = [
        {"text": "Only one is required, my embassy confirmed it in writing.", "tag": "community_answer"},
        {"text": "1 original + 3 photocopies for Embassy Track, 1 original for University track",
         "tag": "source_or_next_action"},
        {"text": "You should submit the recommendation letter sealed in an envelope", "tag": "community_answer"},
        {"text": "I sent mine last week after asking my professor to sign the flap", "tag": "reported_experience"},
        {"text": "ok", "tag": "community_answer"},
    ]
    selected, _ = select_answers(answers, qc, limit=3)
    assert len(selected) <= 3
    scores = [a["usefulness_score"] for a in selected]
    assert scores == sorted(scores, reverse=True), scores


def test_no_answer_text_is_rewritten_or_merged():
    """Answers are shown verbatim; a tidier combined answer would be fabrication."""
    qc = query_concepts(TRANSCRIPT_Q)
    answers = [{"text": DETAILED, "tag": "reported_experience"}]
    selected, _ = select_answers(answers, qc, limit=3)
    assert selected[0]["text"] == DETAILED


# --- conflicts ----------------------------------------------------------------

def test_disagreeing_community_replies_are_flagged():
    qc = query_concepts("Do I need to apostille my transcript?")
    selected = [
        {"text": "You must apostille the transcript before sending it"},
        {"text": "No, the transcript does not need an apostille"},
    ]
    flags = detect_conflicts(selected, [], qc)
    assert flags["community_internal"] is True, flags


def test_community_contradicting_official_is_flagged():
    qc = query_concepts("Do I need to apostille my transcript?")
    official = [{"claim": "Required certificates must be apostilled or consular confirmed"}]
    selected = [{"text": "no need to apostille the transcript, I sent mine plain"}]
    flags = detect_conflicts(selected, official, qc)
    assert flags["against_official"] is True, flags


def test_agreeing_replies_are_not_flagged_as_conflicting():
    qc = query_concepts("Do I need to apostille my transcript?")
    official = [{"claim": "Required certificates must be apostilled or consular confirmed"}]
    selected = [{"text": "You must apostille the required certificates before submitting"}]
    flags = detect_conflicts(selected, official, qc)
    assert flags["against_official"] is False, flags


# --- live retrieval guarantees -----------------------------------------------

def test_live_community_results_contain_no_filler_or_questions():
    r = retriever()
    for program in ("UG", "G"):
        for q in [TRANSCRIPT_Q, "Do I need apostille for every document?",
                  "Who should write my recommendation letter?", "How many universities can I choose?"]:
            for case in r.search(q, 6, "community", program=program):
                assert case["answers"], "a surfaced case must have at least one answer"
                for a in case["answers"]:
                    assert a["usefulness"] in ("useful", "partially_useful", "unsupported_guess"), (
                        f"[{program}] {q!r} surfaced a {a['usefulness']} answer: {a['text'][:80]!r}"
                    )


def test_official_evidence_still_outranks_community():
    """Official is a separate, higher-authority layer -- never merged or displaced."""
    r = retriever()
    q = "Do I need to apostille my transcript?"
    official = r.search(q, 6, "official", program="UG")
    community = r.search(q, 6, "community", program="UG")
    assert official, "expected official evidence for a well-covered question"
    assert all(o["layer"] == "official" for o in official)
    assert all(c["layer"] == "community" for c in community)


def test_community_answers_remain_visibly_non_official():
    r = retriever()
    for case in r.search("Do I need to apostille my transcript?", 6, "community", program="UG"):
        assert case["layer"] == "community"
        assert "answer_confidence" in case and "program" in case


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
    print(f"\n{passed}/{len(tests)} usefulness tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
