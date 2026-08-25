"""
Display-only cleanup for official guideline excerpts.

The guideline PDFs are Korean government documents, and their bullets survive
text extraction as literal characters: of 1067 official chunks, 473 carry a
leading ``○``, ``◈``, ``■``, ``※`` or ``-``, and sub-bullets inside a chunk
come through as **Private Use Area** characters (U+F09F, U+F081, U+F082 --
font-private glyphs with no Unicode meaning at all, which render as a box or
as nothing).

That produces excerpts like::

    - English: TOEFL, IELTS  Submit a printed copy of one's score report

This module makes those readable. It is deliberately narrow:

* Only the *rendered* text is touched. The indexed chunk, the source title,
  page and URL are never modified, so the citation still points at exactly
  what the PDF says, and a later re-ingestion is unaffected.
* Meaningful symbols are left alone. ``→``, ``►``, ``▶``, ``∙`` and ``～``
  appear in these documents as real content (e.g. "A → B"), so they survive.
* Nothing is inserted that changes meaning: a PUA sub-bullet becomes a middle
  dot, which is what it *was* in the PDF, not a word.

Every rule targets a character class that cannot legitimately appear in the
guideline prose, so ordinary punctuation, hyphenated words and ranges pass
through untouched.
"""

import re
import unicodedata

# Bullet characters used as list markers in these documents, stripped only at
# the very start of an excerpt where they are leftover list furniture.
LEADING_BULLETS = "○◈■※□●•·∙-–—*"

# "-" is in that set, so require whitespace after the marker: that separates
# the bullet in "- Applicants who..." from a real leading hyphen in "-3 points".
_LEADING_BULLET_RE = re.compile(rf"^\s*[{re.escape(LEADING_BULLETS)}]+[ \t]+")

# Private Use Area (U+E000-U+F8FF): font-private by definition, so any
# occurrence is an extraction artifact rather than content. Here they are
# sub-bullets separating list items merged into a single chunk.
_PUA_RE = re.compile("[-]+")

# The Unicode replacement character -- a decode failure, never content.
_REPLACEMENT_RE = re.compile("�+")

# Table extraction sometimes leaves a run of pipes or a dangling separator.
_BROKEN_SEPARATOR_RE = re.compile(r"\s*\|\s*(?=\||\s*$)|\s*\|\s*\|\s*")

_MULTI_DOT_RE = re.compile(r"\.{4,}")
# Every Unicode space separator, so NBSP and friends collapse too.
_WHITESPACE_RE = re.compile("[ \t   -   　]+")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([,.;:!?])")
# A separator left stranded at either end once its neighbour was removed.
_EDGE_SEPARATOR_RE = re.compile(r"^[\s·|,;:]+|[\s·|,;]+$")


def clean_official_text(text: str | None) -> str:
    """Returns the excerpt as it should be displayed. Never mutates the source."""
    if not text:
        return ""

    out = text

    # Control characters, except tab/newline which become spaces below.
    out = "".join(ch for ch in out if ch in "\t\n\r" or unicodedata.category(ch) != "Cc")

    out = _REPLACEMENT_RE.sub(" ", out)

    # A PUA sub-bullet is a list boundary; a middle dot preserves that boundary
    # without inventing wording. Spaced so it can never glue two words together.
    out = _PUA_RE.sub(" · ", out)

    out = _BROKEN_SEPARATOR_RE.sub(" ", out)
    out = _MULTI_DOT_RE.sub("...", out)

    # Newlines are layout, not content, once the chunk is a single excerpt.
    out = out.replace("\n", " ").replace("\r", " ")
    out = _WHITESPACE_RE.sub(" ", out)

    # Strip the leading bullet *after* whitespace normalisation, so
    # "  ○   Global Korea Scholarship" is caught too. Twice, for
    # "※ - Applicants..." style double markers.
    for _ in range(2):
        stripped = _LEADING_BULLET_RE.sub("", out)
        if stripped == out:
            break
        out = stripped

    out = _SPACE_BEFORE_PUNCT_RE.sub(r"\1", out)
    out = _EDGE_SEPARATOR_RE.sub("", out)
    out = _WHITESPACE_RE.sub(" ", out).strip()

    return out
