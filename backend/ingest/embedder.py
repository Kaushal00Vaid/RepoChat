"""
Embedding generation with OpenRouter (primary) and Gemini (fallback).

Uses the OpenAI-compatible SDK for both providers.
Batches requests at 96 texts per call.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Sequence

from openai import AsyncOpenAI, APIError

logger = logging.getLogger(__name__)

BATCH_SIZE = 96

# Clients (lazy — created on first use so env vars are already loaded)
_openrouter_client: AsyncOpenAI | None = None
_gemini_client: AsyncOpenAI | None = None


def _get_openrouter() -> AsyncOpenAI:
    global _openrouter_client
    if _openrouter_client is None:
        _openrouter_client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
        )
    return _openrouter_client


def _get_gemini() -> AsyncOpenAI:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = AsyncOpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=os.environ["GEMINI_API_KEY"],
        )
    return _gemini_client


# Embedding helpers
class EmbeddingError(Exception):
    """Raised when both providers fail to generate embeddings."""


async def _embed_batch_openrouter(texts: list[str]) -> list[list[float]]:
    resp = await _get_openrouter().embeddings.create(
        model="openai/text-embedding-3-small",
        input=texts,
    )
    return [item.embedding for item in sorted(resp.data, key=lambda x: x.index)]


async def _embed_batch_gemini(texts: list[str]) -> list[list[float]]:
    resp = await _get_gemini().embeddings.create(
        model="text-embedding-004",
        input=texts,
    )
    return [item.embedding for item in sorted(resp.data, key=lambda x: x.index)]


async def _embed_batch(texts: list[str]) -> list[list[float]]:
    """Try OpenRouter first, fall back to Gemini."""
    try:
        return await _embed_batch_openrouter(texts)
    except (APIError, Exception) as primary_err:
        logger.warning(
            "OpenRouter embedding failed (%s), trying Gemini fallback…", primary_err
        )
        try:
            return await _embed_batch_gemini(texts)
        except (APIError, Exception) as fallback_err:
            raise EmbeddingError(
                f"Both embedding providers failed. "
                f"OpenRouter: {primary_err}. Gemini: {fallback_err}."
            ) from fallback_err


async def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    """
    Embed a list of texts in batches.
    Returns a flat list of embedding vectors in the same order.
    """
    texts = list(texts)
    results: list[list[float]] = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        embeddings = await _embed_batch(batch)
        results.extend(embeddings)
    return results
