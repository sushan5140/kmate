
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Raw, committed community export -- never modified by any build step.
COMMUNITY_RAW_FILE = ROOT / "data" / "community" / "rag_ready_community.jsonl"
# Generated: the raw export plus inferred UG/G program tags (see
# app/tag_community_programs.py). This is what the index is built from.
COMMUNITY_FILE = ROOT / "data" / "community" / "community_knowledge.jsonl"
# Generated from the source PDFs (see app/ingest_official_pdfs.py).
OFFICIAL_FILE = ROOT / "data" / "official" / "official_knowledge.jsonl"
SOURCES_FILE = ROOT / "data" / "official" / "sources.json"
INDEX_DIR = ROOT / "index"
# joblib compression for index artifacts. Keeps the deployed function under
# Vercel's 250 MB unzipped limit and speeds up cold loads (less disk I/O).
INDEX_COMPRESS = ("zlib", int(os.getenv("INDEX_COMPRESS_LEVEL", "6")))

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5")
TOP_K = int(os.getenv("TOP_K", "6"))

# --- Retrieval tuning -------------------------------------------------------
# Boost applied when a record's category matches the category inferred from
# the question. Raised from the original 0.12: category is a strong signal and
# was previously too weak to outrank generic word overlap.
CATEGORY_BOOST = float(os.getenv("CATEGORY_BOOST", "0.30"))

# Boost per matched key concept (see KEY_CONCEPTS in retriever.py), scaled by
# the share of the question's concepts a record actually covers. This is what
# keeps "apostille"/"Form 4"/"Embassy Track" style questions anchored to
# chunks that literally discuss those things.
KEY_TERM_BOOST = float(os.getenv("KEY_TERM_BOOST", "0.45"))

# Minimum final score for OFFICIAL evidence. Below this we return nothing and
# the UI shows "Official verification pending" -- deliberately preferred over
# showing unrelated official text, which reads as authoritative and is worse
# than admitting we don't have it.
OFFICIAL_MIN_SCORE = float(os.getenv("OFFICIAL_MIN_SCORE", "0.30"))

# When a question names specific key concepts, an official chunk that covers
# none of them is off-topic no matter how well it scores lexically.
OFFICIAL_REQUIRE_CONCEPT = os.getenv("OFFICIAL_REQUIRE_CONCEPT", "1") != "0"

# Community evidence keeps the original permissive floor: it's clearly labelled
# non-official supporting experience, and being strict there mostly just empties
# a section that's useful even when only loosely related.
COMMUNITY_MIN_SCORE = float(os.getenv("COMMUNITY_MIN_SCORE", "0.03"))

# Community program handling is a ranking preference, NOT a hard filter like
# the official layer. Most of the dataset is "mixed" (groups covering both
# tracks) and general applicant experience travels well between them, so the
# opposite program is pushed down rather than removed -- it can still surface
# when nothing better matches.
COMMUNITY_PROGRAM_MATCH_BOOST = float(os.getenv("COMMUNITY_PROGRAM_MATCH_BOOST", "0.10"))
COMMUNITY_PROGRAM_MIXED_BOOST = float(os.getenv("COMMUNITY_PROGRAM_MIXED_BOOST", "0.05"))
COMMUNITY_PROGRAM_MISMATCH_PENALTY = float(os.getenv("COMMUNITY_PROGRAM_MISMATCH_PENALTY", "0.25"))

# --- Community answer usefulness ---------------------------------------------
# Relevance (does this thread match the question?) and usefulness (does any reply
# actually say something?) are different axes. TF-IDF ranks the first; the top
# RERANK_POOL candidates are then re-ranked by the best answer they contain, so
# a thread full of "ok thanks" loses to one containing a real procedure.
COMMUNITY_RERANK_POOL = int(os.getenv("COMMUNITY_RERANK_POOL", "25"))
COMMUNITY_USEFULNESS_WEIGHT = float(os.getenv("COMMUNITY_USEFULNESS_WEIGHT", "0.60"))
# Strongest replies shown per thread, and threads shown per answer.
COMMUNITY_ANSWERS_PER_CASE = int(os.getenv("COMMUNITY_ANSWERS_PER_CASE", "3"))
COMMUNITY_MAX_CASES = int(os.getenv("COMMUNITY_MAX_CASES", "3"))
