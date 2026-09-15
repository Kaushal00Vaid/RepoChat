"""
Top-level hybrid retriever.

Pipeline for a single query:
  1. Embed the query using the same provider as ingestion (OpenRouter → Gemini fallback).
  2. Run Qdrant ANN vector search filtered by repo_full_name  → top-(2 × top_k) candidates.
  3. Pull all chunk payloads for the repo via Qdrant scroll    → BM25 corpus.
  4. Score corpus with BM25Okapi                               → top-(2 × top_k) BM25 hits.
  5. RRF-fuse both ranked lists                                → final top_k chunks.

We over-fetch (2 × top_k) from each ranker before fusion so RRF has enough
candidates to merge; the final slice returns exactly top_k.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from ingest.embedder import embed_texts
from retrieval.bm25 import BM25Retriever
from retrieval.vector_search import vector_search, scroll_all_chunks
from retrieval.rrf import reciprocal_rank_fusion

logger = logging.getLogger(__name__)

DEFAULT_TOP_K = 20
OVERETCH_FACTOR = 2   # fetch 2× from each ranker before RRF


async def retrieve(
    query: str,
    repo_full_name: str,
    top_k: int = DEFAULT_TOP_K,
) -> list[dict[str, Any]]:
    """
    Hybrid RRF retrieval over a single ingested repository.

    Parameters
    ----------
    query : str
        Natural-language or code-fragment query from the user.
    repo_full_name : str
        GitHub ``owner/repo`` string — used as the Qdrant payload filter.
    top_k : int
        Number of chunks to return (default 20).

    Returns
    -------
    list[dict] — top-k chunks sorted by descending RRF score, each with:
        file_path, language, start_line, end_line, content,
        chunk_index, repo_full_name, rrf_score
    """
    fetch_k = top_k * OVERETCH_FACTOR

    # Step 1: embed query + fetch corpus in parallel
    logger.info("Retrieving for query=%r repo=%s top_k=%d", query, repo_full_name, top_k)

    embeddings_task = asyncio.create_task(embed_texts([query]))
    corpus_task = asyncio.create_task(scroll_all_chunks(repo_full_name))

    query_vectors, corpus = await asyncio.gather(embeddings_task, corpus_task)
    query_vector: list[float] = query_vectors[0]

    logger.info("Corpus size for %s: %d chunks", repo_full_name, len(corpus))

    if not corpus:
        logger.warning("Empty corpus for repo %s — returning empty results.", repo_full_name)
        return []

    # Step 2: vector search (uses query_vector already embedded)
    vector_hits = await vector_search(
        query_vector=query_vector,
        repo_full_name=repo_full_name,
        top_k=fetch_k,
    )

    # Step 3: BM25 search over in-memory corpus
    bm25 = BM25Retriever(corpus)
    bm25_ranked = bm25.query(query, top_k=fetch_k)
    bm25_hits = [bm25.get_chunk(idx) for idx, _score in bm25_ranked]

    logger.info(
        "Vector hits: %d  |  BM25 hits: %d",
        len(vector_hits),
        len(bm25_hits),
    )

    # Step 4: RRF fusion
    results = reciprocal_rank_fusion(
        vector_hits=vector_hits,
        bm25_hits=bm25_hits,
        top_k=top_k,
    )

    return results
