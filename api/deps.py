from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession

from db.database import AsyncSessionLocal
from llm.client import LLMClient
from llm.factory import create_llm_client


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


@lru_cache(maxsize=1)
def get_llm() -> LLMClient:
    return create_llm_client()
