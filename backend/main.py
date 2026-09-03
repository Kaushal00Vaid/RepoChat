import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

import inngest.fast_api
from inngest_client import inngest_client

from database import engine, Base
from auth.router import router as auth_router
from repos.router import router as repos_router
from ingest.router import router as ingest_router
from ingest.pipeline import run_repo_ingestion  # registers the Inngest function

load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (use Alembic for production migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="RepoChat API",
    description="Chat with your GitHub repositories",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(repos_router, prefix="/api")
app.include_router(ingest_router, prefix="/api")

# Serve the Inngest webhook endpoint at /api/inngest
inngest.fast_api.serve(app, inngest_client, [run_repo_ingestion])


@app.get("/api/health")
def health():
    return {"status": "ok"}
