"""
Parses the official GKS guideline PDFs listed in data/official/sources.json
into official-layer knowledge records, tagged by program so retrieval can
never mix GKS-U and GKS-G official rules.

Sources are resolved to committed local PDFs and hash-verified first (see
app/sources.py) -- nothing is downloaded here, so a rebuild is reproducible
and a changed PDF fails loudly instead of being ingested silently.

Extraction has two paths per page:

  * Tables (pdfplumber, from real ruling lines). These guidelines carry their
    most-asked-about content -- the document checklists -- in tables whose
    left "Type" column vertically spans a group of rows. That spanning cell is
    the part that actually answers "does my transcript need an apostille?",
    so each row is emitted as its own chunk *with its group label attached*,
    rather than as a flat run of text where the row and its requirement drift
    apart.

  * Prose (the bands of each page outside any table), chunked per bullet /
    heading marker (○ ◈ ※ numbered lists), which is how these documents are
    structured.

Nothing is paraphrased: chunk text is extracted verbatim and only joined with
separators. Where a table can't be reconstructed with confidence the chunk is
marked extraction_quality="needs_review" instead of being presented as clean.

  python -m app.ingest_official_pdfs
  python -m app.build_index          # rebuild the index afterwards
"""

import json
import re
import sys

import pdfplumber

from app.retriever import infer_category
from app.settings import OFFICIAL_FILE
from app.sources import OfficialSource, load_verified_sources

BULLET_RE = re.compile(r"^\s*([○◈※•▪■□]|[-–]\s|\d+[.)]\s|[①②③④⑤⑥⑦⑧⑨⑩])")
PAGE_NUMBER_NOISE_RE = re.compile(r"^\s*\d{1,3}\s*$")
ROW_KEY_RE = re.compile(r"^\d{1,2}\s*['’*]?$")
CYCLE_RE = re.compile(r"(20\d{2})\s*(?:GKS|Global\s+Korea\s+Scholarship)", re.I)

MIN_PROSE_CHARS = 40
MIN_ROW_CHARS = 12
MAX_CHUNK_CHARS = 1400
# Max vertical gap between two text lines still considered one paragraph, used
# to tell a wrapped label apart from two different labels (see label_blocks).
LABEL_LINE_GAP_PT = 22.0
# A row band taller than this usually means the row-key column was misread and
# one "row" swallowed a chunk of the table.
MAX_ROW_BAND_PT = 140


# --------------------------------------------------------------------------
# prose
# --------------------------------------------------------------------------

def is_noise_line(line: str) -> bool:
    stripped = line.strip()
    return not stripped or bool(PAGE_NUMBER_NOISE_RE.match(stripped))


def split_long(text: str, limit: int = MAX_CHUNK_CHARS):
    if len(text) <= limit:
        yield text
        return
    buf = ""
    for s in re.split(r"(?<=[.!?])\s+", text):
        if buf and len(buf) + len(s) + 1 > limit:
            yield buf.strip()
            buf = s
        else:
            buf = f"{buf} {s}".strip()
    if buf:
        yield buf.strip()


def split_faq(text: str) -> list[str]:
    """
    Splits an FAQ run into one chunk per question.

    The appendix FAQ pages print each Q&A in English and then again in Korean,
    which otherwise merges into one long bilingual blob that matches almost any
    question weakly and answers none of them precisely. Splitting on the "Q."
    marker keeps each question with its own answer (and its Korean counterpart,
    which follows before the next Q.).
    """
    parts = re.split(r"(?=\bQ\s*\.)", text)
    return [p.strip() for p in parts if len(p.strip()) >= MIN_PROSE_CHARS]


