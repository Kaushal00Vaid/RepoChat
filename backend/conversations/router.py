"""
Conversations API router.

Endpoints:
  GET    /api/conversations?owner={owner}&repo={repo}  List conversations for a repo
  POST   /api/conversations                            Create a new blank conversation
  GET    /api/conversations/{conversation_id}/messages Fetch all messages (asc)
  PATCH  /api/conversations/{conversation_id}          Rename conversation
  DELETE /api/conversations/{conversation_id}          Delete conversation + messages

All endpoints require the access_token cookie (get_current_user).
Ownership is enforced: only the conversation owner can read/modify.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from deps import get_current_user
from models import User, Conversation, ChatMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])


# Response / request schemas

class ConversationSummary(BaseModel):
    id: str
    title: str
    repo_full_name: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class ConversationDetail(BaseModel):
    id: str
    title: str
    repo_full_name: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    model: str | None
    citations: list[Any] | None  # deserialized from citations_json
    created_at: datetime


class CreateConversationRequest(BaseModel):
    repo_full_name: str = Field(..., description="GitHub owner/repo string.")


class RenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


# Helpers

def _deserialize_citations(citations_json: str | None) -> list[Any] | None:
    if not citations_json:
        return None
    try:
        return json.loads(citations_json)
    except Exception:
        return None


async def _get_owned_conversation(
    conversation_id: str,
    current_user: User,
    db: AsyncSession,
) -> Conversation:
    """Fetch a conversation row and verify it belongs to the current user."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if conv is None or conv.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return conv


# Endpoints

@router.get("/", response_model=list[ConversationSummary])
async def list_conversations(
    owner: str = Query(..., description="GitHub repository owner."),
    repo: str = Query(..., description="GitHub repository name."),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ConversationSummary]:
    """Return all conversations for the given repo, most recent first."""
    repo_full_name = f"{owner}/{repo}"

    # Subquery: count messages per conversation
    msg_count_sq = (
        select(
            ChatMessage.conversation_id,
            func.count(ChatMessage.id).label("cnt"),
        )
        .group_by(ChatMessage.conversation_id)
        .subquery()
    )

    result = await db.execute(
        select(Conversation, func.coalesce(msg_count_sq.c.cnt, 0).label("message_count"))
        .outerjoin(msg_count_sq, Conversation.id == msg_count_sq.c.conversation_id)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.repo_full_name == repo_full_name,
        )
        .order_by(Conversation.updated_at.desc())
    )

    rows = result.all()
    return [
        ConversationSummary(
            id=conv.id,
            title=conv.title,
            repo_full_name=conv.repo_full_name,
            message_count=int(cnt),
            created_at=conv.created_at,
            updated_at=conv.updated_at,
        )
        for conv, cnt in rows
    ]


@router.post("/", response_model=ConversationDetail, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    body: CreateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConversationDetail:
    """Create a new blank conversation for the given repo."""
    conv = Conversation(
        user_id=current_user.id,
        repo_full_name=body.repo_full_name,
        title="New Chat",
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        repo_full_name=conv.repo_full_name,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MessageOut]:
    """Return all messages for a conversation, ordered by creation time."""
    await _get_owned_conversation(conversation_id, current_user, db)

    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = result.scalars().all()
    return [
        MessageOut(
            id=msg.id,
            role=msg.role,
            content=msg.content,
            model=msg.model,
            citations=_deserialize_citations(msg.citations_json),
            created_at=msg.created_at,
        )
        for msg in messages
    ]


@router.patch("/{conversation_id}", response_model=ConversationDetail)
async def rename_conversation(
    conversation_id: str,
    body: RenameRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConversationDetail:
    """Rename a conversation title."""
    conv = await _get_owned_conversation(conversation_id, current_user, db)
    conv.title = body.title.strip()
    conv.updated_at = datetime.now(timezone.utc)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        repo_full_name=conv.repo_full_name,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a conversation and all its messages (cascade handled by FK)."""
    await _get_owned_conversation(conversation_id, current_user, db)
    await db.execute(
        delete(Conversation).where(Conversation.id == conversation_id)
    )
    await db.commit()
