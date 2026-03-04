import uuid
from typing import Optional

from pydantic import BaseModel, Field


class AiTemplateDraftRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    language: Optional[str] = "en"


class SuggestedExercise(BaseModel):
    exercise_id: uuid.UUID
    score: float
    reason: str


class AiBlockDraft(BaseModel):
    name: str
    notes: str
    suggested_exercises: list[SuggestedExercise]


class AiTemplateDraft(BaseModel):
    title: str
    blocks: list[AiBlockDraft]
    source: str = "ai"  # "ai" | "fallback"
    fallback_reason: Optional[str] = None  # e.g. "stub_mode", "upstream_error", "missing_api_key"
