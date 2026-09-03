"""
Repo ownership verification dependency.

Calls the GitHub API to confirm that the currently authenticated user
actually has access to the requested {owner}/{repo} before any ingest
endpoint processes the request. Raises HTTP 403 if not.
"""
from fastapi import Depends, HTTPException, status
from dataclasses import dataclass

import httpx

from deps import get_current_user
from models import User


@dataclass
class RepoInfo:
    full_name: str
    owner: str
    repo: str
    default_branch: str
    language: str | None
    private: bool


async def verify_repo_access(
    owner: str,
    repo: str,
    current_user: User = Depends(get_current_user),
) -> RepoInfo:
    """
    Verifies the authenticated user has access to {owner}/{repo} via GitHub API.
    Returns basic RepoInfo on success; raises 403 on denial, 404 if not found.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers={
                "Authorization": f"Bearer {current_user.github_access_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            timeout=10,
        )

    if resp.status_code == 404:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {owner}/{repo} not found or you don't have access.",
        )
    if resp.status_code == 403:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied to {owner}/{repo}.",
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to verify repository access with GitHub.",
        )

    data = resp.json()

    # Extra safety: ensure the authenticated user is a collaborator / owner
    # GitHub already enforces this via the token, but we double-check that the
    # repo's permissions field indicates at least read access.
    permissions = data.get("permissions", {})
    has_access = (
        permissions.get("pull")
        or permissions.get("push")
        or permissions.get("admin")
        or not permissions # for org repos
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You don't have read access to {owner}/{repo}.",
        )

    return RepoInfo(
        full_name=data["full_name"],
        owner=owner,
        repo=repo,
        default_branch=data.get("default_branch", "main"),
        language=data.get("language"),
        private=data.get("private", False),
    )
