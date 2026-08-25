# Deploying the GKS RAG service

**Deployed on Vercel** as its own project (`gks-rag`), separate from the KMate
Next.js project so neither build can break the other.

| | |
| --- | --- |
| Production URL | `https://gks-rag.vercel.app` |
| Entrypoint | `api/index.py` (re-exports the same FastAPI `app`) |
| Cold start | ~8 s · Warm `/ask` ~0.45-0.70 s |
| Index | shipped **prebuilt** (Vercel's build cannot run the PDF ingestion) |

Deploy with `vercel deploy --prod` from this directory. Only the production
alias is public — deployment-specific URLs are 401 behind Vercel Deployment
Protection, so `GKS_RAG_URL` must point at the alias, never a build URL.

## What this service is

A small FastAPI app that answers GKS questions from two separately-ranked
knowledge layers (official guideline chunks, community applicant experience).
It is **stateless per request** but holds its index in memory, so it needs a
long-running process — not a per-request serverless function.

It is a private backend: only KMate's server-side route `/api/gks/ask` calls
it. It is never exposed to a browser, and it never calls back into KMate.

## Runtime requirements

| Requirement | Value |
| --- | --- |
| Python | 3.12+ (developed against 3.12) |
| Memory | ~263 MB peak measured (index is 39 MB on disk); 512 MB gives comfortable headroom |
| Disk | ~250 MB including the built index |
| Network egress | none required (only needed if `OPENAI_API_KEY` is set) |
| Startup | ~5–10 s (loading the index) |

## Build

The index is a build artifact and is **not** committed. Build it from the
committed sources at image-build time.

### Container (recommended)

A `Dockerfile` is provided. The build context is the **repo root**, because the
guideline PDFs live in `public/official-guidelines/` and are shared with the
Next.js app:

```bash
docker build -t gks-rag -f gks-rag/Dockerfile .
docker run -p 8000:8000 gks-rag
```

The image builds the index and runs `tests/test_retrieval.py` during build, so a
drifted source PDF or a broken retrieval guarantee **fails the build** rather
than shipping. `CMD` binds `$PORT` when the platform sets one.

### Without a container

```bash
pip install -r requirements.txt
python -m app.rebuild
```

`app.rebuild` runs, in order: source verification → official PDF ingestion →
community program tagging → index build. It reaches no network, so the result
depends only on the repository contents.

Source PDFs are hash-verified against `data/official/sources.json` before
ingestion. If a PDF does not match its recorded `sha256`, the build **fails**
rather than ingesting a document nobody reviewed.

## What had to change for Vercel

Vercel Functions cap the **unzipped** bundle at 250 MB, and the first attempt
measured 218 MB of dependencies + 39 MB index = 257 MB. Three changes fixed it,
and two of them also cut cold start:

1. **Runtime/build dependency split.** `requirements.txt` is now runtime-only
   (what Vercel installs); PDF parsing, uvicorn and the OpenAI client moved to
   `requirements-dev.txt`.
2. **Compressed index artifacts** (`joblib compress=zlib:6`, gzipped records):
   39 MB → 16 MB, and *faster* to load, because reading less off a cold disk
   beats the decompression cost. Bundle became ~234 MB.
3. **Per-record concepts precomputed at build time**
   (`index/record_concepts.json.gz`). Recomputing them per process was 15.6 s of
   a 24 s cold start. A fingerprint of the concept patterns is stored alongside;
   if the patterns change without a rebuild, the loader recomputes instead of
   serving stale concepts. Cold start went 23.2 s → ~8 s.

### Prebuilt index: what that changes

Vercel's build step has no access to the guideline PDFs (they live outside this
directory) and running the ingestion there is impractical, so the index is built
locally by `python -m app.rebuild` and **shipped** with the deployment.

The verification guarantees therefore travel with the artifact instead of being
re-proved at deploy time. `python -m app.build_index` writes
`index/BUILD_INFO.json` recording the active sources and their sha256s, the
archived editions excluded, per-program record counts, and a sha256 of every
index file. `tests/test_retrieval.py` asserts that manifest still matches
`data/official/sources.json` and that no archived edition is present — so a
stale or hand-edited index fails the tests before it can be deployed.

Run the suites before every deploy; nothing on Vercel re-checks this for you.

