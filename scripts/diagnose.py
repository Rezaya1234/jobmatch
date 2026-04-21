import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from db.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as s:
        rows = await s.execute(text("SELECT COUNT(*) FROM jobs WHERE is_active = true"))
        print(f"Active jobs:              {rows.scalar()}")

        rows = await s.execute(text("SELECT COUNT(*) FROM job_matches"))
        print(f"Total job_match rows:     {rows.scalar()}")

        rows = await s.execute(text("""
            SELECT COUNT(*) FROM job_matches jm
            JOIN jobs j ON j.id = jm.job_id
            WHERE j.is_active = true AND jm.passed_hard_filter = true
        """))
        print(f"Passed filter (active):   {rows.scalar()}")

        rows = await s.execute(text("""
            SELECT COUNT(*) FROM job_matches jm
            JOIN jobs j ON j.id = jm.job_id
            WHERE j.is_active = true AND jm.passed_hard_filter = false
        """))
        print(f"Failed filter (active):   {rows.scalar()}")

        print()
        print("--- Profile constraints ---")
        rows = await s.execute(text("SELECT work_modes, job_types, locations, preferred_companies FROM user_profiles LIMIT 1"))
        for r in rows:
            print(f"  work_modes:   {r[0]}")
            print(f"  job_types:    {r[1]}")
            print(f"  locations:    {r[2]}")
            print(f"  companies:    {r[3]}")

        print()
        print("--- Score distribution ---")
        rows = await s.execute(text("""
            SELECT COUNT(*) FROM job_matches jm
            JOIN jobs j ON j.id = jm.job_id
            WHERE j.is_active = true AND jm.passed_hard_filter = true AND jm.score IS NOT NULL
        """))
        print(f"Scored (not null):        {rows.scalar()}")

        rows = await s.execute(text("""
            SELECT COUNT(*) FROM job_matches jm
            JOIN jobs j ON j.id = jm.job_id
            WHERE j.is_active = true AND jm.passed_hard_filter = true AND jm.score >= 0.5
        """))
        print(f"Score >= 50%:             {rows.scalar()}")

        rows = await s.execute(text("""
            SELECT COUNT(*) FROM job_matches jm
            JOIN jobs j ON j.id = jm.job_id
            WHERE j.is_active = true AND jm.passed_hard_filter = true AND jm.score >= 0.8
        """))
        print(f"Score >= 80%:             {rows.scalar()}")

        print()
        print("--- Sample scored jobs ---")
        rows = await s.execute(text("""
            SELECT j.title, j.company, jm.score, jm.user_id
            FROM job_matches jm
            JOIN jobs j ON j.id = jm.job_id
            WHERE j.is_active = true AND jm.passed_hard_filter = true AND jm.score IS NOT NULL
            ORDER BY jm.score DESC
            LIMIT 5
        """))
        for r in rows:
            print(f"  [{r[2]:.2f}] {r[1]} — {r[0]} (user: {r[3]})")

asyncio.run(main())
