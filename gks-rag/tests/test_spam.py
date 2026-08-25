"""
Spam / recruitment regression tests for the community layer.

The community corpus is exported from open WhatsApp groups, so it carries
class recruitment, group promotion, DM solicitation and paid-service adverts
alongside genuine applicant experience. Those posts score *well* on the
usefulness heuristics -- they are full of action verbs and specific numbers --
so they need their own detector, and they must be excluded outright rather
than merely ranked lower.

The other half of these tests matters just as much: an applicant who mentions
WhatsApp, a fee they paid, or a tool they recommend must stay visible.

    python -m tests.test_spam
"""

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.spam import is_promotional, promotional_families  # noqa: E402
from app.usefulness import classify_answer, select_answers  # noqa: E402


def _label(text: str) -> str:
    return classify_answer(text)["label"]


def _assert_spam(text: str, note: str = "") -> None:
    label = _label(text)
    assert label == "spam", f"expected spam{' (' + note + ')' if note else ''}, got {label!r}: {text[:70]!r}"


def _assert_not_spam(text: str) -> None:
    label = _label(text)
    assert label != "spam", f"legitimate answer was flagged as spam: {text[:70]!r} -> families={sorted(promotional_families(text))}"


# --- the real corpus example that prompted this -------------------------------

CORPUS_SPAM = ("Guys who contacted me for topik1 group classes last month, kindly contact me again. "
               "I'm starting only one batch this time from next week. Only Pakistanis! "
               "3 slots available in one group.")


def test_corpus_recruitment_post_is_spam():
    _assert_spam(CORPUS_SPAM, "the post that surfaced under 'Do I need IELTS for GKS-U?'")


# --- 1. class / course recruitment --------------------------------------------

def test_class_recruitment_is_spam():
    for text in [
        "Starting a new TOPIK batch from next week, fees 2000 per month, DM me to enroll.",
        "I am conducting online Korean classes for beginners. Registration open, limited seats.",
        "New coaching batch for TOPIK 2 starting Monday. 5 slots available, contact me.",
        "Korean language classes starting soon, affordable fees, message me for details.",
    ]:
        _assert_spam(text)


# --- 2. WhatsApp / Telegram group promotion -----------------------------------

def test_group_promotion_is_spam():
    for text in [
        "Join our WhatsApp group for GKS 2026 applicants https://chat.whatsapp.com/KxYz123",
        "Join my Telegram channel for daily GKS updates and notices.",
        "GKS 2026 aspirants join this group, link below t.me/gksaspirants",
        "Add me in the group, I want to share documents with everyone.",
    ]:
        _assert_spam(text)


# --- 3. "DM / contact me" solicitation ----------------------------------------

def test_dm_solicitation_is_spam():
    for text in [
        "DM me for details.",
        "For more information contact me on WhatsApp.",
        "Anyone who needs help with the application, inbox me.",
        "Interested ones can reach out to me.",
    ]:
        _assert_spam(text)


# --- 4. paid service promotion -------------------------------------------------

def test_paid_service_is_spam():
    for text in [
        "We provide SOP writing service at affordable price, contact us now.",
        "Our consultancy handles the full GKS application, fees are negotiable, DM us.",
        "I am offering essay editing service for GKS applicants, Rs 3000 per document.",
    ]:
        _assert_spam(text)


# --- 5. generic advertisement ---------------------------------------------------

def test_generic_advertisement_is_spam():
    for text in [
        "Best consultancy for Korea admission, 100% visa guarantee, book now.",
        "We offer guaranteed admission to Korean universities. Special offer this month.",
        "Study in Korea with our agency! Limited seats, hurry up.",
    ]:
        _assert_spam(text)


# --- 6. legitimate experience that merely mentions WhatsApp ---------------------

def test_whatsapp_mention_in_real_experience_is_kept():
    for text in [
        "I asked in the WhatsApp group and someone who applied last year said marksheets "
        "were accepted by NIIED without a transcript.",
        "There was a WhatsApp group for my embassy batch, and they told us the deadline "
        "was extended by a week.",
        "My university sent the documents over WhatsApp first, then couriered the sealed "
        "originals to the embassy.",
    ]:
        _assert_not_spam(text)


