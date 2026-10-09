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
    primary_err_msg = ""
    
    # Try OpenRouter with basic retries for rate limits
    for attempt in range(2):
        try:
            return await _embed_batch_openrouter(texts)
        except Exception as e:
            if "429" in str(e):
                logger.warning("OpenRouter rate limit, retrying in 2s...")
                await asyncio.sleep(2)
                continue
            primary_err_msg = str(e)
            break  # Break for 402 or other errors to try Gemini

    logger.warning("OpenRouter embedding failed (%s), trying Gemini fallback…", primary_err_msg)

    # Try Gemini fallback with exponential backoff for its strict 15 RPM limit
    for attempt in range(5):
        try:
            return await _embed_batch_gemini(texts)
        except Exception as fallback_err:
            err_str = str(fallback_err).lower()
            if "429" in err_str or "quota" in err_str or "exhausted" in err_str:
                sleep_time = 4 + (2 ** attempt)  # e.g., 5s, 6s, 8s, 12s, 20s
                logger.warning(
                    f"Gemini rate limit/quota hit. Retrying in {sleep_time}s... (Attempt {attempt+1}/5)"
                )
                await asyncio.sleep(sleep_time)
                continue
            raise EmbeddingError(
                f"Both embedding providers failed. "
                f"OpenRouter: {primary_err_msg}. Gemini: {fallback_err}."
            ) from fallback_err

    raise EmbeddingError(
        f"Both embedding providers failed after retries. "
        f"OpenRouter: {primary_err_msg}."
    )


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
        
        # Add a small delay between batches to help avoid immediate rate limits
        if i + OPENROUTER_BATCH_SIZE < len(texts):
            await asyncio.sleep(1.0)
            
    return results
