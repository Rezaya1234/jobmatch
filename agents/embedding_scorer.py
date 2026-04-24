"""
Embedding-based similarity using sentence-transformers (all-MiniLM-L6-v2).
Lazy-loaded on first use. Falls back to neutral 0.7 if model unavailable.
"""
import asyncio
import logging

import numpy as np

logger = logging.getLogger(__name__)

_MODEL = None
_MODEL_NAME = "all-MiniLM-L6-v2"
SIMILARITY_THRESHOLD = 0.65


def _load_model():
    global _MODEL
    if _MODEL is None:
        try:
            from sentence_transformers import SentenceTransformer
            _MODEL = SentenceTransformer(_MODEL_NAME)
            logger.info("Embedding model loaded: %s", _MODEL_NAME)
        except ImportError:
            logger.warning("sentence-transformers not installed — embedding scoring disabled")
        except Exception:
            logger.exception("Failed to load embedding model — embedding scoring disabled")
    return _MODEL


def _run_similarity(job_texts: list[str], profile_text: str) -> list[float]:
    model = _load_model()
    if model is None:
        return [0.7] * len(job_texts)
    all_texts = job_texts + [profile_text]
    embeddings = model.encode(all_texts, show_progress_bar=False, batch_size=32)
    query_emb = embeddings[-1]
    scores = []
    for emb in embeddings[:-1]:
        norm = float(np.linalg.norm(emb) * np.linalg.norm(query_emb))
        scores.append(float(np.dot(emb, query_emb)) / norm if norm > 0 else 0.0)
    return scores


async def compute_embedding_scores(job_texts: list[str], profile_text: str) -> list[float]:
    """Async wrapper — runs model in thread to avoid blocking the event loop."""
    if not job_texts or not profile_text:
        return [0.7] * len(job_texts)
    return await asyncio.to_thread(_run_similarity, job_texts, profile_text)
