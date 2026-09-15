"""
Retrieval API router.

POST /api/retrieve
    Body : { "repo_full_name": "owner/repo", "query": "...", "top_k": 20 }
    Auth : requires a valid access_token cookie (get_current_user dep)
    Guard: the authenticated user must have a completed ingestion job for the repo

    Response:
    {
        "repo_full_name": "owner/repo",
        "query": "...",
        "chunks": [
            {
                "file_path": "src/utils.py",
                "language": "python",
                "start_line": 10,
                "end_line": 42,
                "content": "...",
                "chunk_index": 3,
                "rrf_score": 0.028431
            },
            ...
        ]
    }
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from deps import get_current_user
from models import User, IngestionJob
from retrieval.retriever import retrieve, DEFAULT_TOP_K

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/retrieve", tags=["retrieve"])


# Request / Response models

class RetrieveRequest(BaseModel):
    repo_full_name: str = Field(
        ...,
        description="GitHub owner/repo string matching the ingested repository.",
        examples=["torvalds/linux"],
    )
    query: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Natural-language or code-fragment query.",
    )
    top_k: int = Field(
        default=DEFAULT_TOP_K,
        ge=1,
        le=50,
        description="Number of chunks to return (1–50, default 20).",
    )


class ChunkResult(BaseModel):
    file_path: str
    language: str
    start_line: int
    end_line: int
    content: str
    chunk_index: int
    rrf_score: float


class RetrieveResponse(BaseModel):
    repo_full_name: str
    query: str
    chunks: list[ChunkResult]


# Endpoint

@router.post("", response_model=RetrieveResponse)
async def retrieve_chunks(
    body: RetrieveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Hybrid RRF retrieval (vector + BM25) over an ingested repository.

    Requires the user to have a completed ingestion job for the requested repo.
    """
    # Ownership + completion check
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

    # Run hybrid retrieval
    try:
        raw_chunks = await retrieve(
            query=body.query,
            repo_full_name=body.repo_full_name,
            top_k=body.top_k,
        )
    except Exception as exc:
        logger.exception("Retrieval failed for repo=%s query=%r", body.repo_full_name, body.query)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Retrieval failed. Please try again.",
        ) from exc

    chunks = [
        ChunkResult(
            file_path=c.get("file_path", ""),
            language=c.get("language", ""),
            start_line=c.get("start_line", 0),
            end_line=c.get("end_line", 0),
            content=c.get("content", ""),
            chunk_index=c.get("chunk_index", 0),
            rrf_score=c.get("rrf_score", 0.0),
        )
        for c in raw_chunks
    ]

    return RetrieveResponse(
        repo_full_name=body.repo_full_name,
        query=body.query,
        chunks=chunks,
    )
