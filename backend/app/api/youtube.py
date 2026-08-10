import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any

from app.services.yt_manager import YouTubeManager
from app.services.yt_agent import YouTubeIdeaAgent
from app.services.thumbnail_engine import ThumbnailPromptEngine

router = APIRouter(prefix="/api/v1/youtube", tags=["youtube"])
yt_manager = YouTubeManager()
thumb_engine = ThumbnailPromptEngine()

class AgentReq(BaseModel):
    query: str
    project_path: str
    settings: Dict[str, Any]
    youtube_key: str = ""
    llm_engine: str = "gemma3:1b"
    api_keys: dict = {}

class PromptReq(BaseModel):
    video_title: str
    transcript: str
    engine: str
    api_keys: dict

class HookReq(BaseModel):
    transcript: str
    engine: str
    api_keys: dict

class DraftReq(BaseModel):
    title: str
    idea_description: str
    channel_context: str
    engine: str
    api_keys: dict

class SuggestCompetitorsReq(BaseModel):
    niche: str
    engine: str
    api_keys: dict

@router.post("/agent/stream")
async def stream_agent_ideas(req: AgentReq):
    try:
        agent = YouTubeIdeaAgent(llm_engine=req.llm_engine, api_key=req.youtube_key, api_keys=req.api_keys)
        return StreamingResponse(agent.run_pipeline(req.query, req.settings, req.project_path), media_type="application/x-ndjson")
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/agent/analyze-hook")
async def analyze_hook(req: HookReq):
    try:
        agent = YouTubeIdeaAgent(llm_engine=req.engine, api_keys=req.api_keys)
        res = await agent.analyze_hook(req.transcript)
        return {"status": "ok", "data": res}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/agent/draft-script")
async def draft_script(req: DraftReq):
    try:
        agent = YouTubeIdeaAgent(llm_engine=req.engine, api_keys=req.api_keys)
        res = await agent.draft_script(req.title, req.idea_description, req.channel_context)
        return {"status": "ok", "markdown": res}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/agent/suggest-competitors")
async def suggest_competitors(req: SuggestCompetitorsReq):
    try:
        agent = YouTubeIdeaAgent(llm_engine=req.engine, api_keys=req.api_keys)
        res = await agent.suggest_competitors(req.niche)
        return {"status": "ok", "channels": res.get("channels", [])}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/download-meta")
async def download_meta(req: dict):
    try:
        out_dir = f"{req['project_path']}/assets/refs"
        loop = asyncio.get_running_loop()
        res = await loop.run_in_executor(None, yt_manager.download_meta, req['url'], out_dir)
        return {"status": "ok", "data": res}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/thumbnail-prompt")
async def generate_thumb_prompt(req: PromptReq):
    try:
        concept = await thumb_engine.generate_concept(req.video_title, req.transcript, req.engine, req.api_keys)
        return {"status": "ok", "concept": concept}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))