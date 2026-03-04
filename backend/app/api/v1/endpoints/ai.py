"""
AI-assisted workout endpoints.

No coach role required: these are read-only generation endpoints
that do not persist anything to the database.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import CurrentUser, require_coach
from app.db.session import get_db
from app.schemas.ai_template_draft import AiTemplateDraft, AiTemplateDraftRequest
from app.services.ai_template_service import generate_stub_draft, generate_template_draft

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post(
    "/workout-template-draft",
    response_model=AiTemplateDraft,
    summary="Generate an AI workout template draft (no DB write)",
)
def create_template_draft(
    data: AiTemplateDraftRequest,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    cfg = get_settings()
    language = data.language or "en"

    # Stub mode: active whenever AI_STUB=true, regardless of ENV.
    if cfg.AI_STUB:
        draft = generate_stub_draft(
            db=db,
            coach_id=current_user.user_id,
            prompt=data.prompt,
            language=language,
        )
        draft.source = "fallback"
        draft.fallback_reason = "stub_mode"
        return draft

    # Only fall back on transient AI errors (502 upstream / 503 not configured).
    # Auth errors (401/403), validation errors (422), and domain errors must propagate.
    _AI_FALLBACK_CODES = {502, 503}

    _REASON_BY_STATUS = {
        503: "missing_api_key",
        502: "upstream_error",
    }

    try:
        return generate_template_draft(
            db=db,
            coach_id=current_user.user_id,
            prompt=data.prompt,
            language=language,
        )
    except HTTPException as exc:
        if exc.status_code not in _AI_FALLBACK_CODES:
            raise
        logger.warning(
            "AI generation failed (HTTP %s), falling back to stub draft",
            exc.status_code,
            exc_info=True,
        )
        draft = generate_stub_draft(
            db=db,
            coach_id=current_user.user_id,
            prompt=data.prompt,
            language=language,
        )
        draft.source = "fallback"
        draft.fallback_reason = _REASON_BY_STATUS.get(exc.status_code, "upstream_error")
        return draft
