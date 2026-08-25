
import os
import json
import re
from app.settings import OPENAI_MODEL

SYSTEM = """You are KMate Scholarship Assistant, answering GKS scholarship applicants.

Answer in exactly this shape, and keep it short:

Official
<what the selected official guideline says, in 1-3 plain sentences>

Community experience
<what other applicants reported, 1-2 sentences, clearly not official>

What you should do
<one concrete next action>

Rules:
1. OFFICIAL evidence is the source of truth. Community evidence is applicant
   experience and must never be stated as an official rule.
2. If the evidence lists anything under `unaddressed_by_official`, say plainly that
   the selected guideline does not appear to state it in the retrieved sections.
   Never infer a requirement from merely topically-related official text.
3. Never invent certainty. If the evidence is thin, say so in one clause.
4. If `conflict.community_internal` is set, say applicants reported mixed
   experiences. If `conflict.against_official` is set, say the reports disagree
   with the guideline and tell the applicant to follow the guideline.
5. Drop a section entirely if the evidence gives it nothing worth saying. Never pad.
6. Do not restate the question, do not add generic disclaimers, do not quote
   retrieved text that does not answer the question.
7. Write for someone whose first language may not be English: short sentences,
   no jargon beyond the official terms themselves (apostille, Embassy Track, TOPIK).
8. Never help forge, fabricate, or alter signatures, stamps, seals, certificates,
   grades, approvals, or official documents.
"""

# Retrieval-only mode has no model to summarise with, so it quotes -- but it
# quotes tightly. Long verbatim walls were the main readability problem: an
# applicant had to read six chunks to find the sentence that mattered.
MAX_OFFICIAL_QUOTES = 2
MAX_COMMUNITY_QUOTES = 2
MAX_QUOTE_CHARS = 240


def _trim(text: str, limit: int = MAX_QUOTE_CHARS) -> str:
    text = re.sub(r"\s+", " ", (text or "")).strip()
    # Chunks often start with the guideline's own bullet glyph; we add our own.
    text = re.sub(r"^[-–—○◈※•▪■□]\s*", "", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut + "…"


def evidence_only(question, official, community, coverage=None, conflict=None):
    """
    Readable answer assembled from retrieved evidence when no generation model
    is configured. Same three sections the UI renders, so the two never
    disagree about what was found.
    """
    unsupported = (coverage or {}).get("unsupported_labels") or []
    lines = ["Official"]

    if official:
        for x in official[:MAX_OFFICIAL_QUOTES]:
            page = x.get("page")
            cite = f" (p.{page})" if page else ""
            lines.append(f"- {_trim(x.get('claim'))}{cite}")
        if unsupported:
            lines.append(
                "- The selected guideline does not appear to explicitly state "
                + ", ".join(unsupported)
                + " in the retrieved sections."
            )
    else:
        lines.append(
            "- Official verification pending: the selected guideline does not appear to "
            "cover this in the retrieved sections."
        )

    conflict = conflict or {}
    conflicted = (
        conflict.get("community_internal")
        or any(x.get("possible_conflict") for x in community[:MAX_COMMUNITY_QUOTES])
    )
    if community:
        lines.append("")
        lines.append("Community experience (applicant reports, not official)")
        for x in community[:MAX_COMMUNITY_QUOTES]:
            answers = x.get("answers") or []
            if not answers:
                continue
            best = answers[0]
            note = " [unverified guess]" if best.get("usefulness") == "unsupported_guess" else ""
            lines.append(f"- {_trim(best.get('text'))}{note}")
        if conflicted:
            lines.append("- Applicants reported mixed experiences on this point.")
        if conflict.get("against_official"):
            lines.append("- Some reports disagree with the official guideline above; follow the guideline.")

    lines.append("")
    lines.append("What you should do")
    if conflict.get("against_official"):
        lines.append("- Follow the official guideline above, not the conflicting community reports.")
    elif official and not unsupported:
        lines.append("- Check the cited guideline page for your cycle, then follow it.")
    else:
        lines.append(
            "- Confirm this directly with your embassy or the university before relying on it."
        )
    return "\n".join(lines)


def generate(question, official, community, coverage=None, conflict=None):
    if not os.getenv("OPENAI_API_KEY"):
        return evidence_only(question, official, community, coverage, conflict), "retrieval_only"

    from openai import OpenAI
    client = OpenAI()

    evidence = {
        "official": official,
        "community": community,
        # Concepts the question raises that the retrieved official text does
        # not address -- rule 2 above forbids inventing a rule for these.
        "unaddressed_by_official": (coverage or {}).get("unsupported_labels", []),
        "conflict": conflict or {},
    }

    response = client.responses.create(
        model=OPENAI_MODEL,
        store=False,
        input=[
            {"role": "developer", "content": SYSTEM},
            {"role": "user", "content": f"Question: {question}\n\nRetrieved evidence:\n{json.dumps(evidence, ensure_ascii=False)}"},
        ],
    )
    return response.output_text, "rag_generated"
