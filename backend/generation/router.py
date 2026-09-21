"""
Generation API router.

POST /api/chat
    Body:
    {
        "repo_full_name": "owner/repo",
        "query": "How does authentication work?",
        "conversation_id": "uuid-or-null",          # optional — null on first turn (lazy create)
        "history": [                                  # optional — empty on first turn
            {"role": "user",      "content": "What handles JWT?"},
            {"role": "assistant", "content": "JWT validation is in auth/jwt.py [1]..."}
        ],
        "top_k": 20
    }

    Auth  : requires valid access_token cookie (get_current_user dep)
    Guard : authenticated user must have a completed ingestion job for the repo

    Response: text/event-stream (Server-Sent Events)
    ─────────────────────────────────────────────────
    data: {"type": "meta",            "model": "gpt-4o-mini"}
    data: {"type": "delta",           "content": "The auth flow..."}
    data: {"type": "citations",       "chunks": [{citation objects}]}
    data: {"type": "conversation_id", "conversation_id": "<uuid>"}   ← only on first turn (lazy create)
    data: {"type": "done"}

Pipeline per request:
    1. Auth + ownership check
    2. Query condensation (only when history is non-empty)
       → rewrites follow-ups into standalone retrieval queries
    3. Hybrid RRF retrieval (vector + BM25, top_k=20)
    4. SSE streaming generation (OpenRouter gpt-4o-mini → Gemini 2.5 Flash fallback)
    5. Persist user + assistant messages to Neon (conversation auto-created on first turn)
"""
from __future__ import annotations

import json
import logging
import uuid as uuid_lib
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from deps import get_current_user
from models import User, IngestionJob, Conversation, ChatMessage
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
    conversation_id: str | None = Field(
        default=None,
        description="Existing conversation UUID, or null for lazy first-turn creation.",
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


# Persistence helpers

async def _ensure_conversation(
    conversation_id: str | None,
    user_id: str,
    repo_full_name: str,
    first_query: str,
    db: AsyncSession,
) -> tuple[str, bool]:
    """
    Return (conversation_id, was_created).

    If conversation_id is given, verify it exists and belongs to the user.
    If None, lazily create a new Conversation row with title = first 80 chars of query.
    """
    if conversation_id:
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        conv = result.scalar_one_or_none()
        if conv is None or conv.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found",
            )
        return conversation_id, False

    # Lazy create
    title = first_query[:80].rsplit(" ", 1)[0] if len(first_query) > 80 else first_query
    conv = Conversation(
        id=str(uuid_lib.uuid4()),
        user_id=user_id,
        repo_full_name=repo_full_name,
        title=title or "New Chat",
    )
    db.add(conv)
    await db.flush()  # get the ID without committing yet
    return conv.id, True


async def _persist_messages(
    conversation_id: str,
    user_query: str,
    assistant_text: str,
    model_used: str | None,
    citations: list[Any],
    db: AsyncSession,
) -> None:
    """Insert user + assistant ChatMessage rows and bump Conversation.updated_at."""
    now = datetime.now(timezone.utc)

    user_msg = ChatMessage(
        conversation_id=conversation_id,
        role="user",
        content=user_query,
    )
    assistant_msg = ChatMessage(
        conversation_id=conversation_id,
        role="assistant",
        content=assistant_text,
        model=model_used,
        citations_json=json.dumps(citations) if citations else None,
    )
    db.add_all([user_msg, assistant_msg])

    # Bump conversation updated_at for recency sort
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if conv:
        conv.updated_at = now
        db.add(conv)

    await db.commit()


# SSE generator

async def _event_generator(
    query: str,
    chunks: list[dict[str, Any]],
    history: list[dict],
    conversation_id: str,
    was_created: bool,
    user_id: str,
    repo_full_name: str,
    db: AsyncSession,
) -> AsyncIterator[str]:
    """
    Streams SSE events from the LLM and then persists the exchange to Neon.

    Extra SSE events vs. the original protocol:
      - conversation_id  — emitted before 'done' only when a new conv was auto-created
    """
    accumulated_text = ""
    model_used: str | None = None
    final_citations: list[Any] = []

    async for event_str in stream_answer(query, chunks, history):
        yield event_str

        # Track accumulated state for persistence
        try:
            payload = json.loads(event_str.removeprefix("data: ").strip())
        except Exception:
            continue

        if payload.get("type") == "meta":
            model_used = payload.get("model")
        elif payload.get("type") == "delta":
            accumulated_text += payload.get("content", "")
        elif payload.get("type") == "citations":
            final_citations = payload.get("chunks", [])
        elif payload.get("type") == "done":
            # Emit conversation_id before done if we just created one
            if was_created:
                yield f'data: {json.dumps({"type": "conversation_id", "conversation_id": conversation_id})}\n\n'

            # Persist the exchange
            try:
                await _persist_messages(
                    conversation_id=conversation_id,
                    user_query=query,
                    assistant_text=accumulated_text,
                    model_used=model_used,
                    citations=final_citations,
                    db=db,
                )
            except Exception as exc:
                logger.warning("Failed to persist chat messages: %s", exc)


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

    # 2. Ensure / create conversation (lazy)
    conversation_id, was_created = await _ensure_conversation(
        conversation_id=body.conversation_id,
        user_id=current_user.id,
        repo_full_name=body.repo_full_name,
        first_query=body.query,
        db=db,
    )

    # Normalise history to plain dicts
    history_dicts = [{"role": h.role, "content": h.content} for h in body.history]
    # Trim to last MAX_HISTORY_TURNS pairs (safety cap)
    history_dicts = history_dicts[-(MAX_HISTORY_TURNS * 2):]

    # 3. Query condensation — ONLY when history exists
    retrieval_query = body.query
    if history_dicts:
        try:
            retrieval_query = await condense_query(body.query, history_dicts)
        except Exception as exc:
            # Non-fatal — fall back to original query
            logger.warning("Condensation failed (%s), using original query.", exc)

    # 4. Hybrid retrieval (uses condensed query for Qdrant + BM25)
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

    # 5. Stream generation + persist post-stream
    return StreamingResponse(
        _event_generator(
            query=body.query,
            chunks=chunks,
            history=history_dicts,
            conversation_id=conversation_id,
            was_created=was_created,
            user_id=current_user.id,
            repo_full_name=body.repo_full_name,
            db=db,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disables nginx buffering in production
        },
    )
