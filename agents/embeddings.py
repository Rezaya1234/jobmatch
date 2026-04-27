"""
Lazy-loaded BGE embedding models for candidate filtering.
Models are downloaded on first use and kept in memory for the process lifetime.
If sentence-transformers is not installed, all functions return None gracefully.
"""
import asyncio
import logging
from functools import lru_cache

import numpy as np

logger = logging.getLogger(__name__)

_PREFIX = "Represent this for job matching: "

try:
    from sentence_transformers import SentenceTransformer
    _AVAILABLE = True
except ImportError:
    _AVAILABLE = False
    logger.warning("sentence-transformers not installed — embedding stage will be skipped")


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


async def embed_and_score(
    profile_text: str,
    job_texts: list[str],
    model_size: str = "small",
) -> list[float] | None:
    """
    Embed profile + jobs and return cosine similarity scores.
    Returns None if sentence-transformers is unavailable.
    Runs in a thread pool to avoid blocking the async event loop.
    """
    if not _AVAILABLE or not job_texts:
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
