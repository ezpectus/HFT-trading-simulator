#!/usr/bin/env python3
"""Run database migrations.

Usage: python scripts/migrate.py [--up] [--down N]
"""

import asyncio
import argparse
import sys
import os
import glob

_bot_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _bot_root not in sys.path:
    sys.path.insert(0, _bot_root)

from src.utils.helpers import setup_logging, get_env

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "src", "database", "migrations")


async def run_migrations(args):
    """Run database migrations."""
    logger = setup_logging(level="INFO")

    try:
        import asyncpg
    except ImportError:
        logger.error("asyncpg not installed. Run: pip install asyncpg")
        sys.exit(1)

    db_url = get_env("DATABASE_URL", "postgresql://hft:hft@localhost:5432/hft")
    logger.info(f"Connecting to database...")

    conn = await asyncpg.connect(db_url)

    # Create migrations tracking table
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Get applied migrations
    applied = set()
    rows = await conn.fetch("SELECT filename FROM schema_migrations")
    for row in rows:
        applied.add(row["filename"])

    # Find and apply pending migrations
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))

    if not migration_files:
        logger.info("No migration files found.")
        await conn.close()
        return

    applied_count = 0
    for filepath in migration_files:
        filename = os.path.basename(filepath)
        if filename in applied:
            logger.info(f"  Skip (already applied): {filename}")
            continue

        logger.info(f"  Applying: {filename}")
        with open(filepath, "r") as f:
            sql = f.read()

        try:
            await conn.execute(sql)
            await conn.execute(
                "INSERT INTO schema_migrations (filename) VALUES ($1)",
                filename
            )
            applied_count += 1
            logger.info(f"  Done: {filename}")
        except Exception as e:
            logger.error(f"  Failed: {filename}: {e}")
            break

    logger.info(f"Migrations complete: {applied_count} applied, {len(applied)} already up")
    await conn.close()


def main():
    parser = argparse.ArgumentParser(description="Database migration runner")
    parser.add_argument("--up", action="store_true", help="Run pending migrations")
    args = parser.parse_args()

    try:
        asyncio.run(run_migrations(args))
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
