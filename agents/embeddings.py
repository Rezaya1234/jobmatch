"""
Embedding backend for candidate filtering.

Backend controlled by EMBEDDING_BACKEND env var:
  "openai" — OpenAI text-embedding-3-small API (default)
  "local"  — Local BGE models via sentence-transformers

Switch to "local" at ~100+ daily active users when Render Pro
($85/mo) is cheaper than OpenAI API costs (~$200/mo at volume).
"""
import asyncio
import logging
import os
from functools import lru_cache

import numpy as np

logger = logging.getLogger(__name__)

_BACKEND = os.getenv("EMBEDDING_BACKEND", "openai").lower()
_OPENAI_MODEL = "text-embedding-3-small"
_OPENAI_DIMS = 1536
_PREFIX = "Represent this for job matching: "


# ---------------------------------------------------------------------------
# Local BGE backend (sentence-transformers)
# ---------------------------------------------------------------------------

def _is_local_available() -> bool:
    import importlib.util
    return importlib.util.find_spec("sentence_transformers") is not None


@lru_cache(maxsize=1)
def _model_small():
    logger.info("Loading BAAI/bge-small-en-v1.5 (first use — downloading if needed)...")
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("BAAI/bge-small-en-v1.5")


@lru_cache(maxsize=1)
def _model_large():
    logger.info("Loading BAAI/bge-large-en-v1.5 (first use — downloading if needed)...")
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("BAAI/bge-large-en-v1.5")


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / (denom + 1e-9))


async def _embed_local(
    profile_text: str,
    job_texts: list[str],
    model_size: str,
) -> list[float] | None:
    if not _is_local_available() or not job_texts:
        return None

    model = _model_small() if model_size == "small" else _model_large()
    texts = [_PREFIX + profile_text] + [_PREFIX + t for t in job_texts]

    def _run() -> list[float]:
        embeddings = model.encode(
            texts,
            normalize_embeddings=True,
            batch_size=32,
            show_progress_bar=False,
        )
        profile_emb = embeddings[0]
        return [_cosine(profile_emb, emb) for emb in embeddings[1:]]

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _run)


# ---------------------------------------------------------------------------
# OpenAI backend (text-embedding-3-small)
# ---------------------------------------------------------------------------

def _openai_client():
    from openai import AsyncOpenAI
    return AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


async def embed_single(text: str) -> list[float] | None:
    """
    Embed a single text string using OpenAI text-embedding-3-small.
    Returns a unit-normalized vector as list[float], or None on failure.
    Used for storing job and profile embeddings in pgvector.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not text:
        return None
    try:
        client = _openai_client()
        response = await client.embeddings.create(
            model=_OPENAI_MODEL,
            input=text,
        )
        arr = np.array(response.data[0].embedding, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm > 0:
            arr = arr / norm
        return arr.tolist()
    except Exception as exc:
        logger.warning("embed_single failed: %s — returning None", exc)
        return None


async def _embed_openai(
    profile_text: str,
    job_texts: list[str],
) -> list[float] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not job_texts:
        return None

    try:
        client = _openai_client()
        texts = [profile_text] + job_texts
        response = await client.embeddings.create(
            model=_OPENAI_MODEL,
            input=texts,
        )
        vectors = [np.array(item.embedding) for item in response.data]
        profile_emb = vectors[0]
        return [_cosine(profile_emb, job_emb) for job_emb in vectors[1:]]
    except Exception as exc:
        logger.warning("OpenAI embedding failed: %s — returning None", exc)
        return None


# ---------------------------------------------------------------------------
# Public interface — called by FilterAgent
# ---------------------------------------------------------------------------

async def embed_and_score(
    profile_text: str,
    job_texts: list[str],
    model_size: str = "small",
) -> list[float] | None:
    """
    Embed profile + jobs and return cosine similarity scores.
    Returns None if the configured backend is unavailable.

    model_size is only used by the local backend ("small" / "large").
    The OpenAI backend always uses text-embedding-3-small regardless.
    """
    if not job_texts:
        return None

    if _BACKEND == "openai":
        return await _embed_openai(profile_text, job_texts)
    return await _embed_local(profile_text, job_texts, model_size)
