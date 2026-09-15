"""
BM25 keyword retrieval over a list of pre-fetched chunk dicts.

Uses rank_bm25 (BM25Okapi) for scoring.
Tokenisation is code-aware:
  - Splits on whitespace and common punctuation.
  - Expands camelCase and snake_case tokens so that e.g. "getUserById"
    is also indexed as ["get", "User", "By", "Id"].
"""
from __future__ import annotations

import re
from typing import Any

from rank_bm25 import BM25Okapi


# Tokenisation helpers

_SPLIT_RE = re.compile(r"[^\w]+")
_CAMEL_RE = re.compile(r"([a-z])([A-Z])")          # camelCase boundary
_UPPER_RE = re.compile(r"([A-Z]+)([A-Z][a-z])")    # ABCDef → ABC + Def


def _split_camel(token: str) -> list[str]:
    """Split a camelCase / PascalCase / ALLCAPS token into parts."""
    s = _CAMEL_RE.sub(r"\1 \2", token)
    s = _UPPER_RE.sub(r"\1 \2", s)
    return s.split()


def tokenize(text: str) -> list[str]:
    """
    Code-aware tokeniser.

    Steps:
      1. Split on non-word characters (spaces, punctuation, operators).
      2. Further split camelCase tokens.
      3. Lower-case everything.
      4. Drop empty / single-character tokens.
    """
    raw_tokens = _SPLIT_RE.split(text)
    tokens: list[str] = []
    for tok in raw_tokens:
        if not tok:
            continue
        # snake_case is already split by the regex; handle camelCase
        for part in _split_camel(tok):
            lower = part.lower()
            if len(lower) > 1:
                tokens.append(lower)
    return tokens


# BM25 retriever

class BM25Retriever:
    """
    Wraps rank_bm25 for retrieval over a fixed corpus of chunks.

    Parameters
    ----------
    chunks : list[dict]
        Each dict must have at least a ``content`` field (str).
    """

    def __init__(self, chunks: list[dict[str, Any]]) -> None:
        self._chunks = chunks
        tokenised = [tokenize(c["content"]) for c in chunks]
        self._bm25 = BM25Okapi(tokenised)

    def query(self, query_text: str, top_k: int) -> list[tuple[int, float]]:
        """
        Score all documents against ``query_text``.

        Returns
        -------
        list of (original_index, score) tuples sorted by descending score,
        capped at top_k.  Documents with score == 0 are excluded.
        """
        q_tokens = tokenize(query_text)
        if not q_tokens:
            return []

        scores = self._bm25.get_scores(q_tokens)

        # Pair index with score, filter zeros, sort descending
        ranked = sorted(
            ((i, float(s)) for i, s in enumerate(scores) if s > 0.0),
            key=lambda x: x[1],
            reverse=True,
        )
        return ranked[:top_k]

    def get_chunk(self, idx: int) -> dict[str, Any]:
        return self._chunks[idx]
