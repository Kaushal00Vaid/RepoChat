"""
Qdrant vector search helpers.

Provides:
  - vector_search()   : top-k ANN search filtered by repo_full_name
  - scroll_all_chunks(): fetch every payload for a repo (for BM25 corpus)
"""
from __future__ import annotations

import os
from typing import Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.http.models import Filter, FieldCondition, MatchValue

QDRANT_COLLECTION = "repochat_chunks"
_SCROLL_LIMIT = 256   # payloads per scroll page


def _get_qdrant() -> AsyncQdrantClient:
    return AsyncQdrantClient(
        url=os.environ["QDRANT_URL"],
        api_key=os.environ["QDRANT_API_KEY"],
    )


def _repo_filter(repo_full_name: str) -> Filter:
    """Qdrant filter that restricts results to a single repo."""
    return Filter(
        must=[
            FieldCondition(
                key="repo_full_name",
                match=MatchValue(value=repo_full_name),
            )
        ]
    )


async def vector_search(
    query_vector: list[float],
    repo_full_name: str,
    top_k: int,
) -> list[dict[str, Any]]:
    """
    Run ANN (Approximate Nearest Neighbor) search in Qdrant filtered by repo.

    Returns a list of payload dicts, in descending cosine-similarity order.
    Each dict is augmented with ``_id`` (the Qdrant point UUID) and
    ``_score`` (the raw cosine similarity).
    """
    client = _get_qdrant()
    try:
        response = await client.query_points(
            collection_name=QDRANT_COLLECTION,
            query=query_vector,
            query_filter=_repo_filter(repo_full_name),
            limit=top_k,
            with_payload=True,
        )
        chunks: list[dict[str, Any]] = []
        for hit in response.points:
            payload = dict(hit.payload or {})
            payload["_id"] = str(hit.id)
            payload["_score"] = hit.score
            chunks.append(payload)
        return chunks
    finally:
        await client.close()


async def scroll_all_chunks(repo_full_name: str) -> list[dict[str, Any]]:
    """
    Fetch every chunk payload stored for ``repo_full_name`` via Qdrant scroll.

    Used to build the in-memory BM25 corpus on each retrieval request.
    Points are returned in an arbitrary (but stable) order.
    """
    client = _get_qdrant()
    try:
        all_chunks: list[dict[str, Any]] = []
        offset = None

        while True:
            records, next_offset = await client.scroll(
                collection_name=QDRANT_COLLECTION,
                scroll_filter=_repo_filter(repo_full_name),
                limit=_SCROLL_LIMIT,
                offset=offset,
                with_payload=True,
                with_vectors=False,  # we only need payloads for BM25
            )

            for rec in records:
                payload = dict(rec.payload or {})
                payload["_id"] = str(rec.id)
                all_chunks.append(payload)

            if next_offset is None:
                break
            offset = next_offset

        return all_chunks
    finally:
        await client.close()
