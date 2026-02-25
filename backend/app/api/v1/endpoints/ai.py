"""
AI-assisted workout endpoints.

No coach role required: these are read-only generation endpoints
that do not persist anything to the database.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.ai_template_draft import AiTemplateDraft, AiTemplateDraftRequest
from app.services.ai_template_service import generate_stub_draft, generate_template_draft

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post(
    "/workout-template-draft",
    response_model=AiTemplateDraft,
    summary="Generate an AI workout template draft (no DB write)",
)
def create_template_draft(
    data: AiTemplateDraftRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    cfg = get_settings()

    # Stub mode: only active in local dev AND when explicitly opted-in.
    # The double guard (ENV + flag) prevents accidental activation in
    # staging/production even if AI_STUB leaks into the environment.
    if cfg.ENV == "local" and cfg.AI_STUB:
        return generate_stub_draft(
            db=db,
            team_id=current_user.team_id,
            prompt=data.prompt,
            language=data.language or "en",
        )

    return generate_template_draft(
        db=db,
        team_id=current_user.team_id,
        prompt=data.prompt,
        language=data.language or "en",
    )
