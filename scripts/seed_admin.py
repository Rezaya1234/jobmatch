"""
Promote (or revoke) admin access for a user by email.

Usage:
    python scripts/seed_admin.py reza@example.com
    python scripts/seed_admin.py reza@example.com --revoke
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from db.database import AsyncSessionLocal
from db.models import User
from sqlalchemy import select


async def main(email: str, revoke: bool = False) -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user:
            print(f"No user found with email: {email}")
            sys.exit(1)

        action = "REVOKE" if revoke else "GRANT"
        print(f"User found: id={user.id}, email={user.email}, is_admin={user.is_admin}")
        confirm = input(f"{action} admin for {email}? [y/N] ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            sys.exit(0)

        user.is_admin = not revoke
        await session.commit()
        print(f"Done — is_admin={user.is_admin} for {email}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/seed_admin.py <email> [--revoke]")
        sys.exit(1)

    email_arg = sys.argv[1]
    revoke_flag = "--revoke" in sys.argv
    asyncio.run(main(email_arg, revoke_flag))
