"""
Builds the FAQ Trends seed from the community corpus.

The corpus already ships clusters, but they are far too fine-grained to be FAQ
topics: 5,896 of 6,062 have a variant_count of 1, because that clustering was
tuned to keep a question attached to *its own* answers for retrieval. "Is IELTS
mandatory?", "Do we need IELTS?" and "ielts required or not??" are three
separate retrieval clusters and one FAQ topic.

So this does a second, coarser pass and groups questions into topics an
applicant would recognise as "the same question".

Method, in order:

  1. Harvest question-like messages from BOTH streams -- the clusters'
     canonical questions and their variants, and the answer stream, where a
     large share of the questions in a group chat actually live.
  2. Drop promotional posts (same detector the answer ranking uses) and
     anything still carrying an identity.
  3. Bucket by the applicant-facing taxonomy below. Questions that match no
     topic are dropped rather than filed under "General": inspection showed
     that bucket is conversational noise ("Are u applying for graduate
     studies?"), not anything an FAQ page should rank.
  4. Inside each bucket, greedy nearest-centroid clustering on TF-IDF cosine
     similarity. Greedy rather than agglomerative because the pairwise matrix
     does not fit in memory at this size and buys nothing here.
  5. Pick one representative per cluster: closest to the centroid, preferring
     a clean, properly-punctuated phrasing of readable length.

Output is a JSON seed containing only question text, a topic label and a
count. No sender aliases, no answers, no raw messages.

    python -m app.build_faq_topics
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.sanitize import clean_text  # noqa: E402
from app.spam import is_promotional  # noqa: E402
from app.usefulness import _is_question_only  # noqa: E402

CORPUS = Path(__file__).resolve().parents[1] / "data" / "community" / "community_knowledge.jsonl"
OUT = Path(__file__).resolve().parents[1] / "data" / "community" / "faq_topics.json"

# How close two questions must be to count as the same FAQ topic. Measured:
# 0.40 leaves obvious rephrasings apart, 0.15 starts merging distinct
# questions that merely share vocabulary.
SIMILARITY = 0.26
# Below this a "topic" is one person asking once, which is not a trend.
MIN_ASKS = 2

MIN_CHARS = 15
MAX_CHARS = 160

QUESTION_OPENER = re.compile(
    r"^\s*(?:can|could|do|does|did|is|are|was|were|will|would|should|has|have|"
    r"what|when|where|which|who|whom|why|how|any(?:one|body)|whats|what's)\b",
    re.I,
)
ASKING_MARKER = re.compile(
    r"\b(?:i have a (?:query|question|doubt)|does any\s?(?:one|body) know|"
    r"can any\s?(?:one|body)|any\s?(?:one|body) (?:know|help)|please tell|pls tell|"
    r"i wanted to know|i want to know|wanted to ask|can someone|is it possible)\b",
    re.I,
)
JUNK = re.compile(r"^(?:\W|\d)+$|^(?:ok|okay|yes|no|hi+|hello|thanks?|guys|bro)\b", re.I)

# Peer chat, not an FAQ. These are applicants asking *each other* about their
# own situation -- "What's your major?", "You have topik 4?", "Are u applying
# through embassy?" -- which dominated the first build's top results. The
# generic "do you need X" / "can you apply X" forms are deliberately NOT
# matched here, because those are real process questions.
PEER_QUESTION = re.compile(
    r"\byour\b|\bur\b|\byours\b"
    r"|\b(?:are|were|r)\s+(?:you|u)\b"
    r"|^\s*(?:you|u)\s+(?:have|got|are|applied|applying)\b"
    r"|\bdo\s+(?:you|u)\s+have\b"
    r"|\b(?:did|will|would|have|has)\s+(?:you|u)\b"
    r"|\banyone\s+here\b|\banybody\s+here\b|\beveryone\s+already\b"
    r"|^\s*which\s+(?:one|uni|university)\s*\?*\s*$",
    re.I,
)

# A representative has to read as a question about the *process*, because it
# is shown to applicants as the canonical phrasing of an FAQ. Centrality alone
# picked things like "Two high school certificates?" -- topical, but not a
# question anyone would recognise as theirs.
WELL_FORMED = re.compile(
    r"^\s*(?:can|could|do|does|is|are|should|will|would|what|when|where|which|who|why|how)\b"
    r"|\b(?:do|can|should)\s+(?:i|we)\b"
    r"|\bhow\s+(?:many|much|long|do|to)\b"
    r"|\bis\s+it\s+(?:possible|necessary|mandatory|required|ok)\b",
    re.I,
)

# Social wishes that happen to end in a question mark.
SOCIAL_TAIL = re.compile(r"\bi wish\b|\bcongrat|\bgood luck\b|\ball the best\b", re.I)

# A question shorter than this carries no meaning standing alone ("University
# track?", "Personal statement?") and would read as a broken FAQ entry.
MIN_MEANINGFUL = 24

# Belt and braces on top of sanitize.clean_text: anything that still looks like
# it names a person never becomes a public FAQ question.
IDENTITY = re.compile(r"@|[⁦-⁩]|(?<![\w])~\s*[A-Za-z]")

# The applicant-facing taxonomy. Order matters -- specific labels sit above
# the generic "Documents", and the first match wins.
TOPIC_RULES: list[tuple[str, re.Pattern]] = [
    ("IELTS", re.compile(r"\bielts\b|\btoefl\b|english proficiency|medium of instruction|\bmoi\b", re.I)),
    ("TOPIK", re.compile(r"\btopik\b|korean language (?:test|exam|level|program)", re.I)),
    ("Apostille", re.compile(r"apostill|consular|legaliz|notari|attest|authenticat", re.I)),
    ("Recommendation letters", re.compile(r"recommend|\blor\b|referee|recommender", re.I)),
    ("GPA", re.compile(r"\bgpa\b|\bcgpa\b|percentage|grade convers|scholaro|grading system|\bmarks\b", re.I)),
    ("Passport", re.compile(r"\bpassport\b", re.I)),
    ("Embassy track", re.compile(r"embassy track|\bembassy\b|\bconsulate\b", re.I)),
    ("University track", re.compile(r"university track|how many universit|which universit|choose.{0,20}universit|\bmajor\b", re.I)),
    ("Eligibility", re.compile(r"eligib|age limit|\bcitizen|nationalit|\bdisqualif|study gap|\bgap year", re.I)),
    ("Timeline", re.compile(r"deadline|last date|application period|when (?:does|do|is|will|can)|result|announce", re.I)),
    ("Transcript", re.compile(r"transcript|marksheet|mark sheet|academic record", re.I)),
    ("Application forms", re.compile(r"\bform\s*\d|personal statement|study plan|self.?introduc|\bessay\b|\bsop\b", re.I)),
    ("Interview", re.compile(r"\binterview\b", re.I)),
    ("Scholarship benefits", re.compile(r"stipend|allowance|tuition fee|monthly|airfare|settlement|how much.{0,20}(?:money|paid|get)", re.I)),
    ("Documents", re.compile(r"document|certificate|\bseal|\bstamp|translat|photocop|\bcopy\b|birth cert|\bnotarized\b", re.I)),
]


def looks_like_a_question(text: str) -> bool:
    t = (text or "").strip()
    if not (MIN_CHARS <= len(t) <= MAX_CHARS):
        return False
    if JUNK.match(t) or IDENTITY.search(t):
        return False
    if len(t) < MIN_MEANINGFUL:
        return False
    if PEER_QUESTION.search(t) or SOCIAL_TAIL.search(t):
        return False
    return bool("?" in t or QUESTION_OPENER.match(t) or ASKING_MARKER.search(t))


def topic_label(text: str) -> str | None:
    for label, pattern in TOPIC_RULES:
        if pattern.search(text):
            return label
    return None


def tidy(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    t = re.sub(r"^[^\w'\"(]+", "", t)
    t = re.sub(r"[\s?!.]+$", "", t)
    if not t:
        return ""
    return t[0].upper() + t[1:] + "?"


def collect_questions() -> list[dict]:
    """
    Every question-like message in the corpus, from both streams.

    Answers are only taken when they ask and assert nothing -- an answer that
    resolves a question and then asks a follow-up is an answer, not an FAQ.
    """
    out: list[dict] = []
    seen: set[str] = set()
    for line in CORPUS.open(encoding="utf-8"):
        rec = json.loads(line)
        program = rec.get("program") or "unknown"

        candidates = [(clean_text(q), False) for q in
                      [rec.get("canonical_question"), *(rec.get("question_variants") or [])]]
        candidates += [(clean_text(a.get("text")), True) for a in rec.get("answers") or []]

        for text, from_answer in candidates:
            if not looks_like_a_question(text):
                continue
            if from_answer and not _is_question_only(text):
                continue
            if is_promotional(text)[0]:
                continue
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append({"text": text, "program": program})
    return out


def cluster(questions: list[dict]) -> list[dict]:
    buckets: dict[str, list[dict]] = {}
    for q in questions:
        label = topic_label(q["text"])
        if label:
            buckets.setdefault(label, []).append(q)

    topics: list[dict] = []
    for label, items in buckets.items():
        texts = [q["text"] for q in items]
        if len(texts) < 2:
            continue
        vec = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), sublinear_tf=True)
        try:
            matrix = vec.fit_transform(texts)
        except ValueError:
            continue
        sims = cosine_similarity(matrix)

        unassigned = set(range(len(texts)))
        while unassigned:
            remaining = list(unassigned)
            seed = max(unassigned, key=lambda j: sims[j][remaining].sum())
            members = [j for j in unassigned if sims[seed][j] >= SIMILARITY]
            if seed not in members:
                members.append(seed)
            unassigned -= set(members)
            if len(members) < MIN_ASKS:
                continue

            centroid = np.asarray(matrix[members].mean(axis=0))
            closeness = cosine_similarity(matrix[members], centroid).ravel()

            # Only well-formed process questions may represent a topic. A
            # cluster whose members are all fragments is dropped rather than
            # published under a phrasing no applicant would recognise.
            eligible = [pos for pos in range(len(members)) if WELL_FORMED.search(texts[members[pos]])]
            if not eligible:
                continue

            def quality(pos: int) -> float:
                t = texts[members[pos]]
                bonus = 0.15 if t.rstrip().endswith("?") else 0.0
                if 30 <= len(t) <= 95:
                    bonus += 0.10
                return float(closeness[pos]) + bonus

            representative = tidy(texts[members[max(eligible, key=quality)]])
            if not representative or IDENTITY.search(representative):
                continue

            programs = Counter(items[j]["program"] for j in members)
            program = programs.most_common(1)[0][0]
            topics.append({
                "question": representative,
                "topic": label,
                "program": program if program in ("UG", "G") else "mixed",
                "asks": len(members),
            })

    topics.sort(key=lambda t: (-t["asks"], t["topic"]))
    return topics


def main() -> int:
    questions = collect_questions()
    print(f"question-like messages harvested : {len(questions)}")
    labelled = [q for q in questions if topic_label(q["text"])]
    print(f"  matching a real FAQ topic      : {len(labelled)}")
    print(f"  unfocused chatter (dropped)    : {len(questions) - len(labelled)}")

    topics = cluster(questions)
    total_asks = sum(t["asks"] for t in topics)
    print(f"\nFAQ topic clusters (asked {MIN_ASKS}+ times): {len(topics)}")
    print(f"  question instances they cover  : {total_asks}")
    print(f"  asked 4+ times                 : {sum(1 for t in topics if t['asks'] >= 4)}")

    by_topic = Counter()
    for t in topics:
        by_topic[t["topic"]] += t["asks"]
    print("\ntop topics by total asks:")
    for lbl, n in by_topic.most_common():
        print(f"  {lbl:<24} {n:>4} asks across {sum(1 for t in topics if t['topic'] == lbl):>2} questions")

    print("\ntop 20 seed questions:")
    for t in topics[:20]:
        print(f"  {t['asks']:>3}  [{t['topic']:<22}] {t['question'][:82]}")

    OUT.write_text(json.dumps({
        "generated_from": "community corpus (WhatsApp export), question text only",
        "similarity": SIMILARITY,
        "min_asks": MIN_ASKS,
        "topic_count": len(topics),
        "topics": topics,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nwrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
