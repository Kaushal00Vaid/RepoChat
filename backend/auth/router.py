import os
from datetime import timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Cookie, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from dotenv import load_dotenv

from database import get_db
from models import User
from deps import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
    REFRESH_TOKEN_EXPIRE_DAYS,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

load_dotenv()

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

router = APIRouter(prefix="/auth", tags=["auth"])

GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    """Helper to set both HttpOnly auth cookies on a response."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=False,          # TODO: Set to True in production (HTTPS)
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,          # TODO: Set to True in production (HTTPS)
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
    )


@router.get("/github/login")
def github_login():
    """Redirects the user to GitHub OAuth authorization page."""
    params = {
        "client_id": GITHUB_CLIENT_ID,
        "scope": "repo user:email",
        "allow_signup": "true",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(url=f"{GITHUB_OAUTH_URL}?{query}")


@router.get("/github/callback")
async def github_callback(code: str, db: AsyncSession = Depends(get_db)):
    """
    GitHub redirects here after user authorizes.
    Exchanges code for access token, upserts user, sets HttpOnly cookies,
    then redirects to the frontend repositories page.
    """
    async with httpx.AsyncClient() as client:
        # Exchange code for GitHub access token
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
        )
        token_data = token_resp.json()
        github_token = token_data.get("access_token")
        if not github_token:
            raise HTTPException(status_code=400, detail="Failed to retrieve GitHub token")

        # Fetch GitHub user profile
        user_resp = await client.get(
            GITHUB_USER_URL,
            headers={"Authorization": f"Bearer {github_token}", "Accept": "application/json"},
        )
        gh_user = user_resp.json()

        # Fetch emails separately — profile email is null when GitHub privacy is on
        emails_resp = await client.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {github_token}", "Accept": "application/json"},
        )
        emails_data = emails_resp.json() if emails_resp.status_code == 200 else []

    github_id = gh_user.get("id")
    username = gh_user.get("login")
    avatar_url = gh_user.get("avatar_url")
    name = gh_user.get("name")

    # Prefer profile email; fall back to primary verified email from /user/emails
    email = gh_user.get("email")
    if not email and isinstance(emails_data, list):
        for em in emails_data:
            if em.get("primary") and em.get("verified"):
                email = em.get("email")
                break

    # Add user in DB
    result = await db.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()

    if user:
        user.github_access_token = github_token
        user.username = username
        user.email = email
        user.avatar_url = avatar_url
        user.name = name
    else:
        user = User(
            github_id=github_id,
            username=username,
            email=email,
            avatar_url=avatar_url,
            name=name,
            github_access_token=github_token,
        )
        db.add(user)

    # Create JWT tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    user.refresh_token = refresh_token

    await db.commit()
    await db.refresh(user)

    # Redirect to frontend /auth/callback — React handles final navigation to /repositories
    redirect_response = RedirectResponse(url=f"{FRONTEND_URL}/auth/callback")
    _set_auth_cookies(redirect_response, access_token, refresh_token)
    return redirect_response


@router.post("/refresh")
async def refresh_tokens(
    refresh_token: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Uses the refresh token cookie to issue a new access + refresh token pair.
    Implements refresh token rotation for security.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )

    if not refresh_token:
        raise credentials_exception

    user_id = decode_refresh_token(refresh_token)
    if not user_id:
        raise credentials_exception

    # Validate refresh token is the one we stored (allows revocation)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.refresh_token != refresh_token:
        raise credentials_exception

    # Rotate tokens
    new_access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)
    user.refresh_token = new_refresh_token
    await db.commit()

    response = Response(status_code=200)
    _set_auth_cookies(response, new_access_token, new_refresh_token)
    return response


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invalidates the user's refresh token and clears cookies."""
    current_user.refresh_token = None
    await db.commit()

    response = Response(status_code=200)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return response


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Returns the currently authenticated user's profile."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "avatar_url": current_user.avatar_url,
        "name": current_user.name,
    }
