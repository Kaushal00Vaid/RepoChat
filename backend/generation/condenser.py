"""
Query condensation for conversational RAG.

On turn 2+ (when history exists), rewrites the user's follow-up question into a
self-contained search query so that the retriever (Qdrant + BM25) can find
relevant chunks even for pronoun-heavy or context-dependent follow-ups.

e.g.  history:  Q:"How does auth work?"  A:"...verify_token in auth/jwt.py [1]..."
      follow-up: "What about its caller?"
      condensed: "Which function calls verify_token?"

This is called BEFORE retrieval and uses a fast, non-streaming LLM call.
On any failure it falls back to the original query (graceful degradation).
"""
from __future__ import annotations

import logging
import os

from openai import AsyncOpenAI, APIError

logger = logging.getLogger(__name__)

# Lazy clients (shared with llm.py pattern)
_openrouter_client: AsyncOpenAI | None = None
_gemini_client: AsyncOpenAI | None = None

_CONDENSER_SYSTEM = """\
You are a search query rewriter for a code assistant.

Given a conversation history and a follow-up question, rewrite the follow-up \
into a fully self-contained search query that can be understood without the \
conversation history. The query will be used to search a code vector database.

Rules:
- Output ONLY the rewritten query string. No explanation, no preamble.
- Preserve technical identifiers exactly (function names, class names, file paths).
- If the follow-up is already self-contained, return it unchanged.
- Keep the rewritten query concise (1–2 sentences max).
"""


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


def _format_history_for_condenser(history: list[dict]) -> str:
    """Format the last N history pairs as a readable conversation string."""
    lines: list[str] = []
    for entry in history:
        role = "User" if entry["role"] == "user" else "Assistant"
        lines.append(f"{role}: {entry['content']}")
    return "\n".join(lines)


async def _call_condenser(
    client: AsyncOpenAI,
    model: str,
    history_text: str,
    query: str,
) -> str:
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _CONDENSER_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Conversation so far:\n{history_text}\n\n"
                    f"Follow-up question: {query}"
                ),
            },
        ],
        max_tokens=150,
        temperature=0.0,
        stream=False,
    )
    return (resp.choices[0].message.content or "").strip()


async def condense_query(query: str, history: list[dict]) -> str:
    """
    Rewrite a follow-up query into a standalone search query.

    Only called when len(history) > 0. Falls back to the original query on error.

    Parameters
    ----------
    query   : The raw user follow-up question.
    history : Prior conversation turns [{role, content}].

    Returns
    -------
    str — Condensed standalone query (or original query on failure).
    """
    if not history:
        # Guard: caller should not invoke this without history, but be safe
        return query

    history_text = _format_history_for_condenser(history)

    # Try OpenRouter first
    try:
        condensed = await _call_condenser(
            _get_openrouter(),
            "openai/gpt-4o-mini",
            history_text,
            query,
        )
        if condensed:
            logger.info("Condensed query: %r → %r", query, condensed)
            return condensed
    except (APIError, Exception) as primary_err:
        logger.warning(
            "Condenser: OpenRouter failed (%s), trying Gemini fallback…", primary_err
        )
        try:
            condensed = await _call_condenser(
                _get_gemini(),
                "gemini-2.5-flash",
                history_text,
                query,
            )
            if condensed:
                logger.info(
                    "Condensed query (Gemini fallback): %r → %r", query, condensed
                )
                return condensed
        except (APIError, Exception) as fallback_err:
            logger.warning(
                "Condenser: both providers failed (OpenRouter: %s, Gemini: %s). "
                "Falling back to original query.",
                primary_err,
                fallback_err,
            )

    return query
