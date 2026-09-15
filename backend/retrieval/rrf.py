"""
Reciprocal Rank Fusion (RRF) for combining vector and BM25 ranked lists.

Formula:  rrf(d, k) = Σ  1 / (k + rank_i(d))
                      i

where rank_i(d) is the 1-based position of document d in ranked list i.

k=60 is the standard constant from the original Cormack et al. 2009 paper.
It dampens the advantage of top-ranked results, giving a fair blend between
the two retrieval signals.
"""
from __future__ import annotations

from typing import Any


RRF_K = 60  # standard constant


def reciprocal_rank_fusion(
    vector_hits: list[dict[str, Any]],
    bm25_hits: list[dict[str, Any]],
    top_k: int,
) -> list[dict[str, Any]]:
    """
    Fuse two ranked lists using RRF.

    Parameters
    ----------
    vector_hits : list[dict]
        Chunks from vector search, ordered best → worst.
        Each dict must have a ``_id`` field (Qdrant point UUID).
    bm25_hits : list[dict]
        Chunks from BM25, ordered best → worst.
        Each dict must have a ``_id`` field matching Qdrant point UUIDs.
    top_k : int
        How many results to return.

    Returns
    -------
    list[dict] — top-k chunks, sorted by descending RRF score.
    Each dict is a copy of the original payload augmented with ``rrf_score``.
    """
    scores: dict[str, float] = {}
    payloads: dict[str, dict[str, Any]] = {}

    # Accumulate RRF scores from vector ranking
    for rank, chunk in enumerate(vector_hits, start=1):
        doc_id = chunk["_id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
        if doc_id not in payloads:
            payloads[doc_id] = chunk

    # Accumulate RRF scores from BM25 ranking
    for rank, chunk in enumerate(bm25_hits, start=1):
        doc_id = chunk["_id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
        if doc_id not in payloads:
            payloads[doc_id] = chunk

    # Sort by descending RRF score and take top_k
    ranked_ids = sorted(scores, key=lambda d: scores[d], reverse=True)[:top_k]

    results: list[dict[str, Any]] = []
    for doc_id in ranked_ids:
        chunk = dict(payloads[doc_id])
        chunk["rrf_score"] = round(scores[doc_id], 6)
        # Strip internal Qdrant fields from the public response
        chunk.pop("_score", None)
        results.append(chunk)

    return results
