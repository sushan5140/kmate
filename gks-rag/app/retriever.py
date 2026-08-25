
import difflib
import gzip
import hashlib
import json
import re
import joblib
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from app.sanitize import clean_answers, clean_text
from app.official_text import clean_official_text
from app.query_normalize import normalize_query
from app.usefulness import select_answers
from app.settings import (
    CATEGORY_BOOST,
    COMMUNITY_ANSWERS_PER_CASE,
    COMMUNITY_RERANK_POOL,
    COMMUNITY_USEFULNESS_WEIGHT,
    COMMUNITY_MIN_SCORE,
    COMMUNITY_RELATIVE_FLOOR,
    COMMUNITY_REQUIRE_CONCEPT,
    COMMUNITY_PROGRAM_MATCH_BOOST,
    COMMUNITY_PROGRAM_MISMATCH_PENALTY,
    COMMUNITY_PROGRAM_MIXED_BOOST,
    INDEX_DIR,
    KEY_TERM_BOOST,
    OFFICIAL_MIN_SCORE,
    OFFICIAL_REQUIRE_CONCEPT,
)

CATEGORY_RULES = [
    ("transcript", r"\btranscript|marksheet|mark sheet|academic record\b"),
    ("recommendation_letters", r"\brecommend|lor\b|letter of recommendation"),
    ("apostille_authentication", r"\bapostille|authentication|notary|notar|legaliz|attest"),
    ("gpa_conversion", r"\bgpa|cgpa|percentage|percent|scholaro|grade conversion|convert.*grade"),
    ("embassy_vs_university_track", r"\bembassy track|university track|embassy vs|uni track|uic\b"),
    ("application_forms_essays", r"\bform\s*\d|application form|personal statement|\bps\b|study plan|\bsp\b"),
    ("eligibility", r"\beligib|age limit|\bcitizen|nationalit|expected graduation|\bdisqualif|\brestriction"),
    ("language_topik_ielts", r"\btopik|ielts|toefl|language certificate|english proficiency"),
    ("interview", r"\binterview|round\s*2|second round"),
    ("deadlines", r"\bdeadline|last date|submission date|application period"),
    ("documents_general", r"\bdocument|certificate|stamp|seal|signature|signed|original|photocopy|translation"),
]

# Narrow, high-signal concepts used for lexical anchoring on top of TF-IDF.
#
# TF-IDF alone lets a chunk score well on generic overlap ("document",
# "university", "application"), which is how loosely-related official text used
# to surface. These are the terms that actually decide whether a chunk answers
# the question, so a record only gets the boost when it genuinely covers the
# same concept the question raises -- and, for official evidence, covering none
# of them disqualifies the chunk outright (see search()).
KEY_CONCEPTS = {
    "apostille": r"apostill|consular confirm|consular-confirm|legaliz|authenticat|notari",
    "transcript": r"transcript|marksheet|mark sheet|academic record",
    "recommendation": r"recommend|\blor\b|referee|recommender",
    "sealed": r"seal(ed|ing)?\b|envelope",
    # Deliberately NOT bare "signature": every form carries "applicant's original
    # handwritten signature", which is a different thing from a school stamping or
    # signing a document to authenticate it. Conflating them made the assistant
    # claim the guideline covered school stamps when it does not.
    "stamp_signature": r"\bstamp|\bseal\b|school'?s?\s+(?:stamp|sign)|officially\s+(?:stamped|signed)|\battest",
    "graduation_certificate": r"graduation certificate|diploma|degree certificate|certificate of (expected )?graduation|\bgraduat",
    # "select" is only about choosing a university when a university/department is
    # nearby -- otherwise it matches "newly selected scholars", "successful
    # candidates are selected", and similar text found all over the guidelines.
    "university_choice": r"\bchoose|\bchoice|\bpick\b|\bselect\w*[^.]{0,40}(?:universit|department)|how many universit|up to (two|three|one)|number of universit|\bdepartment|\btype [ab]\b|\buni\b",
    "embassy_track": r"embassy track|\bembassy\b",
    "university_track": r"university track|\btrack\b",
    "form_number": r"\bform\s*\d+",
    "document_count": r"number of documents|set(s)? of|photocop|\bcopies\b|\bcopy\b|original document",
    "language_test": r"topik|ielts|toefl|english proficiency|language certificate",
    "gpa": r"\bgpa\b|\bcgpa\b|grading system|grade conversion",
    "deadline": r"deadline|submission date|application period|due date",
    "eligibility": r"eligib|age limit|under \d\d years|\d\d years old|\bcitizen|nationalit|\bdisqualif|\brestriction",
    "previous_scholarship": r"former gks|previous(ly)? (received|gks)|apply again|re-?apply|cancell?ation of scholarship",
    "selection_round": r"\bround\b|first round|second round|shortlist|selection result",
    "medical": r"medical assessment|health",
    "personal_statement": r"personal statement|study plan|research proposal",
    "interview": r"\binterview\b",
}

