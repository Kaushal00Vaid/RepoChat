"""
Embedding generation with OpenRouter (primary) and Gemini (fallback).

Primary: OpenRouter → openai/text-embedding-3-small  (OpenAI SDK, 1536 dims)
Fallback: Google Gemini → gemini-embedding-001        (native google-generativeai SDK,
                                                        output_dimensionality=1536)

Batches requests at 96 texts per call (OpenRouter) / 100 texts per call (Gemini).
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Sequence

import google.generativeai as genai
from openai import AsyncOpenAI, APIError

logger = logging.getLogger(__name__)

OPENROUTER_BATCH_SIZE = 96
GEMINI_BATCH_SIZE = 100   # Gemini embedContent supports up to 100 per batch

# Lazy singleton for OpenRouter
_openrouter_client: AsyncOpenAI | None = None


def _get_openrouter() -> AsyncOpenAI:
    global _openrouter_client
    if _openrouter_client is None:
        _openrouter_client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ["OPENROUTER_API_KEY"],
        )
    return _openrouter_client


def _configure_gemini() -> None:
    """Configure the google-generativeai SDK with the API key (idempotent)."""
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])


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
    """
    Use the native google-generativeai SDK to embed texts.

    gemini-embedding-001 defaults to 3072 dims; output_dimensionality=1536
    uses MRL truncation so the vectors match our existing Qdrant collection.
    """
    _configure_gemini()
    loop = asyncio.get_event_loop()

    def _sync_embed() -> list[list[float]]:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=texts,
            task_type="RETRIEVAL_DOCUMENT",
            output_dimensionality=1536,
        )
        embeddings = result["embedding"]
        # embed_content returns a flat list for a single string but a list of
        # lists for a list input — normalise to list[list[float]] always.
        if isinstance(embeddings[0], float):
            return [embeddings]  # type: ignore[list-item]
        return embeddings  # type: ignore[return-value]

    return await loop.run_in_executor(None, _sync_embed)


async def _embed_batch(texts: list[str]) -> list[list[float]]:
    """Try OpenRouter first, fall back to Gemini native SDK."""
    try:
        return await _embed_batch_openrouter(texts)
    except (APIError, Exception) as primary_err:
        logger.warning(
            "OpenRouter embedding failed (%s), trying Gemini fallback…", primary_err
        )
        try:
            return await _embed_batch_gemini(texts)
        except Exception as fallback_err:
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
    for i in range(0, len(texts), OPENROUTER_BATCH_SIZE):
        batch = texts[i : i + OPENROUTER_BATCH_SIZE]
        embeddings = await _embed_batch(batch)
        results.extend(embeddings)
    return results
