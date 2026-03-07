"""
Block and item-level builder endpoints — FROZEN (see ADR-001).
Do not add new endpoints here; use app/transport/http/v1/ instead.

These routes operate on already-existing blocks and items.
The prefix is intentionally absent here; full paths are declared in
each decorator so the router can be included without an extra prefix.
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, require_coach
from app.db.session import get_db
from app.schemas.block_exercise import BlockExerciseCreate, BlockExerciseOut, BlockExerciseUpdate
from app.schemas.workout_block import WorkoutBlockOut, WorkoutBlockUpdate
from app.services import workout_builder_service

router = APIRouter(tags=["workout-builder"])


class ItemsReorderRequest(BaseModel):
    item_ids: list[uuid.UUID]


# ---------------------------------------------------------------------------
# Block operations  (/blocks/...)
# ---------------------------------------------------------------------------

@router.patch(
    "/blocks/{block_id}",
    response_model=WorkoutBlockOut,
    summary="Update a block (Coach only)",
)
def update_block(
    block_id: uuid.UUID,
    data: WorkoutBlockUpdate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    block = workout_builder_service.update_block(db, current_user.team_id, block_id, data)
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    return block


@router.delete(
    "/blocks/{block_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a block and all its items (Coach only)",
)
def delete_block(
    block_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    if not workout_builder_service.delete_block(db, current_user.team_id, block_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")


@router.post(
    "/blocks/{block_id}/items",
    response_model=BlockExerciseOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add an exercise item to a block (Coach only)",
)
def add_item(
    block_id: uuid.UUID,
    data: BlockExerciseCreate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    # Service raises 404 directly if exercise belongs to a different coach
    item = workout_builder_service.add_item(db, current_user.team_id, current_user.user_id, block_id, data)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    return item


@router.put(
    "/blocks/{block_id}/items/reorder",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reorder items in a block (Coach only)",
)
def reorder_items(
    block_id: uuid.UUID,
    body: ItemsReorderRequest,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    if not workout_builder_service.reorder_items(
        db, current_user.team_id, block_id, body.item_ids
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")


# ---------------------------------------------------------------------------
# Item operations  (/block-items/...)
# ---------------------------------------------------------------------------

@router.patch(
    "/block-items/{item_id}",
    response_model=BlockExerciseOut,
    summary="Update an item's prescription (Coach only)",
)
def update_item(
    item_id: uuid.UUID,
    data: BlockExerciseUpdate,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    item = workout_builder_service.update_item(db, current_user.team_id, item_id, data)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block item not found")
    return item


@router.delete(
    "/block-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a block item (Coach only)",
)
def delete_item(
    item_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    if not workout_builder_service.delete_item(db, current_user.team_id, item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block item not found")