def chunk_prose(text: str) -> list[str]:
    lines = [l for l in (text or "").split("\n") if not is_noise_line(l)]
    if not lines:
        return []

    groups: list[list[str]] = []
    for line in lines:
        if BULLET_RE.match(line) or not groups:
            groups.append([line])
        else:
            groups[-1].append(line)

    if len(groups) <= 1:
        joined = "\n".join(lines)
        paragraphs = [p.strip() for p in re.split(r"\n{2,}", joined) if p.strip()]
        groups = [[p] for p in paragraphs] if len(paragraphs) > 1 else [[joined]]

    chunks = []
    for g in groups:
        merged = re.sub(r"\s+", " ", " ".join(l.strip() for l in g)).strip()
        if len(merged) < MIN_PROSE_CHARS:
            continue
        for part in split_faq(merged) if re.search(r"\bQ\s*\.", merged) else [merged]:
            chunks.extend(split_long(part))
    return chunks


# --------------------------------------------------------------------------
# tables
# --------------------------------------------------------------------------

def page_words(page) -> list[dict]:
    try:
        return page.extract_words(use_text_flow=False, keep_blank_chars=False)
    except Exception:
        return []


def words_in(words: list[dict], bbox) -> list[dict]:
    """
    Words whose *centre* lies inside bbox.

    Deliberately not page.crop(): crop with strict=False also pulls in text
    that merely overlaps the box, so a tall merged cell bleeds into every
    neighbouring cell's text and collapses distinct row groups into one. Centre
    containment gives each word to exactly one cell.
    """
    x0, top, x1, bottom = bbox
    out = []
    for w in words:
        cx = (w["x0"] + w["x1"]) / 2
        cy = (w["top"] + w["bottom"]) / 2
        if x0 <= cx <= x1 and top <= cy <= bottom:
            out.append(w)
    return out


def words_to_lines(words: list[dict], y_tol: float = 2.5) -> list[str]:
    """Regroups words into visual lines (ordered top-to-bottom, left-to-right)."""
    if not words:
        return []
    lines: list[list[dict]] = []
    for w in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        if lines and abs(w["top"] - lines[-1][0]["top"]) <= y_tol:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [" ".join(x["text"] for x in sorted(l, key=lambda w: w["x0"])).strip() for l in lines]


def region_text(words: list[dict], bbox) -> str:
    return re.sub(r"\s+", " ", " ".join(words_to_lines(words_in(words, bbox)))).strip()


def contained(inner, outer, tol: float = 2.0) -> bool:
    return (
        inner[0] >= outer[0] - tol
        and inner[1] >= outer[1] - tol
        and inner[2] <= outer[2] + tol
        and inner[3] <= outer[3] + tol
    )


def merge_row_keys(keys):
    """
    Collapses the duplicate/split row-number cells these PDFs produce (a stray
    ruling line through the number cell yields e.g. "16*" then "16" stacked).
    """
    keys = sorted(keys, key=lambda k: k["top"])
    merged = []
    for k in keys:
        if merged:
            prev = merged[-1]
            adjacent = k["top"] <= prev["bottom"] + 3
            same = k["text"] == prev["text"] or k["text"].startswith(prev["text"]) or prev["text"].startswith(k["text"])
            if adjacent and same:
                prev["bottom"] = max(prev["bottom"], k["bottom"])
                if len(k["text"]) > len(prev["text"]):
                    prev["text"] = k["text"]
                continue
        merged.append(dict(k))
    return merged


