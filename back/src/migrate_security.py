"""One-off migration helpers for security hardening.

Run once after deploying the security patches to:
1. Add the ``expires_at`` column to ``user_session`` if it's missing.
2. Optionally rehash any plaintext passwords already in the ``users`` table.

Usage from the ``back/`` directory (with env vars DB_HOST/DB_USER/DB_PASSWORD set)::

    python src/migrate_security.py

The password rehash is also performed transparently on next successful login,
so running this script is not strictly required — it just front-loads the work
and expires any dangling sessions.
"""
import asyncio
import os
import sys

import asyncpg  # comes in transitively via quart-db

sys.path.insert(0, os.path.dirname(__file__))
import persistence  # noqa: E402 -- imports bcrypt helpers


DB_DSN = (
    f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}/robotito"
)


async def add_expires_at_column(conn):
    await conn.execute(
        "ALTER TABLE user_session ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP"
    )
    print("[migrate] user_session.expires_at ensured")


async def rehash_plaintext_passwords(conn):
    rows = await conn.fetch("SELECT user_id, password FROM users")
    upgraded = 0
    for row in rows:
        stored = row["password"] or ""
        if persistence._is_bcrypt_hash(stored):
            continue
        new_hash = persistence.hash_password(stored)
        await conn.execute(
            "UPDATE users SET password = $1 WHERE user_id = $2",
            new_hash, row["user_id"],
        )
        upgraded += 1
    print(f"[migrate] rehashed {upgraded} plaintext password(s)")


async def main():
    conn = await asyncpg.connect(DB_DSN)
    try:
        await add_expires_at_column(conn)
        await rehash_plaintext_passwords(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
