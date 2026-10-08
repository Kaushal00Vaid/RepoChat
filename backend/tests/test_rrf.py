"""
Tests for Reciprocal Rank Fusion (RRF).

Pure function — no network, no DB, no secrets.
"""
import pytest
from retrieval.rrf import reciprocal_rank_fusion, RRF_K


def _make_chunk(id: str, extra: dict | None = None) -> dict:
    base = {"_id": id, "content": f"content of {id}", "file_path": f"{id}.py"}
    if extra:
        base.update(extra)
    return base


class TestRRF:
    def test_single_list_ranks_by_position(self):
        """With only vector hits, the top vector result should rank first."""
        vector_hits = [_make_chunk("a"), _make_chunk("b"), _make_chunk("c")]
        results = reciprocal_rank_fusion(vector_hits, [], top_k=3)
        assert results[0]["_id"] == "a"
        assert results[1]["_id"] == "b"

    def test_agreement_boosts_score(self):
        """A document ranked first in BOTH lists should beat one ranked first in only one."""
        vector_hits = [_make_chunk("a"), _make_chunk("b")]
        bm25_hits = [_make_chunk("a"), _make_chunk("c")]
        results = reciprocal_rank_fusion(vector_hits, bm25_hits, top_k=3)
        # "a" appears first in both — must have highest RRF score
        assert results[0]["_id"] == "a"

    def test_top_k_limits_output(self):
        vector_hits = [_make_chunk(str(i)) for i in range(10)]
        bm25_hits = [_make_chunk(str(i)) for i in range(10)]
        results = reciprocal_rank_fusion(vector_hits, bm25_hits, top_k=5)
        assert len(results) == 5

    def test_empty_inputs_return_empty(self):
        results = reciprocal_rank_fusion([], [], top_k=5)
        assert results == []

    def test_only_bm25_hits(self):
        bm25_hits = [_make_chunk("x"), _make_chunk("y")]
        results = reciprocal_rank_fusion([], bm25_hits, top_k=2)
        assert results[0]["_id"] == "x"

    def test_rrf_score_is_attached(self):
        vector_hits = [_make_chunk("a")]
        results = reciprocal_rank_fusion(vector_hits, [], top_k=1)
        assert "rrf_score" in results[0]
        assert isinstance(results[0]["rrf_score"], float)

    def test_internal_score_stripped(self):
        """_score (Qdrant internal field) must not leak into results."""
        chunk_with_score = _make_chunk("a", {"_score": 0.99})
        results = reciprocal_rank_fusion([chunk_with_score], [], top_k=1)
        assert "_score" not in results[0]

    def test_payload_fields_preserved(self):
        chunk = _make_chunk("a", {"language": "python", "start_line": 10})
        results = reciprocal_rank_fusion([chunk], [], top_k=1)
        assert results[0]["language"] == "python"
        assert results[0]["start_line"] == 10

    def test_rrf_formula_correctness(self):
        """Manually verify RRF score for a single document ranked 1st in both lists."""
        vector_hits = [_make_chunk("a")]
        bm25_hits = [_make_chunk("a")]
        results = reciprocal_rank_fusion(vector_hits, bm25_hits, top_k=1)
        expected = 1 / (RRF_K + 1) + 1 / (RRF_K + 1)
        assert abs(results[0]["rrf_score"] - round(expected, 6)) < 1e-9

    def test_union_of_both_lists(self):
        """Documents appearing in only one list are still included in results."""
        vector_hits = [_make_chunk("a")]
        bm25_hits = [_make_chunk("b")]
        results = reciprocal_rank_fusion(vector_hits, bm25_hits, top_k=5)
        ids = {r["_id"] for r in results}
        assert "a" in ids
        assert "b" in ids

    def test_top_k_larger_than_pool(self):
        """top_k > total unique docs — should return all without error."""
        vector_hits = [_make_chunk("a"), _make_chunk("b")]
        results = reciprocal_rank_fusion(vector_hits, [], top_k=100)
        assert len(results) == 2

    def test_descending_rrf_scores(self):
        """Results must be sorted by descending RRF score."""
        vector_hits = [_make_chunk(str(i)) for i in range(5)]
        bm25_hits = list(reversed(vector_hits))
        results = reciprocal_rank_fusion(vector_hits, bm25_hits, top_k=5)
        scores = [r["rrf_score"] for r in results]
        assert scores == sorted(scores, reverse=True)
