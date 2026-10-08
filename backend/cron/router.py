"""
Cron routes — called by Vercel's cron scheduler.

All endpoints here must bypass the normal get_current_user auth dependency
because cron calls have no login cookie.  Instead they use a shared secret
sent as an Authorization: Bearer <CRON_SECRET> header.
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Header, HTTPException, status
from qdrant_client import AsyncQdrantClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cron", tags=["cron"])

QDRANT_COLLECTION = "repochat_chunks"


def _verify_cron_secret(authorization: str | None) -> None:
    """Reject requests that don't carry the CRON_SECRET bearer token."""
    secret = os.getenv("CRON_SECRET", "")
    if not secret:
        # If no secret is configured, only allow in non-production environments
        if os.getenv("VERCEL_ENV") == "production":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="CRON_SECRET env var is not configured.",
            )
        return  # allow in local dev without a secret

    expected = f"Bearer {secret}"
    if authorization != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing cron secret.",
        )


@router.get("/keepalive")
async def keepalive(authorization: str | None = Header(default=None)) -> dict:
    """
    Daily Qdrant Cloud keep-alive probe.

    Registered in backend/vercel.json as a Vercel cron job.
    Performs a cheap real read against Qdrant (1-row scroll on repochat_chunks)
    so that Qdrant Cloud counts it as activity and does not pause the cluster.

    Returns: { "status": "ok", "point_count": int }
    """
    _verify_cron_secret(authorization)

    qdrant_url = os.getenv("QDRANT_URL", "")
    qdrant_api_key = os.getenv("QDRANT_API_KEY", "")

    if not qdrant_url:
        logger.warning("QDRANT_URL not set — keepalive skipped")
        return {"status": "skipped", "reason": "QDRANT_URL not configured"}

    try:
        client = AsyncQdrantClient(url=qdrant_url, api_key=qdrant_api_key)
        # A real read: fetch the total point count for the collection.
        # Falls back gracefully if the collection doesn't exist yet.
        collections = await client.get_collections()
        collection_names = {c.name for c in collections.collections}

        if QDRANT_COLLECTION in collection_names:
            info = await client.get_collection(QDRANT_COLLECTION)
            point_count = info.points_count or 0
        else:
            point_count = 0

        await client.close()
        logger.info("Qdrant keepalive ok — %d points in %s", point_count, QDRANT_COLLECTION)
        return {"status": "ok", "point_count": point_count}

    except Exception as exc:
        logger.error("Qdrant keepalive failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Qdrant keepalive failed: {exc}",
        ) from exc
