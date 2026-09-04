"""
Ingestion pipeline — the Inngest background function.

Steps (each is a durable, auto-retried Inngest step):
  1. fetch-file-tree  — get recursive file listing from GitHub
  2. validate-files   — reject if > 300 code files, build fetch list
  3. chunk-files      — fetch each file and chunk with AST parser
  4. embed-and-upsert — embed chunks and upsert to Qdrant
  5. mark-done        — update DB job status to 'done'

On any unhandled error the job is marked 'failed' in a final step.
"""
from __future__ import annotations

import logging
import os
import uuid
from typing import Any

import httpx
import inngest
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.models import (
    Distance,
    VectorParams,
    PointStruct,
)

from database import AsyncSessionLocal
from models import IngestionJob
from ingest.chunker import chunk_file, detect_language, should_skip_path
from ingest.embedder import embed_texts, EmbeddingError
from inngest_client import inngest_client

logger = logging.getLogger(__name__)

QDRANT_COLLECTION = "repochat_chunks"
EMBEDDING_DIM = 1536          # text-embedding-3-small / text-embedding-004
UPSERT_BATCH = 64             # Qdrant upsert batch size
MAX_FILES = 300


# Qdrant helpers
def _get_qdrant() -> AsyncQdrantClient:
    return AsyncQdrantClient(
        url=os.environ["QDRANT_URL"],
        api_key=os.environ["QDRANT_API_KEY"],
    )


async def _ensure_collection(client: AsyncQdrantClient) -> None:
    """Create the Qdrant collection if it doesn't already exist."""
    existing = {c.name for c in (await client.get_collections()).collections}
    if QDRANT_COLLECTION not in existing:
        await client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )


# DB helpers
async def _update_job(
    job_id: str,
    *,
    status: str | None = None,
    total_chunks: int | None = None,
    chunks_ingested: int | None = None,
    error_message: str | None = None,
) -> None:
    """Persist job progress to Postgres."""
    from sqlalchemy import select
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(IngestionJob).where(IngestionJob.id == job_id)
        )
        job: IngestionJob | None = result.scalar_one_or_none()
        if job is None:
            return
        if status is not None:
            job.status = status
        if total_chunks is not None:
            job.total_chunks = total_chunks
        if chunks_ingested is not None:
            job.chunks_ingested = chunks_ingested
        if error_message is not None:
            job.error_message = error_message
        await session.commit()


# GitHub helpers
async def _fetch_tree(
    owner: str, repo: str, branch: str, token: str
) -> list[dict[str, Any]]:
    """Return the flat recursive tree of blobs from GitHub."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}",
            params={"recursive": "1"},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    resp.raise_for_status()
    return resp.json().get("tree", [])


async def _fetch_file_content(url: str, token: str) -> str | None:
    """Fetch raw file content. Returns None on error."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github.raw",
            },
        )
    if resp.status_code != 200:
        return None
    try:
        return resp.text
    except Exception:
        return None


# Inngest function definition
@inngest_client.create_function(
    fn_id="repo-ingestion",
    trigger=inngest.TriggerEvent(event="repochat/repo.ingest"),
    retries=1,
)
async def run_repo_ingestion(ctx: inngest.Context) -> dict[str, Any]:
    """
    Durable Inngest function that ingests a GitHub repo into Qdrant.

    Expected event data:
        job_id        : str
        owner         : str
        repo          : str
        default_branch: str
        github_token  : str
    """
    step = ctx.step

    data = ctx.event.data
    job_id: str = data["job_id"]
    owner: str = data["owner"]
    repo: str = data["repo"]
    branch: str = data.get("default_branch", "main")
    token: str = data["github_token"]
    repo_full_name = f"{owner}/{repo}"

    try:
        # fetch-file-tree
        async def _fetch_tree_step() -> list[dict]:
            return await _fetch_tree(owner, repo, branch, token)

        tree: list[dict] = await step.run(
            "fetch-file-tree",
            _fetch_tree_step,
        )

        # validate-and-filter
        async def _validate_files() -> list[dict]:
            blobs = [
                item for item in tree
                if item.get("type") == "blob"
                and not should_skip_path(item["path"])
                and detect_language(item["path"]) is not None
            ]
            if len(blobs) > MAX_FILES:
                raise ValueError(
                    f"Repository has {len(blobs)} code files (limit is {MAX_FILES})."
                )
            return blobs

        code_files: list[dict] = await step.run("validate-files", _validate_files)

        # mark-running step (inside step.run so it only executes once, not on every replay)
        async def _mark_running() -> None:
            await _update_job(job_id, status="running", total_chunks=0)

        await step.run("mark-running", _mark_running)

        # chunk-files (fetch each file and AST-chunk it)
        async def _chunk_all_files() -> list[dict]:
            """
            Returns a serialisable list of chunk dicts (Chunk dataclass → dict).
            We do this in a single step to avoid thousands of Inngest step calls.
            """
            all_chunks: list[dict] = []
            for item in code_files:
                path = item["path"]
                lang = detect_language(path)
                if lang is None:
                    continue
                raw_url = item.get("url", "")
                # GitHub tree API gives a blob URL; convert to raw content
                # by hitting the same URL with Accept: application/vnd.github.raw
                content = await _fetch_file_content(raw_url, token)
                if content is None:
                    continue
                chunks = chunk_file(path, content, lang)
                for c in chunks:
                    all_chunks.append(
                        {
                            "file_path": c.file_path,
                            "language": c.language,
                            "start_line": c.start_line,
                            "end_line": c.end_line,
                            "content": c.content,
                            "chunk_index": c.chunk_index,
                        }
                    )
            return all_chunks

        chunk_dicts: list[dict] = await step.run("chunk-files", _chunk_all_files)

        total = len(chunk_dicts)

        if total == 0:
            async def _mark_done_empty() -> None:
                await _update_job(job_id, status="done", chunks_ingested=0)

            await step.run("mark-done", _mark_done_empty)
            return {"status": "done", "chunks": 0}

        # embed-and-upsert
        async def _embed_and_upsert() -> int:
            qdrant = _get_qdrant()
            await _ensure_collection(qdrant)
            await _update_job(job_id, total_chunks=total)  # set total_chunks inside the step

            ingested = 0
            for batch_start in range(0, total, UPSERT_BATCH):
                batch = chunk_dicts[batch_start : batch_start + UPSERT_BATCH]
                texts = [c["content"] for c in batch]

                vectors = await embed_texts(texts)

                points = [
                    PointStruct(
                        id=str(uuid.uuid4()),
                        vector=vec,
                        payload={
                            "repo_full_name": repo_full_name,
                            "file_path": c["file_path"],
                            "language": c["language"],
                            "start_line": c["start_line"],
                            "end_line": c["end_line"],
                            "content": c["content"],
                            "chunk_index": c["chunk_index"],
                        },
                    )
                    for c, vec in zip(batch, vectors)
                ]
                await qdrant.upsert(collection_name=QDRANT_COLLECTION, points=points)

                ingested += len(batch)
                await _update_job(job_id, chunks_ingested=ingested)

            await qdrant.close()
            return ingested

        ingested_count: int = await step.run("embed-and-upsert", _embed_and_upsert)

        # mark-done
        async def _mark_done() -> None:
            await _update_job(job_id, status="done", chunks_ingested=ingested_count)

        await step.run("mark-done", _mark_done)

        return {"status": "done", "chunks": ingested_count}

    except EmbeddingError as e:
        await _update_job(job_id, status="failed", error_message=str(e))
        raise  # let Inngest record the failure
    except Exception as e:
        await _update_job(job_id, status="failed", error_message=str(e))
        raise
