import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import httpx
from agents.ats_fetchers import fetch_company_jobs
from agents.company_sources import COMPANY_SOURCES

async def main():
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        for source in COMPANY_SOURCES:
            try:
                jobs = await fetch_company_jobs(client, source)
                print(f"  OK  {source['name']:20s} ({source['ats']:12s}) — {len(jobs)} jobs")
            except Exception as e:
                print(f" FAIL {source['name']:20s} ({source['ats']:12s}) — {e}")

asyncio.run(main())
