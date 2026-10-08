"""
Ingestion pipeline — the Inngest background function.

Steps (each is a durable, auto-retried Inngest step):
  1. fetch-file-tree    — get recursive file listing from GitHub
  2. validate-files     — reject if > 300 code files, build fetch list
  3. mark-running       — update DB job status to 'running'
  4. chunk-embed-batch-N — for each batch of files:
                           fetch → chunk → embed → upsert to Qdrant
                           returns { files_processed, chunks_upserted } (no content)
  5. mark-done          — update DB job status to 'done'

Why batched steps instead of one big chunk-files step?
  Inngest stores every step's return value.  Returning 300 files' worth of
  raw source content in a single step can easily exceed Inngest's ~4 MB
  step-output limit AND Vercel's 4.5 MB response-body cap.  By chunking and
  embedding inside the same step and returning only counts we stay well under
  both limits regardless of repo size.

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
    PayloadSchemaType,
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
FILE_BATCH_SIZE = 30          # files per Inngest step (keeps step output small)


# Qdrant helpers
def _get_qdrant() -> AsyncQdrantClient:
    return AsyncQdrantClient(
        url=os.environ["QDRANT_URL"],
        api_key=os.environ["QDRANT_API_KEY"],
    )


async def _ensure_collection(client: AsyncQdrantClient) -> None:
    """Create the Qdrant collection and required payload indexes if they don't exist."""
    existing = {c.name for c in (await client.get_collections()).collections}
    if QDRANT_COLLECTION not in existing:
        await client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )

    # Qdrant requires a payload index on any field used in filtered scroll/search.
    # This call is idempotent — safe to run even if the index already exists.
    await client.create_payload_index(
        collection_name=QDRANT_COLLECTION,
        field_name="repo_full_name",
        field_schema=PayloadSchemaType.KEYWORD,
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


async def _process_file_batch(
    file_batch: list[dict],
    repo_full_name: str,
    token: str,
    job_id: str,
    qdrant: AsyncQdrantClient,
) -> dict[str, int]:
    """
    Fetch, chunk, embed, and upsert one batch of files to Qdrant.

    Returns { "files_processed": int, "chunks_upserted": int } — no raw content.
    This is the key design: step output stays tiny regardless of file sizes.
    """
    all_chunks: list[dict] = []

    for item in file_batch:
        path = item["path"]
        lang = detect_language(path)
        if lang is None:
            continue
        raw_url = item.get("url", "")
        content = await _fetch_file_content(raw_url, token)
        if content is None:
            continue
        chunks = chunk_file(path, content, lang)
        for c in chunks:
            if not c.content.strip():
                continue
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

    if not all_chunks:
        return {"files_processed": len(file_batch), "chunks_upserted": 0}

    # Embed in sub-batches
    upserted = 0
    for batch_start in range(0, len(all_chunks), UPSERT_BATCH):
        batch = all_chunks[batch_start : batch_start + UPSERT_BATCH]
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
        upserted += len(batch)

    return {"files_processed": len(file_batch), "chunks_upserted": upserted}


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

        if not code_files:
            async def _mark_done_empty() -> None:
                await _update_job(job_id, status="done", chunks_ingested=0)

            await step.run("mark-done", _mark_done_empty)
            return {"status": "done", "chunks": 0}

        # Ensure Qdrant collection exists once, before the batched steps.
        # We do this in a dedicated step so it's retried cleanly if it fails.
        async def _setup_qdrant() -> None:
            qdrant = _get_qdrant()
            await _ensure_collection(qdrant)
            await qdrant.close()

        await step.run("setup-qdrant", _setup_qdrant)

        # chunk-embed-batch-N  (one step per FILE_BATCH_SIZE files)
        # Each step: fetches files, chunks, embeds, upserts. Returns only counts.
        total_chunks_upserted = 0
        file_batches = [
            code_files[i : i + FILE_BATCH_SIZE]
            for i in range(0, len(code_files), FILE_BATCH_SIZE)
        ]

        for batch_idx, file_batch in enumerate(file_batches):
            # Capture loop variables so inner functions close over the right values
            batch = file_batch
            idx = batch_idx

            async def _chunk_embed_batch(
                _batch: list[dict] = batch,
            ) -> dict[str, int]:
                qdrant = _get_qdrant()
                try:
                    result = await _process_file_batch(
                        _batch, repo_full_name, token, job_id, qdrant
                    )
                finally:
                    await qdrant.close()
                return result

            batch_result: dict[str, int] = await step.run(
                f"chunk-embed-batch-{batch_idx}", _chunk_embed_batch
            )
            total_chunks_upserted += batch_result["chunks_upserted"]
            # Update running progress after each batch using the accumulated total.
            # This runs in the outer function scope (not inside a step), so it
            # executes on every replay pass — that's intentional and cheap.
            await _update_job(job_id, chunks_ingested=total_chunks_upserted)

        # Update final total_chunks count now that we know it
        _final_total = total_chunks_upserted

        async def _update_total_chunks() -> None:
            await _update_job(job_id, total_chunks=_final_total)

        await step.run("update-total-chunks", _update_total_chunks)

        # mark-done
        async def _mark_done() -> None:
            await _update_job(
                job_id, status="done", chunks_ingested=total_chunks_upserted
            )

        await step.run("mark-done", _mark_done)

        return {"status": "done", "chunks": total_chunks_upserted}

    except EmbeddingError as e:
        await _update_job(job_id, status="failed", error_message=str(e))
        raise  # let Inngest record the failure
    except Exception as e:
        await _update_job(job_id, status="failed", error_message=str(e))
        raise