> **Deploy with the CLI, not a Git integration.** `index/` is gitignored (it is a
> build artifact), and the deployment relies on `.vercelignore` to upload it from
> the local directory. If this repo is later connected to Vercel for automatic
> Git deploys, the index would be absent and the function would fail at import.
> To switch to Git-based deploys, commit `index/` (~16 MB) first and drop it from
> `.gitignore`.

## Start

```bash
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Bind host/port from the platform's environment; nothing in the Python code
hard-codes a host, port, or `localhost`.

For multiple workers, note each worker loads its own copy of the index —
size memory accordingly, or keep it at one worker per small instance.

## Health check

```
GET /health  ->  200 {"ok": true, "service": "kmate-gks-rag"}
```

Suitable as both liveness and readiness probe: it only returns once the app has
started, and the index is loaded at import time.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | health/readiness probe |
| POST | `/ask` | retrieve evidence + generate an answer |
| POST | `/search` | retrieve raw evidence only |
| GET | `/docs` | OpenAPI UI (consider disabling in production) |

`/ask` and `/search` both require a body of:

```json
{ "question": "Do I need to apostille my transcript?", "program": "UG" }
```

`program` is required and must be exactly `"UG"` or `"G"` — a missing or
invalid value returns 422. This is load-bearing: official evidence is filtered
by program, and defaulting it would risk answering a graduate applicant with
undergraduate rules.

## Environment variables

All optional — the service runs correctly with none set. See `.env.example`
for the full annotated list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | unset | Enables generated answers; without it `/ask` returns retrieved evidence (`mode: "retrieval_only"`). |
| `OPENAI_MODEL` | `gpt-5` | Model used when the key is set. |
| `TOP_K` | `6` | Results per layer. |
| `OFFICIAL_MIN_SCORE` | `0.30` | Relevance floor for official evidence. |
| `OFFICIAL_REQUIRE_CONCEPT` | `1` | Require an official chunk to share a key concept with the question. |
| `COMMUNITY_MIN_SCORE` | `0.03` | Relevance floor for community evidence. |
| `CATEGORY_BOOST`, `KEY_TERM_BOOST`, `COMMUNITY_PROGRAM_*` | see `.env.example` | Ranking tuning. |

**Secrets:** `OPENAI_API_KEY` is the only secret. Inject it via the platform's
secret store. No key is committed, and `.env` is gitignored.

## KMate side

KMate needs `GKS_RAG_URL` set to this service's base URL (no trailing slash),
e.g. `https://gks-rag.internal.example`. Without it, `/api/gks/ask` returns
501 and the `/gks` page reports the assistant isn't configured.

Keep the service on a private network or behind an allowlist if possible. It
has no authentication of its own — KMate's route is the authenticated,
rate-limited front door (20 questions/user/hour).

## Verifying a deployment

```bash
python -m app.check_sources          # committed PDFs match the manifest
python -m tests.test_retrieval       # retrieval guarantees (program isolation, thresholds)
python -m tests.run_evaluation       # broader 47-question evaluation set
python -m tests.run_stress_test      # 82 messy/realistic applicant questions
curl -s "$BASE/health"
curl -s -X POST "$BASE/ask" -H 'Content-Type: application/json' \
  -d '{"program":"UG","question":"Do I need to apostille my transcript?"}'
```

`python -m app.check_sources --remote` additionally re-fetches each source's
`origin_url` and reports whether the publisher has changed the document. It is
read-only: it never overwrites a committed PDF or edits the manifest, so a
changed upstream document can't silently enter the index.

## Updating a guideline (new cycle)

1. Download the new PDF and review it by hand.
2. Put it in `public/official-guidelines/` and update its entry in
   `data/official/sources.json` (`sha256`, `retrieved_at`, `cycle`, `title`).
3. `python -m app.rebuild`
4. `python -m tests.test_retrieval && python -m tests.run_evaluation`
5. Redeploy.

## Not done yet

* No hosting provider chosen and nothing deployed yet; no CI pipeline.
* The Dockerfile has not been built end-to-end (no Docker daemon available on the
  dev machine at the time of writing) — expect to iterate once on first build.
* No authentication on the service itself (relies on network placement).
* Single-process assumption; no shared index cache across replicas.
