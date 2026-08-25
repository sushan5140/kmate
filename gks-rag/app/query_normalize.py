"""
Query normalisation for retrieval.

Applicants type "ietls", "tofel", "english test" and "language requirement"
far more often than they type the canonical term. That matters more than it
looks: the topic gate in retriever.py keys off recognised concepts, so a
one-letter transposition doesn't merely rank worse -- it drops the gate
entirely and lets completely unrelated threads through. The measured example
was "ietls", which yielded no concepts at all and returned apostille,
marksheet and TOPIK chatter.

difflib alone can't fix this: "ietls" scores 0.80 against "ielts", and the
fuzzy cutoff has to stay at 0.85 or unrelated short words start colliding. So
the high-value domain terms get an explicit variant table instead, and phrases
that mean a term without containing it are expanded.

Only the text used for *retrieval* is rewritten. The original question is what
gets stored, displayed and echoed back -- nobody's question is silently
reworded on screen.
"""

import re

# Misspellings seen in the corpus and in real queries, mapped to the canonical
# term. Deliberately hand-listed rather than fuzzy-derived: these are the terms
# where a miss is expensive, and a wrong "correction" would be worse.
VARIANTS: dict[str, tuple[str, ...]] = {
    "ielts": ("ietls", "ilets", "iets", "ielt", "ieltz", "iletts", "ilts", "eilts",
              "ieltts", "ietlss", "ilelts", "iealts"),
    "toefl": ("tofel", "toefel", "tofl", "toeflt", "toffel", "toefel", "tofell", "toeful"),
    "topik": ("topick", "toppik", "topikk", "topik1", "topik2", "topiks", "topic-k", "topikexam"),
    "apostille": ("apostile", "apostil", "aposttile", "appostille", "apostillie", "apostilled"),
    "transcript": ("transcirpt", "transcipt", "transript", "trancript", "transcrpit"),
    "certificate": ("certifcate", "certificat", "certifikate", "cerificate"),
    "university": ("univeristy", "univercity", "universty", "uni", "unis"),
    "proficiency": ("proficency", "profiency", "proficieny"),
    "scholarship": ("scholership", "scholarshp", "schlarship", "scolarship"),
    "eligibility": ("eligiblity", "elgibility", "eligibilty"),
}
_VARIANT_TO_CANONICAL = {v: canon for canon, vs in VARIANTS.items() for v in vs}

# Phrases that mean a term without containing it. The canonical tokens are
# appended (never substituted) so the applicant's own wording still
# contributes to the lexical match.
PHRASE_EXPANSIONS: tuple[tuple[re.Pattern, str], ...] = (
    (re.compile(r"\benglish\s+(?:proficiency|language)\s*(?:test|exam|score|requirement|certificate)?\b", re.I),
     "ielts toefl english proficiency"),
    (re.compile(r"\benglish\s+(?:test|exam|score|result|requirement|certificate)\b", re.I),
     "ielts toefl english proficiency"),
    (re.compile(r"\blanguage\s+(?:test|exam|score|requirement|certificate|proof)\b", re.I),
     "ielts toefl topik language proficiency"),
    (re.compile(r"\bproof\s+of\s+english\b", re.I), "ielts toefl english proficiency"),
    (re.compile(r"\bmedium\s+of\s+instruction\b", re.I), "moi english proficiency"),
    (re.compile(r"\bmoi\b", re.I), "medium of instruction english proficiency"),
)

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9']*")


def normalize_token(token: str) -> str:
    """Canonical form of one word, or the word unchanged."""
    return _VARIANT_TO_CANONICAL.get(token.lower(), token)


def normalize_query(question: str) -> str:
    """
    The text retrieval should actually run on.

    Spelling variants are corrected in place; phrase meanings are appended.
    Returns the original unchanged when there is nothing to fix, so the common
    case costs nothing.
    """
    if not question:
        return ""

    corrected = _WORD_RE.sub(lambda m: normalize_token(m.group(0)), question)

    extras: list[str] = []
    for pattern, expansion in PHRASE_EXPANSIONS:
        if pattern.search(corrected):
            extras.extend(t for t in expansion.split() if t not in extras)

    if not extras:
        return corrected

    # Appended, not substituted: "do I need an english test" keeps its own
    # words and additionally matches threads that say "IELTS".
    lowered = corrected.lower()
    new_terms = [t for t in extras if t not in lowered]
    return f"{corrected} {' '.join(new_terms)}".strip() if new_terms else corrected


def was_normalized(question: str) -> bool:
    """True when normalisation actually changed the retrieval text."""
    return normalize_query(question) != (question or "")