# Plain-English names, used when telling the user which part of their question
# the selected guideline does not appear to address.
CONCEPT_LABELS = {
    "apostille": "an apostille / consular confirmation requirement",
    "transcript": "transcript requirements",
    "recommendation": "recommendation letter requirements",
    "sealed": "a sealed-envelope requirement",
    "stamp_signature": "a school stamp or signature requirement",
    "graduation_certificate": "graduation certificate requirements",
    "university_choice": "how many universities you may choose",
    "embassy_track": "Embassy Track rules",
    "university_track": "University Track rules",
    "form_number": "application form / signature requirements",
    "document_count": "how many document sets or copies are needed",
    "language_test": "TOPIK / English test requirements",
    "gpa": "GPA requirements",
    "deadline": "the deadline",
    "eligibility": "eligibility rules",
    "previous_scholarship": "rules for former GKS scholars re-applying",
    "medical": "the medical assessment",
    "personal_statement": "personal statement / study plan requirements",
    "interview": "interview rules",
}

# Identifies the concept ruleset a prebuilt index was computed against. If the
# patterns below change without a rebuild, the stored concepts are stale and the
# loader recomputes rather than silently serving them.
CONCEPTS_FINGERPRINT = hashlib.sha256(
    json.dumps(KEY_CONCEPTS, sort_keys=True).encode("utf-8")
).hexdigest()[:16]

_CATEGORY_RES = [(c, re.compile(p, re.I)) for c, p in CATEGORY_RULES]
_CONCEPT_RES = [(c, re.compile(p, re.I)) for c, p in KEY_CONCEPTS.items()]


# Function words carry no topic. Includes the Hinglish fillers applicants type
# ("kya hai", "chalega", "sakta hu"), so those don't read as content on their own.
_FUNCTION_WORDS = {
    "i", "me", "my", "mine", "we", "our", "you", "your", "it", "its", "this", "that", "these", "those",
    "is", "am", "are", "was", "were", "be", "been", "being", "do", "does", "did", "done",
    "can", "could", "should", "would", "will", "shall", "may", "might", "must", "need",
    "have", "has", "had", "the", "a", "an", "and", "or", "but", "so", "then", "if", "not", "no",
    "what", "when", "where", "which", "who", "whom", "whose", "how", "why",
    "to", "for", "of", "in", "on", "at", "by", "with", "about", "from", "as", "too", "also",
    "ok", "okay", "yes", "please", "plz", "pls", "help", "thanks", "thank", "hi", "hello", "hey",
    "bro", "sir", "maam", "guys", "anyone", "someone", "any", "some", "all", "know", "tell",
    "kya", "hai", "ho", "hu", "hun", "kar", "karna", "karo", "sakta", "sakti", "sakte", "sakoon",
    "mujhe", "mera", "meri", "mere", "aur", "bhi", "ka", "ki", "ke", "se", "me", "mein", "par",
    "nahi", "haan", "chahiye", "batao", "hoga", "hogi",
}


def content_words(question: str) -> list[str]:
    words = re.findall(r"[a-z0-9']+", (question or "").lower())
    return [w for w in words if w not in _FUNCTION_WORDS and len(w) > 2]


# Spellings applicants actually type, mapped to the concept they mean. Used for
# fuzzy-matching the QUESTION only -- never the indexed records, which are
# correctly spelled and would make the fuzzy pass needlessly expensive.
CONCEPT_KEYWORDS = {
    "apostille": ["apostille", "apostilled", "consular", "legalization", "notarized", "notary", "authentication"],
    "transcript": ["transcript", "transcripts", "marksheet", "marksheets"],
    "recommendation": ["recommendation", "recommender", "referee"],
    "sealed": ["sealed", "envelope"],
    "stamp_signature": ["stamp", "stamped"],
    "graduation_certificate": ["graduation", "graduate", "graduated", "diploma", "certificate"],
    "university_choice": ["department", "choose", "choice", "select", "pick"],
    "form_number": ["form", "forms", "signature", "signed", "handwritten"],
    "embassy_track": ["embassy"],
    "university_track": ["track"],
    "document_count": ["photocopy", "photocopies", "copies", "original", "originals"],
    "language_test": ["topik", "ielts", "toefl", "proficiency"],
    "gpa": ["gpa", "cgpa", "grades", "percentage"],
    "deadline": ["deadline", "deadlines", "submission"],
    "eligibility": ["eligible", "eligibility", "citizenship", "nationality"],
    "medical": ["medical"],
    "personal_statement": ["statement", "study", "plan", "proposal"],
    "interview": ["interview"],
    "previous_scholarship": ["reapply"],
}
_KEYWORD_TO_CONCEPT = {kw: concept for concept, kws in CONCEPT_KEYWORDS.items() for kw in kws}
# 0.85 keeps "transcirpt"->transcript and "topick"->topik while refusing loose
# pairs; below ~0.8 unrelated short words start colliding.
_FUZZY_CUTOFF = 0.85


