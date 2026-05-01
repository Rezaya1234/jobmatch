"""
One-time setup: ensure the admin account has a password and is fully verified.

Usage (interactive):
    python scripts/setup_admin.py

Usage (non-interactive, e.g. Render one-off command):
    ADMIN_EMAIL=reza.rah@gmail.com ADMIN_PASSWORD=<secret> python scripts/setup_admin.py
"""
import asyncio
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
from sqlalchemy import select

from db.database import AsyncSessionLocal
from db.models import User


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", "reza.rah@gmail.com").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD", "").strip()

    if not password:
        print(f"Setting up admin account for: {email}")
        password = getpass.getpass("Enter new admin password (min 8 chars): ").strip()
        confirm  = getpass.getpass("Confirm password: ").strip()
        if password != confirm:
            print("Passwords do not match. Aborted.")
            sys.exit(1)

    if len(password) < 8:
        print("Password must be at least 8 characters. Aborted.")
        sys.exit(1)

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None:
            print(f"No user found with email: {email}")
            print("Create the account via /signup first, then re-run this script.")
            sys.exit(1)

        user.role           = "admin"
        user.email_verified = True
        user.password_hash  = password_hash
        user.verification_token            = None
        user.verification_token_expires_at = None
        await session.commit()

    print(f"Done — {email} is now admin with a verified email and password set.")


if __name__ == "__main__":
    asyncio.run(main())
