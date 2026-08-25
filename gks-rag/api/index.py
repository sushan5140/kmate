"""
Vercel entrypoint for the GKS RAG service.

Vercel's Python runtime detects the module-level ASGI `app` and serves it, so
this re-exports the same FastAPI application used locally under uvicorn -- no
second implementation, no behaviour that only exists in one environment.

The retriever is built at import time (see app/main.py), which means the index
is loaded once per function instance and reused for every request that instance
serves. It is never rebuilt per request.
"""

import sys
from pathlib import Path

# Vercel invokes this file directly, so the service package sitting one level up
# is not on the path by default.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

__all__ = ["app"]
