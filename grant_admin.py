import asyncio
import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine


async def run():
    raw = os.getenv("DATABASE_URL", "")
    url = raw.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(url)
    async with AsyncSession(engine) as s:
        await s.execute(text("UPDATE users SET role = 'admin' WHERE email = 'reza.rah@gmail.com'"))
        await s.commit()
    print("done")


asyncio.run(run())
