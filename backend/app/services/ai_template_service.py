"""
AI-assisted workout template draft generation.

Architectural contract:
- BASE_BLOCKS defines the fixed block structure (order + names are immutable).
- The LLM only generates: title + one intent string per block.
- This service performs exercise matching (keyword overlap, no LLM).
- Nothing is persisted; the result is returned directly to the caller.
"""
import re
import uuid
from typing import Optional

from fastapi import HTTPException, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import ai_client
from app.models.exercise import Exercise
from app.schemas.ai_template_draft import AiBlockDraft, AiTemplateDraft, SuggestedExercise

# ---------------------------------------------------------------------------
# Fixed structural framework — order and names are canonical and immutable.
# ---------------------------------------------------------------------------

BASE_BLOCKS: list[str] = [
    "Preparation to Movement",
    "Plyometrics",
    "Primary Strength",
    "Secondary Strength",
    "Auxiliary Strength",
    "Recovery",           # always last
]

# ---------------------------------------------------------------------------
# LLM prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are an expert sports performance coach assistant.
Analyze the user's workout request and return a JSON object with this exact structure:

{{
  "title": "<short, descriptive workout title>",
  "block_intents": {{
    "Preparation to Movement": "<brief coach notes for this block>",
    "Plyometrics": "<brief coach notes>",
    "Primary Strength": "<brief coach notes>",
    "Secondary Strength": "<brief coach notes>",
    "Auxiliary Strength": "<brief coach notes>",
    "Recovery": "<brief coach notes>"
  }}
}}

CRITICAL rules:
- Return ONLY the JSON object above — no markdown, no extra text.
- Do NOT rename, reorder, add, or remove any block.
- Block names must match the keys above exactly.
- Respond in {language}.
"""

# ---------------------------------------------------------------------------
# Internal: LLM response shape
# ---------------------------------------------------------------------------


class _LlmResponse(BaseModel):
    title: str
    block_intents: dict[str, str]


# ---------------------------------------------------------------------------
# Internal: exercise matching (pure Python, no LLM)
# ---------------------------------------------------------------------------


def _tokenize(text: Optional[str]) -> set[str]:
    """Extract lowercase word tokens, including accented characters."""
    if not text:
        return set()
    return set(re.findall(r"\w+", text.lower()))


def _score(intent_tokens: set[str], exercise: Exercise) -> float:
    """
    Keyword-overlap score, normalised to [0, 1].

    Score = |intent ∩ exercise_tokens| / |intent_tokens|

    Uses the union of name + tags + description as the exercise
    vocabulary so that any token appearing in any field can match.
    """
    if not intent_tokens:
        return 0.0

    exercise_vocab = _tokenize(
        " ".join(
            filter(None, [exercise.name, exercise.tags or "", exercise.description or ""])
        )
    )

    overlap = intent_tokens & exercise_vocab
    return round(len(overlap) / len(intent_tokens), 4)


def _match_exercises(
    intent_text: str,
    exercises: list[Exercise],
    top_n: int = 5,
) -> list[SuggestedExercise]:
    """Return the top-N exercises most relevant to intent_text."""
    intent_tokens = _tokenize(intent_text)
    results: list[SuggestedExercise] = []

    for ex in exercises:
        score = _score(intent_tokens, ex)
        if score == 0.0:
            continue

        matched = sorted(
            intent_tokens
            & _tokenize(f"{ex.name} {ex.tags or ''} {ex.description or ''}")
        )
        reason = f"Matched: {', '.join(matched)}" if matched else "General match"

        results.append(
            SuggestedExercise(
                exercise_id=ex.id,
                score=score,
                reason=reason,
            )
        )

    results.sort(key=lambda s: s.score, reverse=True)
    return results[:top_n]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_template_draft(
    db: Session,
    team_id: uuid.UUID,
    prompt: str,
    language: str = "en",
) -> AiTemplateDraft:
    """
    Generate a workout template draft without persisting anything.

    Steps:
      1. Fetch team exercises (ensures tenant isolation).
      2. Call LLM → title + per-block intent strings.
      3. Validate LLM response shape; reject malformed output with 502.
      4. Match exercises to each block via keyword overlap.
      5. Assemble and return the draft in BASE_BLOCKS order.
    """
    # 1. Team-scoped exercise fetch (IDOR-safe)
    exercises: list[Exercise] = list(
        db.execute(
            select(Exercise).where(Exercise.team_id == team_id)
        ).scalars()
    )

    # 2. LLM call
    system_prompt = _SYSTEM_PROMPT.format(language=language)
    raw = ai_client.call_llm(system_prompt, prompt)

    # 3. Strict structural validation
    try:
        llm = _LlmResponse.model_validate(raw)
    except ValidationError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI returned an unexpected response format",
        )

    # Verify all required blocks are present (defensive; model may hallucinate)
    missing = [b for b in BASE_BLOCKS if b not in llm.block_intents]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI response missing required blocks: {missing}",
        )

    # 4 & 5. Build output in fixed BASE_BLOCKS order
    blocks = [
        AiBlockDraft(
            name=block_name,
            notes=llm.block_intents[block_name],
            suggested_exercises=_match_exercises(
                llm.block_intents[block_name], exercises
            ),
        )
        for block_name in BASE_BLOCKS
    ]

    return AiTemplateDraft(title=llm.title, blocks=blocks)
