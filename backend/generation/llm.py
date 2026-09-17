"""
Streaming LLM generation with OpenRouter (gpt-4o-mini) primary and
Gemini 2.5 Flash fallback.

SSE event protocol (each yielded string is a complete SSE line):
  data: {"type": "meta",      "model": "gpt-4o-mini"}
  data: {"type": "delta",     "content": "...streamed text..."}
  data: {"type": "citations", "chunks": [{citation objects}]}
  data: {"type": "done"}

Citation extraction:
  After the stream completes, the accumulated response text is scanned for [N]
  markers using a regex. Only the unique chunk indices that actually appear in
  the answer are included in the citations event.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import AsyncIterator

from openai import AsyncOpenAI, APIError, APIConnectionError, APIStatusError

from generation.prompt import build_messages

logger = logging.getLogger(__name__)

# Lazy singletons (same pattern as embedder.py)
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


# Citation helpers
_CITATION_RE = re.compile(r"\[(\d+)\]")


def _extract_citations(text: str, chunks: list[dict]) -> list[dict]:
    """
    Parse [N] markers from the final answer and return the cited chunk objects.

    Only indices that correspond to real chunks are included.
    Preserves order of first appearance.
    """
    seen: set[int] = set()
    cited: list[dict] = []
    for m in _CITATION_RE.finditer(text):
        idx = int(m.group(1))          # 1-based as shown in prompt
        chunk_idx = idx - 1             # 0-based into chunks list
        if 0 <= chunk_idx < len(chunks) and idx not in seen:
            seen.add(idx)
            cited.append({"index": idx, **chunks[chunk_idx]})
    return cited


def _sse(payload: dict) -> str:
    """Format a dict as a single SSE data line."""
    return f"data: {json.dumps(payload)}\n\n"


# Core streaming function

async def _stream_from_client(
    client: AsyncOpenAI,
    model: str,
    messages: list[dict],
) -> AsyncIterator[str]:
    """
    Internal: stream from a single client/model pair.
    Yields SSE delta strings. Raises on API errors.
    """
    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        temperature=0.2,        # low temp → more faithful to context
        max_tokens=1500,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


async def stream_answer(
    query: str,
    chunks: list[dict],
    history: list[dict],
) -> AsyncIterator[str]:
    """
    Stream a grounded answer as SSE events.

    Parameters
    ----------
    query   : Original user question (NOT the condensed retrieval query).
    chunks  : Top-k retrieved code chunks for context.
    history : Prior conversation turns [{role, content}].

    Yields
    ------
    SSE-formatted strings suitable for direct use in StreamingResponse.
    """
    messages = build_messages(query, chunks, history)
    accumulated = ""
    model_used: str | None = None

    # Try OpenRouter first
    try:
        model_used = "openai/gpt-4o-mini"
        yield _sse({"type": "meta", "model": "gpt-4o-mini"})

        async for delta_text in _stream_from_client(
            _get_openrouter(), model_used, messages
        ):
            accumulated += delta_text
            yield _sse({"type": "delta", "content": delta_text})

    except (APIError, APIConnectionError, APIStatusError, Exception) as primary_err:
        logger.warning(
            "LLM stream: OpenRouter failed (%s), switching to Gemini fallback…",
            primary_err,
        )
        # Reset and retry with Gemini
        accumulated = ""
        model_used = "gemini-2.5-flash"
        yield _sse({"type": "meta", "model": "gemini-2.5-flash"})

        try:
            async for delta_text in _stream_from_client(
                _get_gemini(), "gemini-2.5-flash", messages
            ):
                accumulated += delta_text
                yield _sse({"type": "delta", "content": delta_text})

        except (APIError, APIConnectionError, APIStatusError, Exception) as fallback_err:
            logger.error(
                "LLM stream: both providers failed. OpenRouter: %s | Gemini: %s",
                primary_err,
                fallback_err,
            )
            yield _sse({
                "type": "error",
                "content": "Both AI providers are currently unavailable. Please try again later.",
            })
            yield _sse({"type": "done"})
            return

    # Post-stream: extract citations
    cited_chunks = _extract_citations(accumulated, chunks)
    if cited_chunks:
        yield _sse({"type": "citations", "chunks": cited_chunks})

    yield _sse({"type": "done"})
