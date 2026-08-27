"""Логика CLI-команд для работы с YouTube и исследованиями."""

import argparse
import json

from app.core.config import settings
from app.domain.schemas.youtube import PromptReq
from app.services.youtube_service import YouTubeService


async def run_cli():
    parser = argparse.ArgumentParser(description="Vidora CLI Tools (YouTube research)")
    subparsers = parser.add_subparsers(dest="command")

    search_p = subparsers.add_parser("yt-search", help="Поиск вирусных видео у небольших каналов")
    search_p.add_argument("query", type=str, help="Поисковый запрос")
    search_p.add_argument("--days", type=int, default=30)
    search_p.add_argument("--min-subs", type=int, default=1000)
    search_p.add_argument("--max-subs", type=int, default=90000)
    search_p.add_argument("--min-ratio", type=float, default=1.5)

    analyze_p = subparsers.add_parser("yt-analyze", help="Скачать метаданные и сгенерировать концепт превью")
    analyze_p.add_argument("url", type=str, help="URL YouTube видео")
    analyze_p.add_argument("--out", type=str, default=str(settings.PROJECTS_DIR / "refs"))
    analyze_p.add_argument("--engine", type=str, default="anthropic/claude-sonnet-5")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    yt = YouTubeService()

    if args.command == "yt-search":
        print(f"🔍 Поиск вирусных идей: '{args.query}'...")
        results = await yt.search_ideas(
            query=args.query,
            days_back=args.days,
            min_subs=args.min_subs,
            max_subs=args.max_subs,
            min_ratio=args.min_ratio,
        )
        print(f"\nНайдено {len(results)} видео:\n")
        for r in results:
            print(
                f"[x{r['ratio']}] {r['views']} views | {r['channel']} ({r['subs']} subs)\n {r['title']}\n {r['url']}\n")

    elif args.command == "yt-analyze":
        print(f"📥 Скачивание метаданных: {args.url}")
        meta = await yt.download_metadata(args.url, args.out)
        print(f"Сохранено в {args.out}\nВидео: {meta['title']} ({meta['channel']})\n")

        prompt_req = PromptReq(
            video_title=meta["title"] or "Untitled",
            transcript=meta["transcript_sample"],
            engine=args.engine,
            api_keys={},
        )
        concept = await yt.generate_thumbnail_prompt(prompt_req)
        print("КОНЦЕПТ ПРЕВЬЮ:\n", json.dumps(concept, indent=2, ensure_ascii=False))
