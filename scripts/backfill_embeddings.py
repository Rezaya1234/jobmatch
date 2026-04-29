"""
One-time backfill: embed all active jobs that have no embedding_vector.
Run from project root: python scripts/backfill_embeddings.py

Cost estimate: ~6700 jobs × 250 tokens avg × $0.02/1M tokens ≈ $0.034
"""
import asyncio
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import numpy as np
from openai import AsyncOpenAI
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from db.models import Job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)

BATCH_SIZE = 100          # jobs per OpenAI request (API supports up to 2048)
INTER_BATCH_SLEEP = 1.0   # seconds between batches — stay under rate limit
COST_PER_TOKEN = 0.02 / 1_000_000
MODEL = "text-embedding-3-small"


async def _embed_batch(client: AsyncOpenAI, texts: list[str], retries: int = 5) -> list[list[float] | None]:
    """Embed a batch of texts in one API call. Returns None for each slot on unrecoverable failure."""
    delay = 2.0
    for attempt in range(retries):
        try:
            response = await client.embeddings.create(model=MODEL, input=texts)
            results = []
            for item in response.data:
                arr = np.array(item.embedding, dtype=np.float32)
                norm = np.linalg.norm(arr)
                if norm > 0:
                    arr = arr / norm
                results.append(arr.tolist())
            return results
        except Exception as exc:
            msg = str(exc)
            if "429" in msg or "rate_limit" in msg.lower():
                logger.warning("Rate limited — waiting %.0fs (attempt %d/%d)", delay, attempt + 1, retries)
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)
            else:
                logger.error("Embedding batch failed: %s", exc)
                return [None] * len(texts)
    logger.error("Batch failed after %d retries", retries)
    return [None] * len(texts)


async def backfill() -> None:
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")

    client = AsyncOpenAI(api_key=api_key)
    engine = create_async_engine(db_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        total_result = await session.execute(
            select(func.count()).select_from(Job).where(
                Job.is_active.is_(True),
                Job.embedding_vector.is_(None),
            )
        )
        total = total_result.scalar() or 0
        logger.info("Jobs needing embeddings: %d", total)

        if total == 0:
            logger.info("Nothing to backfill — all active jobs already have embeddings.")
            return

        embedded = 0
        failed = 0
        total_chars = 0
        start = time.time()
        failed_ids: set = set()

        while True:
            # Always query from offset 0 — successfully embedded rows drop out of the WHERE clause
            result = await session.execute(
                select(Job)
                .where(
                    Job.is_active.is_(True),
                    Job.embedding_vector.is_(None),
                    Job.id.not_in(failed_ids) if failed_ids else True,
                )
                .order_by(Job.scraped_at.asc())
                .limit(BATCH_SIZE)
            )
            jobs = list(result.scalars().all())
            if not jobs:
                break

            texts = [f"{job.title}. {(job.description or '')[:500]}" for job in jobs]
            total_chars += sum(len(t) for t in texts)

            vectors = await _embed_batch(client, texts)

            for job, vector in zip(jobs, vectors):
                if vector is not None:
                    await session.execute(
                        update(Job).where(Job.id == job.id).values(embedding_vector=vector)
                    )
                    embedded += 1
                else:
                    failed_ids.add(job.id)
                    failed += 1

            await session.commit()

            elapsed = time.time() - start
            logger.info(
                "Progress: %d/%d embedded, %d failed — %.1fs elapsed",
                embedded, total, failed, elapsed,
            )

            if len(jobs) < BATCH_SIZE:
                break  # last partial batch

            await asyncio.sleep(INTER_BATCH_SLEEP)

        elapsed = time.time() - start
        estimated_tokens = total_chars * 0.75
        estimated_cost = estimated_tokens * COST_PER_TOKEN

        logger.info("=" * 60)
        logger.info("Backfill complete")
        logger.info("  Embedded:  %d jobs", embedded)
        logger.info("  Failed:    %d jobs", failed)
        logger.info("  Time:      %.1fs", elapsed)
        logger.info("  Est. cost: $%.4f", estimated_cost)
        logger.info("=" * 60)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(backfill())