# --- 7. legitimate recommendation that must stay visible ------------------------

def test_legitimate_recommendation_is_kept():
    for text in [
        "I recommend converting your GPA with Scholaro, it is free and my embassy accepted it.",
        "Use the NIIED website form, not the university one -- I submitted the wrong form "
        "and had to resend everything.",
        "Get your transcript apostilled at MOFA, it took me three days and cost about 500 rupees.",
    ]:
        _assert_not_spam(text)


def test_being_a_student_is_not_offering_a_class():
    """
    Found by scanning the real corpus: "I'm taking classes at ..." is an
    applicant describing their own study, not someone recruiting for a batch.
    """
    for text in [
        "Hello everyone, I'm taking classes at King Sejong Institute online and if we meet "
        "the required criteria we'll get the certificate.",
        "I am taking a Korean course at my university this semester.",
    ]:
        _assert_not_spam(text)


def test_hearing_something_on_instagram_is_not_solicitation():
    """
    Also from the corpus: "the people told me on Instagram" is a report of what
    the writer heard, not an invitation to message them.
    """
    for text in [
        "I just heard that we have to make a transcript and ask our high school to stamp it, "
        "the people told me on Instagram.",
        "Someone messaged me on WhatsApp saying the deadline moved, but I could not confirm it.",
    ]:
        _assert_not_spam(text)


def test_quota_talk_is_not_scarcity_spam():
    """
    GKS quotas are a real topic, so scarcity wording alone must stay visible --
    only scarcity *next to* something being sold is an advert.
    """
    for text in [
        "The embassy told me only 3 slots are available for my country this year.",
        "My country had 2 seats left after the first round, so competition was tight.",
        "There are limited slots for the embassy track, my consulate confirmed it.",
    ]:
        _assert_not_spam(text)


def test_incidental_single_signal_is_kept():
    """One family alone is routinely innocent and must not be enough."""
    for text in [
        "The embassy charged a fee of 2000 for attestation, so bring cash with you.",
        "I took a Korean course before applying and it helped a lot in the interview.",
        "My agency did nothing useful, I submitted everything myself in the end.",
    ]:
        _assert_not_spam(text)


# --- exclusion, not demotion ----------------------------------------------------

def test_spam_is_excluded_from_selection_entirely():
    answers = [
        {"text": CORPUS_SPAM, "tag": "community_answer"},
        {"text": "I submitted my marksheets with an official letter from the examination "
                 "office and the embassy accepted them.", "tag": "community_answer"},
    ]
    selected, _ = select_answers(answers, frozenset())
    texts = [a["text"] for a in selected]
    assert CORPUS_SPAM not in texts, "promotional answer was still surfaced"
    assert len(selected) == 1, f"expected only the genuine answer, got {len(selected)}"


def test_spam_is_never_used_as_a_fallback():
    """A thread whose only content is an advert must yield nothing at all."""
    selected, best = select_answers(
        [{"text": "DM me for details.", "tag": "community_answer"},
         {"text": "Join our WhatsApp group https://chat.whatsapp.com/abc", "tag": "community_answer"}],
        frozenset(),
    )
    assert selected == [], f"advert surfaced as a fallback: {selected}"
    assert best == 0.0


def test_invite_link_overrides_reported_experience():
    """Pasting a group link is promotion however the message is dressed up."""
    text = ("I applied last year and got selected, join our WhatsApp group "
            "https://chat.whatsapp.com/abc123 for tips")
    ok, reasons = is_promotional(text, has_experience=True, has_source=True)
    assert ok, f"invite link not caught despite experience wording: {reasons}"


def test_reported_experience_brakes_a_single_weak_signal():
    """The brake exists so genuine reports survive an incidental match."""
    ok, _ = is_promotional(
        "I contacted me... typo aside, my batch fees were paid by NIIED.",
        has_experience=True,
    )
    assert not ok


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
    print(f"\n{passed}/{len(tests)} spam tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
