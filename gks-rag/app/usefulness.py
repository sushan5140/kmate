"""
Answer-level usefulness scoring for community evidence.

Retrieval ranks *clusters* by how well the cluster's question matches the
applicant's question. But a cluster is a WhatsApp thread, and a thread that asks
exactly the right question often contains mostly noise: "ok thanks", "Yup",
someone asking a follow-up question of their own, and a chunk of unrelated
chatter that happened to land nearby.

So relevance and usefulness are different axes, and this module supplies the
second one. It scores each *answer*, keeps only the ones that actually tell an
applicant something, and feeds the best answer's score back into the cluster's
ranking -- which is what lifts a thread containing "1 original + 3 photocopies
- Embassy Track" above one containing "This one".

Nothing here rewrites or merges answer text: an answer is either shown verbatim
or not shown. Fabricating a tidier combined answer would misrepresent what an
applicant actually reported.
"""

import re

from app.spam import is_promotional

# --- signals that an answer carries real information -------------------------

# Someone describing what they actually did or were told.
REPORTED_EXPERIENCE = re.compile(
    r"\b(?:i|we)\s+(?:did|got|submitted|sent|received|asked|called|emailed|used|applied|paid|went|contacted)\b"
    r"|\bmy (?:university|college|school|embassy|consulate|professor|principal|country)\b"
    r"|\bthey (?:said|told|asked|accepted|rejected|refused)\b"
    r"|\bin my case\b|\bwhen i\b|\bi was told\b|\bfor me it\b",
    re.I,
)

# A concrete instruction the applicant can act on.
CONCRETE_ACTION = re.compile(
    # Trailing \w* so inflections count: "requested", "submitting", "applied".
    r"\b(?:submit|send|sent|upload|attach|apostill|notariz|notaris|translat|"
    r"request|obtain|collect|contact|email|mail|call|visit|fill|print|sign|scan|"
    r"bring|brought|register|check|apply|appli)\w*",
    re.I,
)

# Points at an authority rather than a hunch.
SOURCE_REFERENCE = re.compile(
    r"\bguideline|\bniied\b|\bembassy\b|\bconsulate\b|\bofficial\b|\bstudy in korea\b"
    r"|\bwebsite\b|\bmofa\b|\bmea\b|\buniversity said\b|\bin the (?:pdf|form|guide)\b",
    re.I,
)

# Procedural specifics: counts, document names, levels.
SPECIFIC_DETAIL = re.compile(
    r"\b\d+\s*(?:copies|copy|sets?|originals?|photocopies|pages?|months?|years?|days?)\b"
    r"|\b(?:original|photocopy|photocopies|scanned|sealed|envelope|stamped|attested)\b"
    r"|\btopik\s*(?:level\s*)?\d|\bielts\b|\bform\s*\d+\b"
    r"|\b(?:embassy|university)\s+track\b",
    re.I,
)

# --- signals that an answer is not worth showing ------------------------------

HEDGE = re.compile(
    r"\b(?:probably|maybe|might be|i think|i guess|not sure|nt sure|idk|i dont know|i don't know"
    r"|afaik|possibly|perhaps|i believe|i assume|no idea)\b",
    re.I,
)

# Pure social filler / acknowledgements.
SOCIAL = re.compile(
    r"^(?:ok(?:ay)?|yes|yep|yup|no|nope|nah|sure|same|exactly|true|correct|right|thanks?|thank you|"
    r"ty|welcome|congrats|congratulations|good luck|hi|hii+|hello|hey|bro|lol|haha|great|nice|cool|"
    r"got it|noted|alright|hmm+|oh|ah|yeah|ya)\b[\s\W]*$",
    re.I,
)
GREETING = re.compile(
    r"^\s*(?:hi+|hello+|hey|greetings|good (?:morning|evening|afternoon))\b", re.I
)
SELF_INTRO = re.compile(r"\b(?:my name is|call me|i am from|i'm from)\b", re.I)

