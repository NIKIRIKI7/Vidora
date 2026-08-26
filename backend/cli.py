import argparse
import asyncio
import json
from app.services.yt_manager import YouTubeManager


async def main():
    parser = argparse.ArgumentParser(description="Vidora CLI Tools (YouTube research powered by ytscrape)")
    subparsers = parser.add_subparsers(dest="command")

    search_p = subparsers.add_parser("yt-search", help="Поиск 'взлетевших' видео у небольших каналов (без API-ключа)")
    search_p.add_argument("query", type=str, help="Поисковый запрос (например: 'AI agent')")
    search_p.add_argument("--days", type=int, default=30)
    search_p.add_argument("--min-subs", type=int, default=1000)
    search_p.add_argument("--max-subs", type=int, default=90000)
    search_p.add_argument("--min-ratio", type=float, default=1.5, help="Мин. отношение просмотров к подпискам")

    analyze_p = subparsers.add_parser("yt-analyze", help="Скачать метаданные, комментарии и сгенерировать концепт превью")
    analyze_p.add_argument("url", type=str, help="URL YouTube видео")
    analyze_p.add_argument("--out", type=str, default="./downloads", help="Папка для сохранения")
    analyze_p.add_argument("--engine", type=str, default="anthropic/claude-sonnet-5")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    yt = YouTubeManager()

    if args.command == "yt-search":
        print(f"🕵️ Поиск идей по запросу: '{args.query}' (ytscrape)...")
        results = await yt.search_ideas(args.query, args.days, args.min_subs, args.max_subs, args.min_ratio)
        print(f"\nНайдено {len(results)} вирусных видео:\n")
        for r in results:
            print(f"[x{r['ratio']}] {r['views']} views | {r['channel']} ({r['subs']} subs)")
            print(f"    {r['title']}")
            print(f"    {r['url']}\n")

    elif args.command == "yt-analyze":
        print(f"📥 Скачивание данных видео: {args.url}")
        meta = yt.download_meta(args.url, args.out)
        print(f"Сохранено в {args.out}")
        print(f"Видео: {meta['title']} ({meta['channel']})")
        print(f"Транскрипт (начало): {meta['transcript_sample'][:150]}...\n")
        if meta.get("comments_summary"):
            print(f"Боли аудитории из комментариев:\n{meta['comments_summary']}\n")

        print(f"Генерация концепта превью (модель: {args.engine})...")
        concept = await yt.generate_thumbnail_prompt(
            meta["title"] or "Untitled", meta["transcript_sample"], args.engine, {}
        )
        print("КОНЦЕПТ ПРЕВЬЮ:")
        print(json.dumps(concept, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
