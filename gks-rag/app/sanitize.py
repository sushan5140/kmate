"""
Strips WhatsApp export noise out of community text.

The community corpus was exported from WhatsApp chats, and the export format
leaks two kinds of junk into the message bodies:

  1. **Appended system lines.** A real answer is followed by one or more export
     lines of the shape ``DD/MM/YY, H:MM am/pm - <actor> <system event>``, e.g.
     "...didn't cost me much 31/05/26, 8:41 pm - [PHONE] joined using a group
     link." That timestamp-dash prefix is the export's own line marker, so it is
     a precise cut point: everything from the first one onward is noise.
  2. **Inline artifacts** -- ``<This message was edited>``, ``<Media omitted>``,
     attachment filenames, ``~ Name`` sender markers, and the ``[PHONE]`` /
     ``[EMAIL]`` / ``[USERNAME]`` / ``[ID]`` redaction placeholders.

The placeholders carry no meaning for an applicant (they are already redacted),
so they are removed rather than shown.

What this deliberately does NOT touch: anything a person actually said. "My
university told me..." is the experience we want, not metadata. Only structural
export artifacts and identity tokens are removed.
"""

import re

# --- 1. the export line marker: "31/05/26, 8:41 pm - " -----------------------
# Requires the full date + time + dash structure, so a bare date someone typed
# ("the deadline is 31/05") is left alone.
EXPORT_LINE_RE = re.compile(
    r"\s*\d{1,2}/\d{1,2}/\d{2,4}\s*,\s*\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?\s*[-–]\s*",
    re.I,
)

# --- 2. inline artifacts ------------------------------------------------------
INLINE_NOISE = [
    re.compile(r"<\s*This message was edited\s*>", re.I),
    re.compile(r"<\s*Media omitted\s*>", re.I),
    re.compile(r"\bThis message was deleted\b", re.I),
    re.compile(r"\bYou deleted this message\b", re.I),
    re.compile(r"\bnull\b\s*\(file attached\)", re.I),
    # Attachment filenames, with or without the trailing marker. The extension
    # list is closed so domains like scholaro.com / niied.go.kr are untouched.
    re.compile(
        r"\S*\.(?:jpg|jpeg|png|gif|webp|pdf|docx?|xlsx?|pptx?|mp4|mp3|opus|m4a|zip|rar)\b"
        r"\s*(?:\(file attached\))?",
        re.I,
    ),
    re.compile(r"\(file attached\)", re.I),
    # WhatsApp display-name marker: "~ musa", "~ Wanda 🖤"
    re.compile(r"~\s*\S+(?:\s+\S+)?(?=\s+(?:created|changed|added|joined|left|was)\b)", re.I),
    # Redaction placeholders -- already anonymised, meaningless to an applicant.
    re.compile(r"\[(?:PHONE|EMAIL|USERNAME|ID|NAME|LINK|URL)\]", re.I),
    re.compile(r"\bMessages and calls are end-to-end encrypted[^.]*\.?", re.I),
]

# --- 3. system events that can survive without a timestamp prefix -------------
# "left"/"removed" are matched only in unambiguous group-membership phrasings so
# that "I left my documents at home" is never treated as a system line.
SYSTEM_EVENT_RE = re.compile(
    r"(?:"
    r"joined using (?:a|this) group link"
    r"|was added\b"
    r"|added you\b"
    r"|left the group\b"
    r"|was removed\b"
    r"|removed\s+\S+\s+from the group\b"
    r"|changed (?:the subject|this group|the group name|their phone number|to)\b"
    r"|created the username\b"
    r"|changed the group (?:description|icon|settings)\b"
    r"|pinned a message\b"
    r"|(?:you'?re|you are) now an admin\b"
    r"|turned on admin approval\b"
    r"|deleted this group\b"
    r"|security code changed\b"
    r")",
    re.I,
)