def query_concepts(question: str) -> frozenset:
    """
    Concepts a question raises, tolerant of the spelling applicants actually use.

    The regex pass alone made the official-evidence gate brittle: "aposttile
    needed for trancript?" is a perfectly clear question, but no pattern matched
    it, so it scored below threshold and came back as "verification pending".
    Misspelling a word should not be treated the same as being off-topic.
    """
    found = set(concepts_in(question))
    for word in content_words(question):
        concept = _KEYWORD_TO_CONCEPT.get(word)
        if concept:
            found.add(concept)
            continue
        close = difflib.get_close_matches(word, _KEYWORD_TO_CONCEPT.keys(), n=1, cutoff=_FUZZY_CUTOFF)
        if close:
            found.add(_KEYWORD_TO_CONCEPT[close[0]])
    return frozenset(found)


def clarification_for(question: str) -> str | None:
    """
    One short clarifying question when the input carries no topic at all
    ("can i do this?", "and then?", "help").

    Deliberately keyed on the absence of *content*, not on length: "ielts
    accepted?" is three words but perfectly answerable, while "what about mine"
    is three words and answerable only by guessing. Guessing here would mean
    retrieving arbitrary evidence and presenting it with full confidence, which
    is the failure mode this exists to prevent.
    """
    q = (question or "").strip()
    if not q:
        return "What would you like to know about the GKS application?"
    if query_concepts(q) or infer_category(q) or content_words(q):
        return None
    return (
        "Could you give a bit more detail — which part of the application do you mean "
        "(documents, deadlines, eligibility, or university choice)?"
    )


def coverage(question: str, official_results: list[dict]) -> dict:
    """
    Which concepts the question raises, and which the retrieved official text
    actually speaks to.

    Retrieval is topical, so asking "does my transcript need a school stamp?"
    reliably surfaces transcript rules whether or not the guideline says
    anything about stamps. Reporting the gap lets the answer say the guideline
    doesn't appear to state it, instead of letting topical similarity read as
    an official requirement.
    """
    asked = query_concepts(question)
    covered = set()
    for r in official_results:
        covered |= concepts_in(r.get("claim") or "")
    unsupported = sorted(asked - covered)
    return {
        "question_concepts": sorted(asked),
        "covered": sorted(asked & covered),
        "unsupported": unsupported,
        "unsupported_labels": [CONCEPT_LABELS.get(c, c.replace("_", " ")) for c in unsupported],
    }


def infer_category(query: str):
    for cat, pat in _CATEGORY_RES:
        if pat.search(query):
            return cat
    return None


def concepts_in(text: str) -> frozenset:
    if not text:
        return frozenset()
    return frozenset(name for name, pat in _CONCEPT_RES if pat.search(text))


def _record_blob(rec) -> str:
    if rec.get("_layer") == "official":
        return rec.get("claim") or rec.get("text") or ""
    parts = [rec.get("canonical_question", "")]
    parts.extend(rec.get("question_variants", [])[:10])
    parts.extend(a.get("text", "") for a in rec.get("answers", [])[:6])
    return " ".join(parts)


def _load_record_concepts(records: list[dict]) -> list[frozenset]:
    path = INDEX_DIR / "record_concepts.json.gz"
    if path.exists():
        try:
            with gzip.open(path, "rt", encoding="utf-8") as f:
                payload = json.load(f)
            if (
                payload.get("fingerprint") == CONCEPTS_FINGERPRINT
                and len(payload.get("concepts", [])) == len(records)
            ):
                return [frozenset(c) for c in payload["concepts"]]
        except (OSError, ValueError, KeyError):
            pass  # fall through and recompute
    return [concepts_in(_record_blob(r)) for r in records]


