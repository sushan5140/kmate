
from typing import Literal
from fastapi import FastAPI
from pydantic import BaseModel, Field
from app.retriever import Retriever, clarification_for, coverage, query_concepts
from app.settings import COMMUNITY_MAX_CASES
from app.usefulness import detect_conflicts
from app.generator import generate
from app.settings import TOP_K

app = FastAPI(title="KMate GKS RAG", version="0.1.0")
retriever = Retriever()

class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    # Required, not defaulted -- official retrieval must always be scoped to
    # one program. Making this optional would mean a caller that forgets to
    # pass it silently gets unfiltered (mixed UG+G) official evidence back;
    # a 422 here is much safer than that.
    program: Literal["UG", "G"]
    top_k: int = Field(default=TOP_K, ge=1, le=15)

@app.get("/health")
def health():
    return {"ok": True, "service": "kmate-gks-rag"}

@app.post("/search")
def search(req: AskRequest):
    official = retriever.search(req.question, req.top_k, "official", program=req.program)
    return {
        "question": req.question,
        "program": req.program,
        "official": official,
        "community": retriever.search(req.question, req.top_k, "community", program=req.program),
        "coverage": coverage(req.question, official),
    }

@app.post("/ask")
def ask(req: AskRequest):
    # Too thin to answer: ask one short question instead of retrieving
    # arbitrary evidence and presenting it confidently.
    clarification = clarification_for(req.question)
    if clarification:
        return {
            "question": req.question,
            "program": req.program,
            "answer": clarification,
            "mode": "needs_clarification",
            "needs_clarification": True,
            "clarification": clarification,
            "official_sources_found": 0,
            "community_cases_found": 0,
            "coverage": {"question_concepts": [], "covered": [], "unsupported": [], "unsupported_labels": []},
            "evidence": {"official": [], "community": []},
        }

    official = retriever.search(req.question, req.top_k, "official", program=req.program)
    community = retriever.search(req.question, req.top_k, "community", program=req.program)
    # Show the strongest few threads, not everything retrieval returned. Six weak
    # matches read as noise and bury the one that answers the question.
    community = community[:COMMUNITY_MAX_CASES]
    cov = coverage(req.question, official)

    selected_answers = [a for c in community for a in c.get("answers", [])]
    conflict = detect_conflicts(selected_answers, official, query_concepts(req.question))

    answer, mode = generate(req.question, official, community, cov, conflict)
    return {
        "question": req.question,
        "program": req.program,
        "answer": answer,
        "mode": mode,
        "needs_clarification": False,
        "official_sources_found": len(official),
        "community_cases_found": len(community),
        # Which parts of the question the retrieved official text actually
        # addresses -- the UI uses `unsupported_labels` to avoid implying a
        # rule exists just because related official text was found.
        "coverage": cov,
        # Where community reports disagree with each other or with the guideline.
        # The guideline always wins; this only makes the disagreement visible.
        "conflict": conflict,
        "evidence": {
            "official": official,
            "community": community,
        },
    }