def label_blocks(words, cells, body_top: float, body_bottom: float):
    """
    Reconstructs the left "Type" column as (top, bottom, text) spans.

    Two shapes show up in these documents and both are handled here:
      * a genuinely merged cell (or a run of contiguous cells) -- its ruling
        lines are the real group boundaries, so the span is exact;
      * a group with no cell at all in the left column -- the region between
        the cells that do exist, read directly off the page.
    """
    if not cells:
        return []
    x0min = min(c[0] for c in cells)
    col = sorted(
        [c for c in cells if abs(c[0] - x0min) < 3 and c[3] > body_top + 1],
        key=lambda c: c[1],
    )

    # Group the label column's cells into visual labels.
    #
    # Cell adjacency alone can't do this: in GKS-G one label is split across
    # three stacked cells ("Certificates (Required)" / "Must be" / "Apostilled
    # or Consular confirmed"), while in GKS-U three *different* labels sit in
    # three equally-adjacent merged cells. What separates the two is the text:
    # fragments of one label are consecutive lines of a paragraph, whereas
    # distinct labels are each centred in their own tall cell with a wide band
    # of whitespace between them.
    runs = []
    for (cx0, ctop, cx1, cbottom) in col:
        cell_words = words_in(words, (cx0, ctop, cx1, cbottom))
        if not cell_words:
            continue
        text = re.sub(r"\s+", " ", " ".join(words_to_lines(cell_words))).strip()
        if not text:
            continue
        w_top = min(w["top"] for w in cell_words)
        w_bottom = max(w["bottom"] for w in cell_words)
        same_paragraph = (
            runs
            and ctop <= runs[-1]["bottom"] + 3
            and (w_top - runs[-1]["text_bottom"]) <= LABEL_LINE_GAP_PT
        )
        if same_paragraph:
            runs[-1]["bottom"] = cbottom
            runs[-1]["text"] = f"{runs[-1]['text']} {text}".strip()
            runs[-1]["text_bottom"] = w_bottom
        else:
            runs.append(
                {
                    "top": ctop,
                    "bottom": cbottom,
                    "text": text,
                    "text_top": w_top,
                    "text_bottom": w_bottom,
                    "x0": cx0,
                    "x1": cx1,
                }
            )

    x1col = max((c[2] for c in col), default=x0min)
    blocks = [r for r in runs if r["bottom"] > body_top]

    # Fill the uncovered vertical gaps by reading the column directly.
    filled = []
    cursor = body_top
    for b in sorted(blocks, key=lambda b: b["top"]):
        if b["top"] - cursor > 6:
            gap_text = region_text(words, (x0min, cursor, x1col, b["top"]))
            if gap_text:
                filled.append({"top": cursor, "bottom": b["top"], "text": gap_text})
        filled.append(b)
        cursor = max(cursor, b["bottom"])
    if body_bottom - cursor > 6:
        gap_text = region_text(words, (x0min, cursor, x1col, body_bottom))
        if gap_text:
            filled.append({"top": cursor, "bottom": body_bottom, "text": gap_text})

    return sorted(filled, key=lambda b: b["top"]), x1col


def extract_grid_rows(table):
    """
    Fallback for tables that are a plain uniform grid rather than a numbered
    checklist -- the GPA conversion table and the country-quota table, where
    every row is data and there is no row-number column with spanning labels.

    Each data row becomes one chunk with its values paired to the header, so a
    row stays readable on its own ("4.0 Scale: 3.97 ~ 4.0 | 4.3 Scale: ...")
    instead of dissolving into a wall of numbers. Values are verbatim.
    """
    try:
        data = table.extract()
    except Exception:
        return None
    rows = [["" if c is None else " ".join(str(c).split()) for c in r] for r in data]
    rows = [r for r in rows if any(c for c in r)]
    if len(rows) < 4:
        return None

    counts = [sum(1 for c in r if c) for r in rows]
    modal = max(set(counts), key=counts.count)
    if modal < 3:
        return None
    # A uniform grid: most rows carry the same number of populated cells.
    if sum(1 for c in counts if c == modal) < max(3, 0.6 * len(rows)):
        return None

    header = rows[0]
    out = []
    for r, n in zip(rows[1:], counts[1:]):
        parts = []
        for h, v in zip(header, r):
            if not v:
                continue
            parts.append(f"{h}: {v}" if h and h != v else v)
        if not parts:
            continue
        # One missing cell is normal in these grids (a contact row with no fax,
        # a country with a single office), not a sign of a bad reconstruction.
        # Only a row materially short of the modal width is suspect.
        out.append({
            "text": " | ".join(parts),
            "quality": "clean" if n >= modal - 1 else "needs_review",
        })
    return out or None


