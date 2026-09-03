"""
Ingest API router.

POST /api/ingest/{owner}/{repo}
    - Verifies repo access (ownership check via verify_repo_access dep)
    - Validates primary language is Python / JavaScript / TypeScript
    - Checks existing in-progress job (idempotent: returns existing job if running)
    - Validates file count ≤ 300
    - Creates IngestionJob in Postgres
    - Fires Inngest event to kick off background pipeline
    - Returns { job_id, status }

GET /api/ingest/{job_id}/status
    - Returns current job status + progress for frontend polling
    - Ensures the requesting user owns the job
"""
from __future__ import annotations

import os
import logging
from typing import Any

import httpx
import inngest
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from deps import get_current_user
from models import User, IngestionJob
from ingest.deps import verify_repo_access, RepoInfo
from inngest_client import inngest_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])

# Languages we support (GitHub's "language" field on a repo)
SUPPORTED_LANGUAGES: frozenset[str] = frozenset(
    {"Python", "JavaScript", "TypeScript"}
)


# POST /api/ingest/{owner}/{repo}
@router.post("/{owner}/{repo}", status_code=202)
async def start_ingestion(
    repo_info: RepoInfo = Depends(verify_repo_access),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Kick off background ingestion for the given repo.

    Returns:
        { "job_id": str, "status": "pending" | "running" | "done" | "failed" }
    """
    # Language gate
    lang = repo_info.language  # GitHub's top-level language (e.g. "Python")
    if lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "unsupported_language",
                "message": (
                    f"RepoChat only supports Python, JavaScript, and TypeScript repositories. "
                    f"This repo's primary language is '{lang or 'unknown'}'."
                ),
                "language": lang,
            },
        )

    # Idempotency — return existing active job if one is in-progress
    existing = await db.execute(
        select(IngestionJob)
        .where(
            IngestionJob.user_id == current_user.id,
            IngestionJob.repo_full_name == repo_info.full_name,
            IngestionJob.status.in_(["pending", "running"]),
        )
        .order_by(IngestionJob.created_at.desc())
        .limit(1)
    )
    active_job: IngestionJob | None = existing.scalar_one_or_none()
    if active_job:
        return {
            "job_id": active_job.id,
            "status": active_job.status,
            "message": "Ingestion already in progress.",
        }

    # Block re-ingestion of an already-done repo
    done_result = await db.execute(
        select(IngestionJob)
        .where(
            IngestionJob.user_id == current_user.id,
            IngestionJob.repo_full_name == repo_info.full_name,
            IngestionJob.status == "done",
        )
        .order_by(IngestionJob.created_at.desc())
        .limit(1)
    )
    done_job: IngestionJob | None = done_result.scalar_one_or_none()
    if done_job:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "already_ingested",
                "message": "This repository has already been ingested.",
                "job_id": done_job.id,
                "chunks_ingested": done_job.chunks_ingested,
            },
        )

    # Create the DB record
    job = IngestionJob(
        user_id=current_user.id,
        repo_full_name=repo_info.full_name,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Fire Inngest event
    try:
        await inngest_client.send(
            inngest.Event(
                name="repochat/repo.ingest",
                data={
                    "job_id": job.id,
                    "owner": repo_info.owner,
                    "repo": repo_info.repo,
                    "default_branch": repo_info.default_branch,
                    "github_token": current_user.github_access_token,
                },
            )
        )
    except Exception as exc:
        # If Inngest is unreachable, mark the job failed immediately
        job.status = "failed"
        job.error_message = f"Failed to dispatch background job: {exc}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not dispatch ingestion job. Is the Inngest Dev Server running?",
        ) from exc

    return {"job_id": job.id, "status": "pending"}


# GET /api/ingest/{job_id}/status
@router.get("/{job_id}/status")
async def get_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Returns the current status and progress of an ingestion job."""
    result = await db.execute(
        select(IngestionJob).where(IngestionJob.id == job_id)
    )
    job: IngestionJob | None = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Ownership check — users can only see their own jobs
    if job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    return {
        "job_id": job.id,
        "repo_full_name": job.repo_full_name,
        "status": job.status,
        "total_chunks": job.total_chunks,
        "chunks_ingested": job.chunks_ingested,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


# GET /api/ingest/{owner}/{repo}/latest
@router.get("/{owner}/{repo}/latest")
async def get_latest_job(
    owner: str,
    repo: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Returns the most recent ingestion job for a given repo, or 404 if none."""
    repo_full_name = f"{owner}/{repo}"
    result = await db.execute(
        select(IngestionJob)
        .where(
            IngestionJob.user_id == current_user.id,
            IngestionJob.repo_full_name == repo_full_name,
        )
        .order_by(IngestionJob.created_at.desc())
        .limit(1)
    )
    job: IngestionJob | None = result.scalar_one_or_none()

    if job is None:
        raise HTTPException(status_code=404, detail="No ingestion job found for this repository.")

    return {
        "job_id": job.id,
        "repo_full_name": job.repo_full_name,
        "status": job.status,
        "total_chunks": job.total_chunks,
        "chunks_ingested": job.chunks_ingested,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }
