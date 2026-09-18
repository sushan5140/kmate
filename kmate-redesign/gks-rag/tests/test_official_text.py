"""
Official excerpt sanitizer regression tests.

The guideline PDFs leak their own layout into extracted text: Korean bullet
markers at the start of a chunk, and Private Use Area glyphs (U+F09F, U+F081,
U+F082) standing in for sub-bullets where several list items were merged into
one chunk. Those render as a box or as nothing.

The risk in fixing that is over-cleaning, so half of these tests assert what
must NOT change: arrows that are real content, hyphens inside words and
ranges, and a leading minus that is part of a number.

    python -m tests.test_official_text
"""

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.official_text import clean_official_text as clean  # noqa: E402

PUA = ""      # the sub-bullet seen 90 times in the 2026 guidelines
PUA_ALT = ""  # and its siblings
REPLACEMENT = "�"
NBSP = " "


# --- known extraction cases (all taken from the real corpus) -------------------

def test_leading_hyphen_bullet_is_removed():
    assert clean("- All fields of study offered by GKS participating universities") == \
        "All fields of study offered by GKS participating universities"


def test_leading_korean_bullets_are_removed():
    for bullet in ("○", "◈", "■", "※", "□", "●"):
        assert clean(f"{bullet} Global Korea Scholarship is designed to provide") == \
            "Global Korea Scholarship is designed to provide", f"bullet {bullet!r} survived"


def test_double_bullet_is_removed():
    assert clean("※ - Applicants must submit the form") == "Applicants must submit the form"


def test_pua_glyph_becomes_a_visible_separator():
    """
    The glyph separates two merged list items, so it must not simply vanish and
    run the two sentences together.
    """
    got = clean(f"- English: TOEFL, IELTS {PUA} Submit a printed copy of one's score report")
    assert got == "English: TOEFL, IELTS · Submit a printed copy of one's score report", got
    assert PUA not in got


def test_all_pua_variants_are_handled():
    for glyph in (PUA, PUA_ALT, "", "", ""):
        got = clean(f"Condition one {glyph} Condition two")
        assert glyph not in got, f"{glyph!r} survived"
        assert got == "Condition one · Condition two", got


def test_replacement_character_is_removed():
    assert clean(f"A decode {REPLACEMENT} failure") == "A decode failure"


def test_duplicated_and_exotic_whitespace_is_collapsed():
    assert clean("Score  must be   at least 80") == "Score must be at least 80"
    assert clean(f"Non{NBSP}breaking{NBSP}space") == "Non breaking space"
    assert clean("Line one\nLine two") == "Line one Line two"


def test_broken_table_separators_are_collapsed():
    assert clean("Round 1 | | Round 2") == "Round 1 | Round 2"
    assert clean("Embassy Track |") == "Embassy Track"


def test_overlong_dot_runs_are_shortened():
    assert clean("See page 12 ..... for details") == "See page 12... for details"


def test_control_characters_are_removed():
    assert clean("Applicants\x00 must\x07 apply") == "Applicants must apply"


def test_empty_and_none_are_safe():
    assert clean(None) == ""
    assert clean("") == ""
    assert clean("   ") == ""


# --- conservatism: legitimate content must survive untouched -------------------

def test_arrows_are_content_and_survive():
    for arrow in ("→", "►", "▶", "∙", "～"):
        text = f"Apply {arrow} embassy track only"
        assert clean(text) == text, f"{arrow!r} was stripped"


def test_leading_minus_on_a_number_survives():
    assert clean("-3 points are deducted for late submission") == \
        "-3 points are deducted for late submission"


def test_hyphenated_words_and_ranges_survive():
    text = "covers 2026-2027 and re-apply cases for R-GKS applicants"
    assert clean(text) == text


def test_ordinary_punctuation_survives():
    text = "Applicants must submit: (1) a transcript; (2) a diploma. Is that clear?"
    assert clean(text) == text


def test_mid_sentence_bullet_characters_survive():
    """Only the *leading* marker is furniture; one mid-sentence is real content."""
    text = "Grades are A ○ B ○ C in the legend"
    assert clean(text) == text


# --- the sanitizer is display-only --------------------------------------------

def test_source_record_is_not_mutated():
    from app.retriever import Retriever
    r = Retriever()
    official = r.search("Do I need IELTS for GKS-U?", 6, "official", program="UG")
    assert official, "no official evidence returned"

    for item in official:
        claim = item["claim"] or ""
        assert not claim.startswith("- "), f"leading bullet reached the response: {claim[:60]!r}"
        assert not any("" <= ch <= "" for ch in claim), f"PUA glyph reached the response: {claim[:60]!r}"
        # The citation must still be intact -- only the prose was cleaned.
        assert item["source_title"], "source title lost"
        assert item["page"], "page number lost"

    # And the underlying index record still holds the original text.
    raw = [rec for rec in r.records if rec.get("_layer") == "official"]
    assert any((rec.get("claim") or "").startswith(("-", "○", "◈", "※", "■"))
               for rec in raw), "expected the stored chunks to still carry their original bullets"


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
    print(f"\n{passed}/{len(tests)} official-text tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
