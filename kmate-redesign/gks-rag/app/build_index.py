
import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from app.settings import COMMUNITY_FILE, OFFICIAL_FILE, INDEX_DIR, INDEX_COMPRESS

def load_jsonl(path: Path, layer: str):
    rows = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            r["_layer"] = layer
            rows.append(r)
    return rows

def question_text(r):
    if r["_layer"] == "community":
        return " ".join([
            r.get("canonical_question", ""),
            " ".join(r.get("question_variants", [])[:20]),
            r.get("category", "").replace("_", " ")
        ])
    return " ".join([
        r.get("claim", ""),
        r.get("text", ""),
        r.get("category", "").replace("_", " "),
        r.get("source_title", "")
    ])

def answer_text(r):
    if r["_layer"] == "community":
        return " ".join(a.get("text", "") for a in r.get("answers", [])[:8])
    return r.get("text", "") or r.get("claim", "")

def main():
    records = load_jsonl(COMMUNITY_FILE, "community") + load_jsonl(OFFICIAL_FILE, "official")
    if not records:
        raise SystemExit("No knowledge records found.")

    qtexts = [question_text(r) for r in records]
    atexts = [answer_text(r) for r in records]

    word = TfidfVectorizer(
        lowercase=True, strip_accents="unicode", ngram_range=(1, 2),
        min_df=1, max_df=0.99, sublinear_tf=True, stop_words="english",
        max_features=140000
    )
    char = TfidfVectorizer(
        lowercase=True, strip_accents="unicode", analyzer="char_wb",
        ngram_range=(3, 5), min_df=2, max_features=120000,
        sublinear_tf=True
    )
    ans = TfidfVectorizer(
        lowercase=True, strip_accents="unicode", ngram_range=(1, 2),
        min_df=1, max_df=0.99, sublinear_tf=True, stop_words="english",
        max_features=100000
    )

    q_word = word.fit_transform(qtexts)
    q_char = char.fit_transform(qtexts)
    a_word = ans.fit_transform(atexts)

    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    # Compressed on purpose: it cuts the index from ~39 MB to ~16 MB, which is
    # what keeps the deployed function under Vercel's 250 MB unzipped limit --
    # and it loads *faster*, because reading less from a cold disk beats the
    # decompression cost.
    for name, obj in [
        ("q_word_vectorizer.joblib", word),
        ("q_char_vectorizer.joblib", char),
        ("a_word_vectorizer.joblib", ans),
        ("q_word_matrix.joblib", q_word),
        ("q_char_matrix.joblib", q_char),
        ("a_word_matrix.joblib", a_word),
    ]:
        joblib.dump(obj, INDEX_DIR / name, compress=INDEX_COMPRESS)

    with gzip.open(INDEX_DIR / "records.json.gz", "wt", encoding="utf-8", compresslevel=6) as f:
        json.dump(records, f, ensure_ascii=False)

    # Precompute per-record concepts here so serving never pays for it. See
    # Retriever.__init__ for why this is the single biggest cold-start cost.
    from app.retriever import CONCEPTS_FINGERPRINT, _record_blob, concepts_in

    concepts = [sorted(concepts_in(_record_blob(r))) for r in records]
    with gzip.open(INDEX_DIR / "record_concepts.json.gz", "wt", encoding="utf-8", compresslevel=6) as f:
        json.dump({"fingerprint": CONCEPTS_FINGERPRINT, "concepts": concepts}, f)
    # Drop any uncompressed artifact from an older build so the loader can't
    # silently serve a stale index.
    (INDEX_DIR / "records.json").unlink(missing_ok=True)

    _write_build_info(records)
    print(f"Indexed {len(records)} records.")


def _write_build_info(records):
    """
    Records what this index was built from.

    The index is shipped prebuilt to Vercel (its build step cannot run the PDF
    ingestion), so the source-verification guarantees have to travel with the
    artifact instead of being re-proved at deploy time. tests/test_retrieval.py
    asserts this file still matches data/official/sources.json.
    """
    from app.sources import load_sources

    sources = load_sources()
    official = [r for r in records if r.get("_layer") == "official"]
    by_program = {}
    for r in official:
        by_program[r.get("program")] = by_program.get(r.get("program"), 0) + 1

    info = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "records_total": len(records),
        "official_records": len(official),
        "community_records": len(records) - len(official),
        "official_by_program": by_program,
        "active_sources": [
            {"id": s.id, "program": s.program, "cycle": s.cycle, "sha256": s.sha256}
            for s in sources if s.active
        ],
        "archived_sources_excluded": [s.id for s in sources if not s.active],
        "source_ids_in_index": sorted({r.get("source_id") for r in official if r.get("source_id")}),
        "index_files": {},
    }
    for f in sorted(INDEX_DIR.iterdir()):
        if f.name == "BUILD_INFO.json" or not f.is_file():
            continue
        info["index_files"][f.name] = {
            "bytes": f.stat().st_size,
            "sha256": hashlib.sha256(f.read_bytes()).hexdigest(),
        }
    (INDEX_DIR / "BUILD_INFO.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8"
    )

if __name__ == "__main__":
    main()
