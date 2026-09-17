"""
Generation API router.

POST /api/chat
    Body:
    {
        "repo_full_name": "owner/repo",
        "query": "How does authentication work?",
        "history": [                           # optional — empty on first turn
            {"role": "user",      "content": "What handles JWT?"},
            {"role": "assistant", "content": "JWT validation is in auth/jwt.py [1]..."}
        ],
        "top_k": 20
    }

    Auth  : requires valid access_token cookie (get_current_user dep)
    Guard : authenticated user must have a completed ingestion job for the repo

    Response: text/event-stream (Server-Sent Events)
    ─────────────────────────────────────────────────
    data: {"type": "meta",      "model": "gpt-4o-mini"}
    data: {"type": "delta",     "content": "The auth flow..."}
    data: {"type": "citations", "chunks": [{citation objects}]}
    data: {"type": "done"}

Pipeline per request:
    1. Auth + ownership check
    2. Query condensation (only when history is non-empty)
       → rewrites follow-ups into standalone retrieval queries
    3. Hybrid RRF retrieval (vector + BM25, top_k=20)
    4. SSE streaming generation (OpenRouter gpt-4o-mini → Gemini 2.5 Flash fallback)
"""
from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from deps import get_current_user
from models import User, IngestionJob
from retrieval.retriever import retrieve, DEFAULT_TOP_K
from generation.condenser import condense_query
from generation.llm import stream_answer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# Maximum history pairs sent from the frontend — trim here as a safety cap
MAX_HISTORY_TURNS = 10


# Request / response models

class HistoryEntry(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    repo_full_name: str = Field(
        ...,
        description="GitHub owner/repo string.",
        examples=["torvalds/linux"],
    )
    query: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="User's natural-language question about the codebase.",
    )
    history: list[HistoryEntry] = Field(
        default_factory=list,
        max_length=MAX_HISTORY_TURNS * 2,  # pairs → individual messages
        description="Prior conversation turns (empty on first query).",
    )
    top_k: int = Field(
        default=DEFAULT_TOP_K,
        ge=1,
        le=50,
        description="Chunks to retrieve (1–50, default 20).",
    )


# SSE generator wrapper

async def _event_generator(
    query: str,
    chunks: list[dict[str, Any]],
    history: list[dict],
) -> AsyncIterator[str]:
    """Thin wrapper so StreamingResponse gets a plain async generator."""
    async for event in stream_answer(query, chunks, history):
        yield event


# Endpoint

@router.post("")
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """
    Conversational RAG chat over an ingested repository.

    Returns a Server-Sent Events stream.
    """
    # 1. Ownership + completion check
    result = await db.execute(
        select(IngestionJob).where(
            IngestionJob.user_id == current_user.id,
            IngestionJob.repo_full_name == body.repo_full_name,
            IngestionJob.status == "done",
        )
    )
    job: IngestionJob | None = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "not_ingested",
                "message": (
                    f"No completed ingestion found for '{body.repo_full_name}'. "
                    "Please ingest the repository first."
                ),
            },
        )

    # Normalise history to plain dicts
    history_dicts = [{"role": h.role, "content": h.content} for h in body.history]
    # Trim to last MAX_HISTORY_TURNS pairs (safety cap)
    history_dicts = history_dicts[-(MAX_HISTORY_TURNS * 2):]

    # 2. Query condensation — ONLY when history exists
    retrieval_query = body.query
    if history_dicts:
        try:
            retrieval_query = await condense_query(body.query, history_dicts)
        except Exception as exc:
            # Non-fatal — fall back to original query
            logger.warning("Condensation failed (%s), using original query.", exc)

    # 3. Hybrid retrieval (uses condensed query for Qdrant + BM25)
    try:
        chunks = await retrieve(
            query=retrieval_query,
            repo_full_name=body.repo_full_name,
            top_k=body.top_k,
        )
    except Exception as exc:
        logger.exception(
            "Retrieval failed for repo=%s query=%r", body.repo_full_name, retrieval_query
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Retrieval failed. Please try again.",
        ) from exc

    # 4. Stream generation (original query goes to the LLM, not the condensed one)
    return StreamingResponse(
        _event_generator(body.query, chunks, history_dicts),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disables nginx buffering in production
        },
    )