# A reply that is itself a question gives the applicant nothing.
# Explicit "I'm asking" markers -- these threads frequently omit the "?".
ASKING_MARKER = re.compile(
    r"(?:i have a (?:query|question|doubt)|i had a (?:query|question|doubt)"
    r"|does any\s?(?:one|body) know|can any\s?(?:one|body)|any\s?(?:one|body) (?:know|help|there)"
    r"|please tell me|pls tell|plz tell|kindly tell|help me out|need help|my question is"
    r"|i wanted to know|i want to know|wanted to ask|can someone)",
    re.I,
)

# An interrogative clause closing the message, e.g. "..can I use my marksheet
# instead..", which these chats often write without a question mark.
TRAILING_QUESTION = re.compile(
    r"\b(?:can|could|should|do|does|is|are|would|will)\s+(?:i|we|my|you)\b[^.?!]{0,80}[.?!…]*\s*$",
    re.I,
)

QUESTION_OPENER = re.compile(
    r"^\s*(?:can|could|do|does|did|is|are|was|were|will|would|should|has|have|"
    r"what|when|where|which|who|whom|why|how|any(?:one|body)|pls|please|"
    r"is there|are there|somebody|someone)\b",
    re.I,
)

# Below this, with no positive signal, there is nothing to read.
SHORT_CHARS = 25
# An answer this long is very unlikely to be filler.
SUBSTANTIAL_CHARS = 80

LABELS = ("useful", "partially_useful", "unsupported_guess", "too_vague", "irrelevant", "spam", "conflicting")


def _is_question_only(text: str) -> bool:
    """
    True when the reply asks something and asserts nothing.

    Applicants in these chats routinely ask without a question mark ("Guys I
    have a query I have my 10th class mark sheet.."), so a "?" is not required --
    an explicit asking marker counts too. A reply that answers *and then* asks a
    follow-up still counts as an answer.
    """
    t = (text or "").strip()
    asks = (
        "?" in t
        or bool(ASKING_MARKER.search(t))
        or bool(QUESTION_OPENER.match(t))
        # "...can I use my marksheet instead.." -- an interrogative clause closing
        # the message, typed without a question mark.
        or bool(TRAILING_QUESTION.search(t))
    )
    if not asks:
        return False

    # Strip the asking clause, then see whether anything declarative remains.
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\.{2,}", t) if s.strip()]
    informative = [
        s for s in sentences
        if not s.endswith("?")
        and len(s) > 25
        and not SOCIAL.match(s)
        and not ASKING_MARKER.search(s)
        and not QUESTION_OPENER.match(s)
    ]
    return not informative


