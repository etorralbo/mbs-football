"""
Thin wrapper around the OpenAI-compatible chat API.

Responsibilities:
- Build the API client from settings.
- Make the completion call with JSON mode enforced.
- Parse the raw string to dict.
- Raise HTTP 503 if not configured; 502 on any LLM / parse error.
"""
import json
from typing import Any

from fastapi import HTTPException, status
from openai import OpenAI, OpenAIError

from app.core.config import get_settings


def _get_client() -> OpenAI:
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured (missing OPENAI_API_KEY)",
        )
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def call_llm(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    """
    Call the LLM and return the parsed JSON payload.

    - Enforces json_object response format so the model always returns valid JSON.
    - Returns a plain dict; callers validate the shape with Pydantic.

    Raises:
        HTTPException 503: AI key not configured.
        HTTPException 502: Network error, model error, or non-JSON response.
    """
    settings = get_settings()
    client = _get_client()

    try:
        response = client.chat.completions.create(
            model=settings.AI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
    except OpenAIError:
        # Do NOT surface the raw exception — it may contain API key fragments,
        # rate-limit details, or other upstream internals.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service unavailable. Please try again later.",
        )

    raw = response.choices[0].message.content or ""

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned non-JSON content",
        )
