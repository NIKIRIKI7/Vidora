"""DTO-схемы для YouTube-аналитики, поиска трендов и генерации сценариев."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class EarlySignalItem(BaseModel):
    id: str
    title: str
    query: str
    vps_score: int = Field(default=0, ge=0, le=100)
    demand_score: float = 0.0
    social_velocity: float = 0.0
    cross_platform_count: int = 1
    source_platform: str = "all"
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    breakout: bool = False
    growth_pct: Optional[str] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    keywords: List[str] = Field(default_factory=list)


class ViralVideoResult(BaseModel):
    video_id: str
    title: str
    channel: str
    channel_id: Optional[str] = ""
    channel_url: Optional[str] = ""
    views: int = 0
    subs: int = 0
    ratio: float = 0.0
    vph: int = 0
    url: str
    thumbnail_url: str = ""
    published_at: str = ""
    keyword_found: str = ""
    duration_sec: int = 0
    is_short: bool = False
    transcript_status: str = "none"
    transcript_sample: str = ""
    comments_summary: str = ""
    vps_score: Optional[int] = None
    social_source_url: Optional[str] = None
    # Momentum Velocity (динамическая производная вирусности)
    m_score: Optional[int] = None
    velocity_stage: Optional[str] = None
    acceleration_pct: Optional[str] = None
    is_rocket: Optional[bool] = None
    engagement_multiplier: Optional[float] = None
    # Blue Ocean 3.0 (качественная аналитика)
    thumbnail_overlay_text: Optional[str] = None
    confusion_index: Optional[float] = None


class MomentumMetrics(BaseModel):
    m_score: int = Field(..., description="Индекс динамического импульса 0-10000+")
    velocity_stage: str = Field(..., description="ROCKET_IGNITION | VIRAL_SURGE | STEADY_CLIMBER | SATURATED_LEGACY")
    acceleration_pct: str = Field(..., description="Оценка ускорения трафика, напр. '+340%'")
    engagement_multiplier: float
    is_rocket: bool


class ConfusionMetrics(BaseModel):
    confusion_index: float = Field(..., ge=0.0, le=1.0)
    status: str = Field(..., description="PSEUDO_RED_DISRUPTIVE | MODERATE_QUALITY_GAP | RED_OCEAN_SATISFIED")
    questions_count: int = 0
    frustrations_count: int = 0
    debates_count: int = 0
    actionable_fix: str = ""


class ThumbnailVisionResult(BaseModel):
    overlay_text: str = ""
    has_overlay: bool = False
    curiosity_gap_type: str = "none"
    visual_tension_summary: str = ""


class ArbitrageOpportunity(BaseModel):
    en_topic: str
    target_lang_topic: str
    arbitrage_score: float = Field(..., ge=0.0, le=100.0)
    status: str = "ARBITRAGE_FIRST_MOVER"
    en_vps_score: int = 0
    actionable_plan: str = ""


class BlueOceanOpportunity(BaseModel):
    topic: str
    opportunity_score: float = Field(..., ge=0.0, le=100.0)
    status: str = Field(
        ...,
        description="BLUE_OCEAN_UNCONTESTED | ARBITRAGE_FIRST_MOVER | PSEUDO_RED_DISRUPTIVE | MODERATE_GAP | RED_OCEAN_SATURATED",
    )
    max_competitor_similarity: float
    competing_videos_count: int
    demand_source: str
    actionable_angle: str
    confusion_index: Optional[float] = None
    thumbnail_insight: Optional[str] = None
    arbitrage_source: Optional[str] = None


class AgentReq(BaseModel):
    query: str
    project_path: str = "projects"
    settings: Dict[str, Any] = Field(default_factory=dict)
    youtube_key: Optional[str] = ""
    llm_engine: Optional[str] = "auto"
    api_keys: Dict[str, Any] = Field(default_factory=dict)


class PromptReq(BaseModel):
    video_title: str
    transcript: str
    engine: Optional[str] = "auto"
    language: Optional[str] = "ru"
    api_keys: Dict[str, Any] = Field(default_factory=dict)


class HookReq(BaseModel):
    transcript: str
    engine: Optional[str] = "auto"
    language: Optional[str] = "ru"
    api_keys: Dict[str, Any] = Field(default_factory=dict)


class DraftReq(BaseModel):
    title: str
    idea_description: str
    channel_context: str = ""
    engine: Optional[str] = "auto"
    language: Optional[str] = "ru"
    api_keys: Dict[str, Any] = Field(default_factory=dict)
    video_type: str = "long"
    target_duration: str = "3"
    custom_prompt: str = ""
    audio_engine: str = ""
    audience_comments: str = ""


class CommentsReq(BaseModel):
    video_id: str
    max_comments: int = 20


class MoreVideosReq(BaseModel):
    query: str
    exclude_video_ids: List[str] = Field(default_factory=list)
    settings: Dict[str, Any] = Field(default_factory=dict)
    language: Optional[str] = "en"
    youtube_key: Optional[str] = ""
    api_keys: Dict[str, Any] = Field(default_factory=dict)


class SuggestCompetitorsReq(BaseModel):
    niche: str
    engine: Optional[str] = "auto"
    language: Optional[str] = "ru"
    api_keys: Dict[str, Any] = Field(default_factory=dict)


class AnalyzeChannelReq(BaseModel):
    url_or_name: str
    engine: Optional[str] = "auto"
    language: Optional[str] = "ru"
    youtube_key: Optional[str] = ""
    api_keys: Dict[str, Any] = Field(default_factory=dict)


class PsychologyProfile(BaseModel):
    viewer_fear: str = ""
    viewer_aspiration: str = ""
    skepticism_barrier: str = ""


class ScriptHookStage(BaseModel):
    spoken: str = ""
    visual_cues: str = ""


class BestConceptScript(BaseModel):
    concept_id: str = "A"
    hook_0_5s: ScriptHookStage = Field(default_factory=ScriptHookStage)
    stakes_5_20s: ScriptHookStage = Field(default_factory=ScriptHookStage)
    open_loop_20_45s: ScriptHookStage = Field(default_factory=ScriptHookStage)


class TimestampChapter(BaseModel):
    time: str
    label: str


class SeoMetadata(BaseModel):
    primary_keyword: str = ""
    description_above_fold: str = ""
    description_body: str = ""
    timestamps: List[TimestampChapter] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    pinned_comment: str = ""


class IdeaPackageItem(BaseModel):
    concept_id: Optional[str] = "A"
    angle_type: Optional[str] = "Contrarian"
    titles: List[str] = Field(default_factory=list)
    thumbnail_visual: Optional[str] = ""
    thumbnail_overlay: Optional[str] = ""
    description: str = ""
    psychological_hook: str = ""


class ViewerPainItem(BaseModel):
    category: str = Field(..., description="question | omission | debate")
    viewer_quote: str = Field(..., description="Реплика зрителя")
    likes: int = 0
    insight: str = Field(..., description="Суть непонимания или спора")
    script_solution: str = Field(..., description="Ответ для сценария")


class CommentGoldmineReport(BaseModel):
    unresolved_questions: List[ViewerPainItem] = Field(default_factory=list)
    author_omissions: List[ViewerPainItem] = Field(default_factory=list)
    community_debates: List[ViewerPainItem] = Field(default_factory=list)
    script_counter_theses: List[str] = Field(default_factory=list)


class CommentGoldmineVideoEntry(BaseModel):
    video_title: str
    report: CommentGoldmineReport


class DeepTrendAnalysis(BaseModel):
    psychology: Optional[PsychologyProfile] = None
    ideas: List[IdeaPackageItem] = Field(default_factory=list)
    best_concept_script: Optional[BestConceptScript] = None
    seo: Optional[SeoMetadata] = None
    blue_ocean_gaps: Optional[List[BlueOceanOpportunity]] = None
    comment_goldmine: Optional[List[CommentGoldmineVideoEntry]] = None
    conclusions: List[str] = Field(default_factory=list)
    debug_notes: List[str] = Field(default_factory=list)