def extract_table_rows(page, words, table):
    """
    Returns (rows, table_meta). Each row is a dict with text + quality.
    Returns (None, reason) when this "table" isn't really a row-structured
    table and should be handled as prose instead.
    """
    cells = table.cells
    if len(cells) < 6:
        return None, "too_few_cells"

    tx0, ttop, tx1, tbottom = table.bbox

    # Locate the row-number column: the column holding the most cells whose
    # entire text is a small number (optionally with ' or *).
    by_col: dict[int, list] = {}
    for (cx0, ctop, cx1, cbottom) in cells:
        text = region_text(words, (cx0, ctop, cx1, cbottom))
        if ROW_KEY_RE.match(text):
            by_col.setdefault(round(cx0), []).append(
                {"text": text.replace(" ", ""), "top": ctop, "bottom": cbottom, "x0": cx0, "x1": cx1}
            )
    if not by_col:
        return None, "no_row_key_column"

    key_x = max(by_col, key=lambda k: len(by_col[k]))
    keys = merge_row_keys(by_col[key_x])
    if len(keys) < 2:
        return None, "single_row"

    key_x1 = max(k["x1"] for k in keys)
    body_top = min(k["top"] for k in keys)

    labels, label_x1 = label_blocks(words, cells, body_top, tbottom)
    # The label column only counts as one if it sits left of the row numbers.
    labels = [b for b in labels if label_x1 <= key_x + 1]

    header = region_text(words, (tx0, ttop, tx1, body_top))

    rows = []
    for i, k in enumerate(keys):
        row_top = k["top"]
        row_bottom = keys[i + 1]["top"] if i + 1 < len(keys) else tbottom
        band = row_bottom - row_top
        content = region_text(words, (key_x1, row_top, tx1, row_bottom))

        quality = "clean"
        if not content:
            quality = "needs_review"
        if band > MAX_ROW_BAND_PT:
            quality = "needs_review"

        centre = row_top + band / 2
        covering = [b for b in labels if b["top"] - 1 <= centre <= b["bottom"] + 1]
        label = covering[0]["text"] if covering else ""
        # A row straddling two label spans can't be attributed confidently.
        straddling = [
            b for b in labels
            if min(b["bottom"], row_bottom) - max(b["top"], row_top) > band * 0.35
        ]
        if len(straddling) > 1:
            quality = "needs_review"
            label = " / ".join(b["text"] for b in straddling)

        rows.append({"key": k["text"], "label": label, "content": content, "quality": quality})

    # Sanity-check the reconstruction. On a table with no real row-number
    # column (a GPA conversion grid, say) the "keys" latch onto a column of
    # data values and every band then crops the same text -- so near-identical
    # or largely empty rows mean this path picked the wrong structure and the
    # caller should fall back to plain grid extraction.
    contents = [r["content"] for r in rows]
    empty = sum(1 for c in contents if not c)
    distinct = len(set(contents))
    if empty > 0.2 * len(rows) or distinct < 0.7 * len(rows):
        return None, "row_key_reconstruction_unreliable"

    return rows, {"header": header, "bbox": table.bbox}


def caption_for(page, words, table_bbox, other_boxes) -> str:
    """The nearest prose line(s) directly above a table -- its heading."""
    _, ttop, _, _ = table_bbox
    top_limit = max([b[3] for b in other_boxes if b[3] <= ttop] + [0.0])
    lines = words_to_lines(words_in(words, (0, max(top_limit, ttop - 90), page.width, ttop)))
    lines = [l for l in lines if not is_noise_line(l)]
    return re.sub(r"\s+", " ", " ".join(lines[-2:]))[:200]


# --------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------

def detect_cycle(pdf) -> str | None:
    for page in pdf.pages[:4]:
        m = CYCLE_RE.search(page.extract_text() or "")
        if m:
            return m.group(1)
    return None


