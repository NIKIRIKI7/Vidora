import os
from typing import List, Dict, Any
from app.services.yt_searcher import YouTubeSearcher
from app.services.yt_parser import YouTubeParser
from app.services.thumbnail_engine import ThumbnailPromptEngine

class YouTubeManager:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("YOUTUBE_API_KEY", "")
        self.thumb_engine = ThumbnailPromptEngine()

    async def search_ideas(
        self,
        query: str,
        days_back: int = 7,
        min_subs: int = 1000,
        max_subs: int = 100000,
        min_ratio: float = 1.0,
        language: str = "en"
    ) -> List[Dict[str, Any]]:
        return await YouTubeSearcher.search_viral_videos(
            queries=[query],
            days_back=days_back,
            min_subs=min_subs,
            max_subs=max_subs,
            min_ratio=min_ratio,
            api_key=self.api_key,
            language=language
        )

    def download_meta(self, video_url: str, output_dir: str, lang: str = "ru") -> Dict[str, Any]:
        return YouTubeParser.download_metadata_and_subs(video_url=video_url, output_dir=output_dir, lang=lang)

    async def generate_thumbnail_prompt(self, video_title: str, transcript: str, engine: str, api_keys: dict) -> Dict[str, Any]:
        return await self.thumb_engine.generate_concept(video_title, transcript, engine, api_keys)
