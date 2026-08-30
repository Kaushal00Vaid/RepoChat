import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

_raw_url = os.getenv("DATABASE_URL", "")

# Normalize the URL so users can paste a standard Neon.tech connection string:
#   postgresql://...  or  postgres://...
# Both get rewritten to postgresql+psycopg://... (psycopg v3, async-native)
# psycopg3 natively understands sslmode=require, so no rewriting needed.
def _normalize_db_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    # Already has a driver prefix — leave it alone
    return url

DATABASE_URL = _normalize_db_url(_raw_url)

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
