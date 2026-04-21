import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from db.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as session:
        result = await session.execute(text(
            "DELETE FROM job_matches WHERE job_id IN (SELECT id FROM jobs WHERE is_active = true)"
        ))
        await session.commit()
        print(f"Deleted {result.rowcount} job_match rows for active jobs.")

asyncio.run(main())
