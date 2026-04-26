"""
Test scrape for the 20 new oil & gas sources only.
Run: python scripts/test_oilgas_sources.py

Prints OK / FAIL per company with job count.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import httpx
from agents.ats_fetchers import fetch_company_jobs
from agents.company_sources import COMPANY_SOURCES

OIL_GAS_SECTORS = {"upstream_oil_gas", "oilfield_services"}

NEW_SOURCES = [s for s in COMPANY_SOURCES if s.get("sector") in OIL_GAS_SECTORS]


async def main():
    print(f"\nTesting {len(NEW_SOURCES)} oil & gas sources\n")
    upstream = [s for s in NEW_SOURCES if s.get("sector") == "upstream_oil_gas"]
    services = [s for s in NEW_SOURCES if s.get("sector") == "oilfield_services"]

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for label, group in [("UPSTREAM OIL & GAS", upstream), ("OILFIELD SERVICES", services)]:
            print(f"--- {label} ---")
            for source in group:
                try:
                    jobs = await fetch_company_jobs(client, source)
                    status = "  OK " if jobs else " WARN"
                    host = source.get("workday_host") or source.get("sf_company") or source["ats"]
                    print(f"{status}  {source['name']:30s} ({host}) — {len(jobs)} jobs")
                except Exception as e:
                    print(f" FAIL  {source['name']:30s} — {e}")
            print()


asyncio.run(main())
