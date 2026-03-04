"""
WorkoutTemplate CRUD endpoints + block-level builder operations
that are nested under a template URL.

Prefix: /workout-templates
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, get_current_user, require_coach
from app.db.session import get_db
from app.schemas.workout_block import WorkoutBlockCreate, WorkoutBlockOut
from app.schemas.workout_template import (
    WorkoutTemplateCreate,
    WorkoutTemplateOut,
    WorkoutTemplateUpdate,
)
from app.schemas.workout_template_detail import WorkoutTemplateDetailOut
from app.services import workout_builder_service, workout_templates_service

router = APIRouter(prefix="/workout-templates", tags=["workout-templates"])


class BlocksReorderRequest(BaseModel):
    block_ids: list[uuid.UUID]


# ---------------------------------------------------------------------------
# Template CRUD
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=WorkoutTemplateOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a workout template (Coach only)",
)
def create_template(
    data: WorkoutTemplateCreate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        return workout_templates_service.create_template(db, current_user.team_id, data)
    except IntegrityError as exc:
        db.rollback()
        if exc.orig and "uix_templates_team_title" in str(exc.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A template named '{data.title}' already exists in this team.",
            )
        raise


@router.get(
    "",
    response_model=list[WorkoutTemplateOut],
    summary="List workout templates",
)
def list_templates(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return workout_templates_service.list_templates(db, current_user.team_id)


@router.get(
    "/{template_id}",
    response_model=WorkoutTemplateDetailOut,
    summary="Get template with all blocks and items",
)
def get_template(
    template_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    template = workout_templates_service.get_template_detail(
        db, current_user.team_id, template_id
    )
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout template not found")
    return template


@router.patch(
    "/{template_id}",
    response_model=WorkoutTemplateOut,
    summary="Update a workout template (Coach only)",
)
def update_template(
    template_id: uuid.UUID,
    data: WorkoutTemplateUpdate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    # Pre-validate content requirements when publishing.
    # Idempotent: publishing an already-published template succeeds without error.
    if data.status == "published":
        detail = workout_templates_service.get_template_detail(
            db, current_user.team_id, template_id
        )
        if not detail:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workout template not found",
            )
        if not detail.blocks:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Template must have at least one block before publishing",
            )
        if not any(block.items for block in detail.blocks):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Template must have at least one exercise before publishing",
            )
        for block in detail.blocks:
            for item in block.items:
                if not item.prescription_json.get("sets"):
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Each exercise must have at least one set before publishing",
                    )

    try:
        template = workout_templates_service.update_template(
            db, current_user.team_id, template_id, data
        )
    except IntegrityError as exc:
        db.rollback()
        if exc.orig and "uix_templates_team_title" in str(exc.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A template named '{data.title}' already exists in this team.",
            )
        raise
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout template not found")
    return template


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a workout template (Coach only)",
)
def delete_template(
    template_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    if not workout_templates_service.delete_template(db, current_user.team_id, template_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout template not found")


# ---------------------------------------------------------------------------
# Block operations nested under a template
# ---------------------------------------------------------------------------

@router.post(
    "/{template_id}/blocks",
    response_model=WorkoutBlockOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a block to a template (Coach only)",
)
def add_block(
    template_id: uuid.UUID,
    data: WorkoutBlockCreate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    block = workout_builder_service.add_block(db, current_user.team_id, template_id, data)
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout template not found")
    return block


@router.put(
    "/{template_id}/blocks/reorder",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reorder blocks in a template (Coach only)",
)
def reorder_blocks(
    template_id: uuid.UUID,
    body: BlocksReorderRequest,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    if not workout_builder_service.reorder_blocks(
        db, current_user.team_id, template_id, body.block_ids
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout template not found")