def classify_answer(text: str, tag: str | None = None, query_concepts: frozenset = frozenset()) -> dict:
    """
    Returns {label, score, reasons} for one community answer.

    `score` is a ranking weight, not a probability: higher means more worth an
    applicant's attention.
    """
    from app.retriever import concepts_in  # local import avoids a cycle

    t = (text or "").strip()
    reasons: list[str] = []
    if not t:
        return {"label": "too_vague", "score": 0.0, "reasons": ["empty"]}

    score = 0.35
    has_experience = bool(REPORTED_EXPERIENCE.search(t))
    has_action = bool(CONCRETE_ACTION.search(t))
    has_source = bool(SOURCE_REFERENCE.search(t))
    has_detail = bool(SPECIFIC_DETAIL.search(t))

    if has_experience:
        score += 0.25
        reasons.append("reported experience")
    if has_action:
        score += 0.20
        reasons.append("concrete action")
    if has_source:
        score += 0.20
        reasons.append("cites a source")
    if has_detail:
        score += 0.15
        reasons.append("specific detail")
    if len(t) >= SUBSTANTIAL_CHARS:
        score += 0.10

    positives = sum([has_experience, has_action, has_source, has_detail])

    # --- disqualifiers --------------------------------------------------------
    # Checked before everything else: recruitment posts score *well* on the
    # signals above ("contact", "register", "3 slots", "2000 per month"), so
    # they have to be taken out on their own terms rather than out-scored.
    promotional, spam_reasons = is_promotional(t, has_experience=has_experience, has_source=has_source)
    if promotional:
        return {"label": "spam", "score": 0.0, "reasons": ["promotional/recruitment: " + ", ".join(spam_reasons)]}

    if SOCIAL.match(t) or SELF_INTRO.search(t) or (GREETING.match(t) and positives == 0):
        return {"label": "too_vague", "score": 0.0, "reasons": reasons + ["social filler"]}

    if _is_question_only(t):
        # Explicitly not an answer -- never present it as one.
        return {"label": "too_vague", "score": 0.0, "reasons": reasons + ["reply is a question, not an answer"]}

    if len(t) < SHORT_CHARS and positives == 0:
        return {"label": "too_vague", "score": 0.05, "reasons": reasons + ["too short to be actionable"]}

    # "I haven't received my transcript..can I use my marksheet instead.." -- the
    # writer describes their own situation and then asks. Describing a problem is
    # not answering it, so unless the reply also gives an action, a source or a
    # concrete detail, it is another applicant asking, not experience to learn from.
    if TRAILING_QUESTION.search(t) and not (has_action or has_source or has_detail):
        return {"label": "too_vague", "score": 0.0,
                "reasons": reasons + ["reply is a question, not an answer"]}

    # Off-topic reply that happened to sit in a relevant thread.
    if query_concepts:
        overlap = query_concepts & concepts_in(t)
        if not overlap:
            score -= 0.30
            reasons.append("no shared topic with the question")
            # One incidental verb match is not enough to carry an off-topic reply.
            # "I'll take a knife and force him to sign" trips the action pattern
            # while sharing no topic with the question -- that is chatter, not
            # experience. Two independent signals are required to override.
            if positives <= 1:
                return {"label": "irrelevant", "score": 0.0, "reasons": reasons}

    # Still asks something at the end, even though it also states a fact. That is
    # weaker than a clean answer, so rank it below one rather than dropping it --
    # the factual half may be the only report we have.
    if TRAILING_QUESTION.search(t) or t.rstrip().endswith("?"):
        score -= 0.15
        reasons.append("ends with a question")

    if HEDGE.search(t) or (tag or "") == "uncertain":
        score -= 0.35
        reasons.append("hedged / unverified")
        return {"label": "unsupported_guess", "score": max(score, 0.05), "reasons": reasons}

    if positives >= 2 and len(t) >= 40:
        label = "useful"
    elif positives >= 1 and len(t) >= 30:
        label = "partially_useful"
    else:
        label = "too_vague"
        score = min(score, 0.20)

    return {"label": label, "score": round(max(score, 0.0), 3), "reasons": reasons}


# Labels that may be shown to an applicant, best first.
SHOWABLE = ("useful", "partially_useful")


def select_answers(answers: list[dict], query_concepts: frozenset, limit: int = 3) -> tuple[list[dict], float]:
    """
    Picks the strongest answers from one cluster.

    Returns (selected, best_score). `selected` entries carry `usefulness` and
    `usefulness_reasons` so the audit and the debug view can show why an answer
    was chosen. An empty list means the thread matched the question but had
    nothing worth reading.
    """
    scored = []
    for a in answers or []:
        verdict = classify_answer(a.get("text", ""), a.get("tag"), query_concepts)
        scored.append({**a, "usefulness": verdict["label"],
                       "usefulness_score": verdict["score"],
                       "usefulness_reasons": verdict["reasons"]})

    # Promotion is dropped outright, never ranked lower and never used as a
    # fallback: showing an advert because a thread had nothing else is worse
    # than showing nothing at all.
    scored = [a for a in scored if a["usefulness"] != "spam"]

    showable = [a for a in scored if a["usefulness"] in SHOWABLE]
    if not showable:
        # Nothing solid: a single clearly-marked hedge is better than an empty
        # section, but only one, and only if it is on-topic.
        guesses = [a for a in scored if a["usefulness"] == "unsupported_guess"]
        showable = sorted(guesses, key=lambda a: -a["usefulness_score"])[:1]

    showable.sort(key=lambda a: (-a["usefulness_score"], -len(a.get("text") or "")))
    selected = showable[:limit]
    best = selected[0]["usefulness_score"] if selected else 0.0
    return selected, best


