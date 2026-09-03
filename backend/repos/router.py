from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import httpx

from database import get_db
from deps import get_current_user
from models import User

router = APIRouter(prefix="/repos", tags=["repos"])


@router.get("")
async def list_repositories(
    current_user: User = Depends(get_current_user),
    page: int = 1,
    per_page: int = 30,
):
    """
    Returns the authenticated user's GitHub repositories (public + private).
    Sorted by last pushed, paginated.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user/repos",
            headers={
                "Authorization": f"Bearer {current_user.github_access_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            params={
                "sort": "pushed",
                "direction": "desc",
                "per_page": per_page,
                "page": page,
                "type": "all",   # includes private repos
            },
        )

    if resp.status_code == 401:
        # GitHub token is expired or revoked — user must re-authenticate
        raise HTTPException(
            status_code=401,
            detail="GitHub access token is invalid or expired. Please sign in again.",
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch repositories from GitHub")

    repos = resp.json()

    # Deduplicate repos
    seen: set[str] = set()
    unique_repos = []
    for repo in repos:
        if repo["name"] not in seen:
            seen.add(repo["name"])
            unique_repos.append(repo)

    return [
        {
            "id": repo["id"],
            "name": repo["name"],
            "full_name": repo["full_name"],
            "description": repo.get("description"),
            "private": repo["private"],
            "html_url": repo["html_url"],
            "language": repo.get("language"),
            "stargazers_count": repo.get("stargazers_count", 0),
            "forks_count": repo.get("forks_count", 0),
            "updated_at": repo.get("pushed_at"),
            "default_branch": repo.get("default_branch", "main"),
        }
        for repo in unique_repos
    ]
