"""
One-shot script: creates the keyword payload index on repo_full_name
in the existing repochat_chunks Qdrant collection.

Run once to fix collections that were created before the index was added:
    python patch_qdrant_index.py
"""
import asyncio
import os
from dotenv import load_dotenv
from qdrant_client import AsyncQdrantClient
from qdrant_client.http.models import PayloadSchemaType

load_dotenv()

COLLECTION = "repochat_chunks"


async def main() -> None:
    client = AsyncQdrantClient(
        url=os.environ["QDRANT_URL"],
        api_key=os.environ["QDRANT_API_KEY"],
    )
    try:
        print(f"Creating keyword index on '{COLLECTION}.repo_full_name'…")
        await client.create_payload_index(
            collection_name=COLLECTION,
            field_name="repo_full_name",
            field_schema=PayloadSchemaType.KEYWORD,
        )
        print("Done. Index created (or already existed — idempotent).")
    finally:
        await client.close()


asyncio.run(main())
