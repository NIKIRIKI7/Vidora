"""Точка входа CLI утилиты Vidora."""

import asyncio

from app.cli.commands import run_cli

if __name__ == "__main__":
    asyncio.run(run_cli())