def ingest(source: OfficialSource) -> list[dict]:
    records: list[dict] = []
    stats = {"table_rows": 0, "prose": 0, "needs_review": 0, "tables": 0, "prose_tables": 0}

    with pdfplumber.open(str(source.path)) as pdf:
        detected = detect_cycle(pdf)
        if detected and detected != source.cycle:
            print(
                f"  WARNING [{source.id}]: manifest cycle={source.cycle} but the PDF text "
                f"says {detected}. Using the PDF's value.",
                file=sys.stderr,
            )
        cycle = detected or source.cycle

        def add(text: str, page_no: int, quality: str, kind: str):
            text = text.strip()
            if not text:
                return
            records.append(
                {
                    "scholarship": source.scholarship,
                    "program": source.program,
                    "cycle": cycle,
                    "category": infer_category(text) or "other",
                    "claim": text,
                    "text": text,
                    "source_title": source.title,
                    "source_url": source.source_url,
                    "source_file": source.path.name,
                    "source_id": source.id,
                    "page": page_no,
                    "content_type": kind,
                    "extraction_quality": quality,
                }
            )
            if quality == "needs_review":
                stats["needs_review"] += 1

        for page_no, page in enumerate(pdf.pages, start=1):
            words = page_words(page)
            found = page.find_tables()
            # Drop tables nested inside another (the label cell of a big table
            # is often detected as a table in its own right).
            boxes = [t.bbox for t in found]
            tables = [
                t for t in found
                if not any(t.bbox != other and contained(t.bbox, other) for other in boxes)
            ]

            real_tables, prose_boxes = [], []
            for t in tables:
                rows, meta = extract_table_rows(page, words, t)
                if rows is None:
                    grid = extract_grid_rows(t)
                    if grid:
                        rows = [
                            {"key": "", "label": "", "content": g["text"], "quality": g["quality"]}
                            for g in grid
                        ]
                        real_tables.append((t, rows, {"header": "", "bbox": t.bbox}))
                    else:
                        prose_boxes.append(t.bbox)  # a bordered prose box, not a grid
                else:
                    real_tables.append((t, rows, meta))

            stats["tables"] += len(real_tables)
            stats["prose_tables"] += len(prose_boxes)

            done_boxes = [t.bbox for t, _, _ in real_tables]
            for t, rows, meta in real_tables:
                caption = caption_for(page, words, t.bbox, done_boxes)
                for row in rows:
                    # A row whose content came back empty carries nothing to
                    # retrieve -- emitting it as needs_review would just add
                    # noise for a reviewer to wade through.
                    if not row["content"].strip():
                        continue
                    parts = [p for p in (caption, meta["header"], row["label"]) if p]
                    prefix = " | ".join(parts)
                    body = f"{row['key']}. {row['content']}".strip() if row["key"] else row["content"].strip()
                    if len(body) < MIN_ROW_CHARS and row["quality"] == "clean":
                        continue
                    add(f"{prefix} | {body}" if prefix else body, page_no, row["quality"], "table_row")
                    stats["table_rows"] += 1

            # Prose = the page minus the real tables (bordered prose boxes stay).
            bands, cursor = [], 0.0
            for (_, btop, _, bbottom) in sorted(done_boxes, key=lambda b: b[1]):
                if btop - cursor > 8:
                    bands.append((cursor, btop))
                cursor = max(cursor, bbottom)
            if page.height - cursor > 8:
                bands.append((cursor, page.height))

            for (btop, bbottom) in bands:
                band_lines = words_to_lines(words_in(words, (0, btop, page.width, bbottom)))
                for chunk in chunk_prose("\n".join(band_lines)):
                    add(chunk, page_no, "clean", "prose")
                    stats["prose"] += 1

    print(
        f"{source.program:>2} [{source.id}] cycle={cycle}: "
        f"{len(records)} chunks ({stats['table_rows']} table rows from {stats['tables']} tables, "
        f"{stats['prose']} prose, {stats['prose_tables']} bordered-prose boxes, "
        f"{stats['needs_review']} needs_review)"
    )
    return records


def main():
    sources = load_verified_sources()
    print(f"Verified {len(sources)} source PDF(s) against data/official/sources.json")

    all_records = []
    for s in sources:
        all_records.extend(ingest(s))

    OFFICIAL_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OFFICIAL_FILE.open("w", encoding="utf-8") as f:
        for rec in all_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    needs = sum(1 for r in all_records if r["extraction_quality"] == "needs_review")
    print(f"\nWrote {len(all_records)} official records ({needs} needs_review) to {OFFICIAL_FILE}")
    print("Next: python -m app.build_index")


if __name__ == "__main__":
    main()