# --- 4. residual identity tokens ---------------------------------------------
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]{2,}")
# 9+ digits of phone-ish characters. GPA scales ("2.64/4.0") and TOPIK levels are
# far too short to match.
PHONE_RE = re.compile(r"\+?\d[\d\s().‑-]{7,}\d")
HANDLE_RE = re.compile(r"(?<![\w/])@[A-Za-z0-9_.]{3,}")

# Leftover punctuation once tokens are removed.
_PUNCT_EDGES = re.compile(r"^[\s,;:.\-–—()\[\]]+|[\s,;:\-–—(\[]+$")
# Long dot runs are usually where a removed token used to sit.
_DOT_RUN = re.compile(r"\.{3,}")
# A conjunction left dangling once the thing it joined was removed.
_DANGLING = re.compile(r"\s+(?:and|or|with|the|a|an|to|for|of|is|are)\s*$", re.I)
_MULTI_SPACE = re.compile(r"\s{2,}")
_EMPTY_PARENS = re.compile(r"\(\s*\)|\[\s*\]")

# Below this a "cleaned" answer is punctuation or an emoji fragment, not content.
MIN_MEANINGFUL_CHARS = 3


def clean_text(text: str | None) -> str:
    """Returns the message with export/system/identity noise removed."""
    if not text:
        return ""

    # Cut at the first export line marker -- everything after it is export noise.
    cut = EXPORT_LINE_RE.split(text, maxsplit=1)[0]

    for pattern in INLINE_NOISE:
        cut = pattern.sub(" ", cut)

    # Drop any sentence-ish segment that is a system event.
    segments = re.split(r"(?<=[.!?])\s+|\n+", cut)
    kept = [s for s in segments if not SYSTEM_EVENT_RE.search(s)]
    cut = " ".join(kept)
    # A system event with no sentence boundary before it (common when the export
    # line marker was already stripped) -- truncate at the event itself.
    m = SYSTEM_EVENT_RE.search(cut)
    if m:
        cut = cut[: m.start()]

    cut = EMAIL_RE.sub(" ", cut)
    cut = PHONE_RE.sub(" ", cut)
    cut = HANDLE_RE.sub(" ", cut)

    cut = _EMPTY_PARENS.sub(" ", cut)
    cut = _DOT_RUN.sub(".", cut)
    cut = _MULTI_SPACE.sub(" ", cut).strip()
    cut = _PUNCT_EDGES.sub("", cut).strip()
    cut = _DANGLING.sub("", cut).strip()
    return cut


def is_meaningful(text: str) -> bool:
    """True when what survived cleaning still says something."""
    if not text:
        return False
    # Require some letters; a string of emoji/punctuation is not an answer.
    return len(text) >= MIN_MEANINGFUL_CHARS and bool(re.search(r"[A-Za-zऀ-ॿ가-힯]", text))


def clean_answers(answers: list[dict]) -> list[dict]:
    """Cleans answer texts, dropping any that were pure noise."""
    out = []
    for a in answers or []:
        text = clean_text(a.get("text"))
        if not is_meaningful(text):
            continue
        out.append({**a, "text": text})
    return out


def clean_cluster(rec: dict) -> dict | None:
    """
    Cleans a community cluster in place-ish (returns a new dict).

    Returns None when nothing meaningful survives -- such a cluster was entirely
    export noise and should not be indexed at all.
    """
    rec = dict(rec)

    question = clean_text(rec.get("canonical_question"))
    variants = [v for v in (clean_text(v) for v in rec.get("question_variants") or []) if is_meaningful(v)]
    if not is_meaningful(question):
        # Fall back to the best surviving variant rather than losing the cluster.
        question = variants[0] if variants else ""

    answers = clean_answers(rec.get("answers"))

    if not is_meaningful(question) and not answers:
        return None

    rec["canonical_question"] = question
    rec["question_variants"] = variants
    rec["answers"] = answers
    return rec


def count_noise(rec: dict) -> int:
    """How many of a cluster's answers carry export noise (for build reporting)."""
    n = 0
    for a in rec.get("answers") or []:
        original = (a.get("text") or "").strip()
        if original and clean_text(original) != original:
            n += 1
    return n
