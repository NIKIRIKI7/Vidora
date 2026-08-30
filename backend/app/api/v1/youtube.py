"""Контроллер YouTube-исследований, драфтинга сценариев и упаковки превью."""

from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_youtube_service
from app.domain.schemas.youtube import (
    AgentReq,
    AnalyzeChannelReq,
    CommentsReq,
    DraftReq,
    HookReq,
    MoreVideosReq,
    PromptReq,
    SuggestCompetitorsReq,
)
from app.infrastructure.storage.path_resolver import PathResolver
from app.services.youtube_service import YouTubeService

router = APIRouter(prefix="/youtube", tags=["YouTube Research & Agent"])


@router.post("/agent/stream")
async def stream_agent_ideas(
        req: AgentReq,
        service: YouTubeService = Depends(get_youtube_service),
) -> StreamingResponse:
    return StreamingResponse(
        service.stream_agent_ideas(req),
        media_type="application/x-ndjson",
    )


@router.post("/agent/analyze-hook")
async def analyze_hook(
        req: HookReq,
        service: YouTubeService = Depends(get_youtube_service),
) -> dict:
    res = await service.analyze_hook(req)
    return {"status": "ok", "data": res}


@router.post("/agent/draft-script")
async def draft_script(
        req: DraftReq,
        service: YouTubeService = Depends(get_youtube_service),
) -> dict:
    markdown = await service.draft_script(req)
    return {"status": "ok", "markdown": markdown}


@router.post("/comments")
async def get_comments(
        req: CommentsReq,
        service: YouTubeService = Depends(get_youtube_service),
) -> dict:
    comments = await service.get_video_comments(req)
    return {"status": "ok", "comments": comments}


@router.post("/more-videos")
async def get_more_videos(
        req: MoreVideosReq,
        service: YouTubeService = Depends(get_youtube_service),
) -> dict:
    results = await service.search_more_videos(req)
    return {"status": "ok", "results": results}


@router.post("/agent/suggest-competitors")
async def suggest_competitors(
        req: SuggestCompetitorsReq,
        service: YouTubeService = Depends(get_youtube_service),
) -> dict:
    res = await service.suggest_competitors(req)
    return {"status": "ok", "channels": res.get("channels", [])}


@router.post("/agent/analyze-channel")
async def analyze_channel(
        req: AnalyzeChannelReq,
        service: YouTubeService = Depends(get_youtube_service),
) -> dict:
    res = await service.analyze_channel(req)
    return {"status": "ok", "context": res.get("context", "")}


@router.post("/download-meta")
async def download_meta(
        req: dict,
        service: YouTubeService = Depends(get_youtube_service),
) -> dict:
    raw_proj = req.get("project_path", "projects")
    proj_dir = PathResolver.resolve(raw_proj) or Path(raw_proj)
    out_dir = str(proj_dir / "assets" / "refs")

    res = await service.download_metadata(req["url"], out_dir, req.get("lang", "ru"))
    return {"status": "ok", "data": res}


@router.post("/thumbnail-prompt")
async def generate_thumb_prompt(
        req: PromptReq,
        service: YouTubeService = Depends(get_youtube_service),
) -> dict:
    concept = await service.generate_thumbnail_prompt(req)
    return {"status": "ok", "concept": concept}