# --- conflict detection -------------------------------------------------------

# A conflict is a disagreement about whether something is REQUIRED -- not merely
# the presence of the word "not" somewhere in the text. Comparing bare negation
# across a blob of concatenated official chunks fires on almost everything, and
# a false "your sources disagree" warning is worse than staying quiet.
REQUIRED_RE = re.compile(
    r"\b(?:must|required|require|shall|has to|have to|need to|mandatory|compulsory|obligatory)\b", re.I
)
NOT_REQUIRED_RE = re.compile(
    r"\b(?:no need|not need|not required|not necessary|don'?t need|doesn'?t need|do not need|"
    r"not mandatory|isn'?t required|aren'?t required|without (?:an? )?(?:apostille|attestation))\b",
    re.I,
)


def _requirement_polarity(text: str) -> int:
    """+1 = says it is required, -1 = says it is not, 0 = says neither."""
    t = text or ""
    if NOT_REQUIRED_RE.search(t):
        return -1
    if REQUIRED_RE.search(t):
        return 1
    return 0


def _sentences_about(text: str, concepts: frozenset) -> list[str]:
    """Sentences of `text` that touch any of `concepts`."""
    from app.retriever import concepts_in

    out = []
    for s in re.split(r"(?<=[.!?])\s+|\n+", text or ""):
        if s.strip() and (concepts_in(s) & concepts):
            out.append(s)
    return out


def detect_conflicts(selected: list[dict], official: list[dict], query_concepts: frozenset) -> dict:
    """
    Flags where community reports disagree with each other, or contradict the
    official text on the same concept.

    Deliberately conservative -- it reports *possible* disagreement so the answer
    can say "applicants reported mixed experiences" and defer to the guideline.
    It never tries to decide who is right.
    """
    from app.retriever import concepts_in

    # Only replies that actually take a position on whether something is required
    # can disagree. Everything else is just discussion.
    stances = []
    for a in selected:
        for s in _sentences_about(a.get("text", ""), query_concepts) or [a.get("text", "")]:
            pol = _requirement_polarity(s)
            if pol:
                stances.append(pol)
                break
    internal = len(set(stances)) > 1

    # Establish the guideline's own stance first, and only compare against it when
    # it is unambiguous. These guidelines legitimately say "must be apostilled" for
    # required certificates and "no need" for converted/supplementary ones, and the
    # appendix FAQ contains interrogative headings ("Can I submit ... without
    # apostille?") that read as a stance but are questions. Claiming the community
    # contradicts a guideline that says both would be a false alarm.
    official_stances: set[int] = set()
    shared_all: set[str] = set()
    for o in official or []:
        claim = o.get("claim") or ""
        shared = query_concepts & concepts_in(claim)
        if not shared:
            continue
        for s in _sentences_about(claim, shared):
            if s.strip().endswith("?"):
                continue  # an FAQ question, not a rule
            pol = _requirement_polarity(s)
            if pol:
                official_stances.add(pol)
                shared_all |= shared

    against_official = False
    if len(official_stances) == 1 and shared_all:
        off_pol = next(iter(official_stances))
        for a in selected:
            for cs in _sentences_about(a.get("text", ""), frozenset(shared_all)):
                if cs.strip().endswith("?"):
                    continue
                com_pol = _requirement_polarity(cs)
                if com_pol and com_pol != off_pol:
                    against_official = True
                    break
            if against_official:
                break

    return {"community_internal": internal, "against_official": against_official}