def _load_records() -> list[dict]:
    """Reads the gzipped records file, falling back to a legacy plain one."""
    gz = INDEX_DIR / "records.json.gz"
    if gz.exists():
        with gzip.open(gz, "rt", encoding="utf-8") as f:
            return json.load(f)
    return json.loads((INDEX_DIR / "records.json").read_text(encoding="utf-8"))


class Retriever:
    def __init__(self):
        self.q_word_vec = joblib.load(INDEX_DIR / "q_word_vectorizer.joblib")
        self.q_char_vec = joblib.load(INDEX_DIR / "q_char_vectorizer.joblib")
        self.a_word_vec = joblib.load(INDEX_DIR / "a_word_vectorizer.joblib")
        self.q_word = joblib.load(INDEX_DIR / "q_word_matrix.joblib")
        self.q_char = joblib.load(INDEX_DIR / "q_char_matrix.joblib")
        self.a_word = joblib.load(INDEX_DIR / "a_word_matrix.joblib")
        self.records = _load_records()

        # Concept extraction over every record costs ~15 s for this corpus, which
        # was the bulk of cold-start time when it ran per process. It depends only
        # on the records and the concept patterns, so it is computed at build time
        # and loaded here; the fingerprint check falls back to recomputing if the
        # patterns changed without a rebuild.
        self.record_concepts = _load_record_concepts(self.records)
        self.record_categories = [r.get("category") for r in self.records]
        self.record_layers = [r.get("_layer") for r in self.records]
        self.record_programs = [r.get("program") for r in self.records]

    def search(self, query: str, top_k: int = 6, layer: str | None = None, program: str | None = None):
        """
        `program` ("UG" or "G") only ever restricts the *official* layer --
        community records aren't tagged by program (the WhatsApp dataset
        predates that distinction), so community search stays global. Official
        evidence for the other program is excluded before ranking, never merely
        ranked lower: the two programs' rules must never sit side by side as if
        both were "the" official answer.
        """
        # Retrieval runs on the normalised text ("ietls" -> "ielts", "english
        # test" -> also "ielts toefl"); the caller keeps the original for
        # display. Without this the concept gate below never engages on a
        # misspelling, which is how "ietls" returned apostille threads.
        query = normalize_query(query)

        qw = self.q_word_vec.transform([query])
        qc = self.q_char_vec.transform([query])
        aw = self.a_word_vec.transform([query])

        # Questions matter most; answers only lightly influence retrieval.
        scores = (
            0.58 * cosine_similarity(qw, self.q_word).ravel()
            + 0.32 * cosine_similarity(qc, self.q_char).ravel()
            + 0.10 * cosine_similarity(aw, self.a_word).ravel()
        )

        inferred = infer_category(query)
        q_concepts = query_concepts(query)
        is_official = layer == "official"

        # Restrict to the candidate pool first so boosts and thresholds are
        # only ever computed against records that are actually eligible.
        candidate_idx = [
            i
            for i in range(len(self.records))
            if (layer is None or self.record_layers[i] == layer)
            and not (is_official and program and self.record_programs[i] != program)
        ]

        boosted = []
        for i in candidate_idx:
            score = float(scores[i])
            overlap = q_concepts & self.record_concepts[i]

            if inferred and self.record_categories[i] == inferred:
                score += CATEGORY_BOOST
            if q_concepts:
                score += KEY_TERM_BOOST * (len(overlap) / len(q_concepts))

            if is_official:
                if score < OFFICIAL_MIN_SCORE:
                    continue
                # Naming specific concepts and matching none of them means the
                # chunk is off-topic however well it scores lexically. Better to
                # return nothing (-> "Official verification pending") than to
                # present unrelated text under an authoritative heading.
                if OFFICIAL_REQUIRE_CONCEPT and q_concepts and not overlap:
                    continue
            else:
                # Preference, not a filter -- see the settings comment.
                if program:
                    rec_program = self.record_programs[i] or "unknown"
                    if rec_program == program:
                        score += COMMUNITY_PROGRAM_MATCH_BOOST
                    elif rec_program == "mixed":
                        score += COMMUNITY_PROGRAM_MIXED_BOOST
                    elif rec_program != "unknown":
                        score -= COMMUNITY_PROGRAM_MISMATCH_PENALTY
                if score < COMMUNITY_MIN_SCORE:
                    continue
                # Topic gate, mirroring the official layer. A thread that
                # shares no concept with a focused question is off-topic
                # however well it scores lexically -- this is what stopped
                # "ielts" returning transcript and apostille threads that
                # merely used similar conversational wording.
                if COMMUNITY_REQUIRE_CONCEPT and q_concepts and not overlap:
                    continue

            boosted.append((score, i))

        boosted.sort(key=lambda t: (-t[0], t[1]))

        if is_official:
            return [self._format(self.records[i], s) for s, i in boosted[:top_k]]

        # Community: re-rank the top candidates by how useful their best reply
        # actually is, and drop threads where nothing survives selection. Only a
        # pool is re-ranked -- scoring every record's answers per query would be
        # far too slow for no benefit, since low-relevance threads cannot win.
        reranked = []
        for base_score, i in boosted[: max(top_k, COMMUNITY_RERANK_POOL)]:
            rec = self.records[i]
            selected, best = select_answers(
                rec.get("answers", []), q_concepts, limit=COMMUNITY_ANSWERS_PER_CASE
            )
            if not selected:
                continue  # thread matched the question but says nothing usable

            # Ranking priority, in the order it is applied below:
            #   1. how much of the asked topic this thread actually covers
            #   2. whether it is the applicant's own GKS program
            #   3. how useful its best reply is (first-hand experience, sources)
            #   4. lexical similarity, as the final tie-break only
            # Conversational similarity therefore cannot outrank topic match --
            # which was the whole failure: threads full of generic GKS chatter
            # scored well against short questions like "ielts".
            overlap = q_concepts & self.record_concepts[i]
            topic = len(overlap) / len(q_concepts) if q_concepts else 0.0
            rec_program = self.record_programs[i] or "unknown"
            program_match = 1.0 if (program and rec_program == program) else (
                0.5 if rec_program == "mixed" else 0.0
            )
            combined = base_score + COMMUNITY_USEFULNESS_WEIGHT * best
            reranked.append((topic, program_match, best, combined, base_score, i, selected))

        if not reranked:
            return []

        reranked.sort(key=lambda t: (-t[0], -t[1], -t[2], -t[3], t[5]))

        # Relative floor: once the best match is known, anything far below it is
        # padding. Showing two strong experiences beats showing six where four
        # are only loosely on topic.
        best_relevance = max(t[4] for t in reranked)
        floor = best_relevance * COMMUNITY_RELATIVE_FLOOR
        kept = [t for t in reranked if t[4] >= floor]

        return [
            self._format(self.records[i], combined, selected_answers=sel)
            for _t, _p, _b, combined, _base, i, sel in kept[:top_k]
        ]

    @staticmethod
    def _format(rec, score, selected_answers=None):
        if rec.get("_layer") == "official":
            return {
                "layer": "official",
                "score": round(score, 4),
                "program": rec.get("program"),
                "cycle": rec.get("cycle"),
                "category": rec.get("category"),
                # Display-only: PDF bullet furniture and font-private glyphs are
                # stripped here, on the way out. The indexed chunk and the
                # citation below it are left exactly as ingested.
                "claim": clean_official_text(rec.get("claim") or rec.get("text")),
                "source_title": rec.get("source_title"),
                "source_url": rec.get("source_url"),
                "source_file": rec.get("source_file"),
                "page": rec.get("page"),
                "content_type": rec.get("content_type"),
                "extraction_quality": rec.get("extraction_quality", "clean"),
            }

        # Defensive second pass: an index built before the sanitizer existed (or
        # any future corpus refresh that misses a noise shape) must still not be
        # able to leak chat metadata into the UI.
        source = selected_answers if selected_answers is not None else clean_answers(rec.get("answers", []))[:5]
        answers = [{
            "text": a.get("text", ""),
            "tag": a.get("tag", "community_answer"),
            "quality_score": a.get("score"),
            "usefulness": a.get("usefulness"),
            "usefulness_reasons": a.get("usefulness_reasons", []),
            # Stable per-contributor pseudonym assigned at ingestion (the raw
            # identity never entered the corpus). KMate maps it to a display
            # alias so the same contributor reads as the same person across
            # answers; it is not, and must not be shown as, a real name.
            "sender_alias": a.get("sender_alias"),
        } for a in clean_answers(source)]

        return {
            "layer": "community",
            "score": round(score, 4),
            "cluster_id": rec.get("cluster_id"),
            "program": rec.get("program", "unknown"),
            "program_basis": rec.get("program_basis"),
            "category": rec.get("category"),
            "question": clean_text(rec.get("canonical_question")),
            "variant_count": rec.get("variant_count", 1),
            "source_group_count": rec.get("source_group_count", 1),
            "answer_confidence": rec.get("answer_confidence", "low"),
            "possible_conflict": rec.get("possible_conflict", False),
            "answers": answers,
        }
