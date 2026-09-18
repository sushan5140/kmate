# Build context is the REPO ROOT, not gks-rag/, because the official guideline
# PDFs live in public/official-guidelines/ and are shared with the Next.js app:
#
#   docker build -t gks-rag -f gks-rag/Dockerfile .
#
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Dependencies first so edits to app code don't re-run the heavy wheel install.
COPY gks-rag/requirements.txt gks-rag/requirements-dev.txt ./gks-rag/
# The image builds the index, so it needs the build-time tooling too.
RUN pip install --no-cache-dir -r gks-rag/requirements-dev.txt

# Source PDFs (hash-pinned in data/official/sources.json) + service code.
COPY public/official-guidelines/ ./public/official-guidelines/
COPY gks-rag/app/ ./gks-rag/app/
COPY gks-rag/data/ ./gks-rag/data/
COPY gks-rag/tests/ ./gks-rag/tests/

WORKDIR /srv/gks-rag

# Build the index at image-build time so container start is just "load and serve".
# This verifies every source PDF's sha256 and FAILS THE BUILD on a mismatch, so a
# tampered or drifted guideline can never reach a running deployment.
RUN python -m app.rebuild

# Fail the build if the retrieval guarantees regress (program isolation,
# relevance threshold, archived-edition exclusion, API validation).
RUN python -m tests.test_retrieval

EXPOSE 8000

# Bind the platform's port when it provides one; 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
