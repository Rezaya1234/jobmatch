"""LinkedIn OAuth 2.0 (Sign In with LinkedIn using OpenID Connect).

Scopes used: openid profile email
Returns: display_name, avatar_url via OIDC userinfo endpoint.

Required env vars:
  LINKEDIN_CLIENT_ID     — from your LinkedIn Developer App
  LINKEDIN_CLIENT_SECRET — from your LinkedIn Developer App
  API_BASE_URL           — e.g. https://your-backend.onrender.com
  FRONTEND_URL           — e.g. https://your-frontend.onrender.com
"""
import logging
import os
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from db.models import UserProfile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/linkedin", tags=["linkedin"])

_CLIENT_ID = os.getenv("LINKEDIN_CLIENT_ID", "")
_CLIENT_SECRET = os.getenv("LINKEDIN_CLIENT_SECRET", "")
_API_BASE = os.getenv("API_BASE_URL", "http://localhost:8000")
_FRONTEND = os.getenv("FRONTEND_URL", "http://localhost:5173")

_REDIRECT_URI = f"{_API_BASE}/api/linkedin/callback"
_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"


@router.get("/connect")
async def linkedin_connect(user_id: str = Query(...)) -> RedirectResponse:
    if not _CLIENT_ID:
        return RedirectResponse(f"{_FRONTEND}/profile?linkedin=not_configured")
    state = f"{user_id}:{secrets.token_urlsafe(16)}"
    params = {
        "response_type": "code",
        "client_id": _CLIENT_ID,
        "redirect_uri": _REDIRECT_URI,
        "scope": "openid profile email",
        "state": state,
    }
    return RedirectResponse(f"{_AUTH_URL}?{urlencode(params)}")


@router.get("/callback")
async def linkedin_callback(
    code: str = Query(...),
    state: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> RedirectResponse:
    user_id = state.split(":")[0]

    async with httpx.AsyncClient(timeout=10) as client:
        # Exchange code → access token
        token_resp = await client.post(
            _TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _REDIRECT_URI,
                "client_id": _CLIENT_ID,
                "client_secret": _CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            logger.error("LinkedIn token exchange failed: %s", token_resp.text)
            return RedirectResponse(f"{_FRONTEND}/profile?linkedin=error")

        access_token = token_resp.json().get("access_token")

        # Fetch profile via OIDC userinfo
        info_resp = await client.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if info_resp.status_code != 200:
            logger.error("LinkedIn userinfo failed: %s", info_resp.text)
            return RedirectResponse(f"{_FRONTEND}/profile?linkedin=error")

        info = info_resp.json()

    display_name = info.get("name")
    avatar_url = info.get("picture")

    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is not None:
        if display_name:
            profile.display_name = display_name
        if avatar_url:
            profile.avatar_url = avatar_url
        await session.commit()
        logger.info("LinkedIn connected for user %s — name=%s", user_id, display_name)

    return RedirectResponse(f"{_FRONTEND}/profile?linkedin=connected")


@router.delete("/disconnect/{user_id}", status_code=204)
async def linkedin_disconnect(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is not None:
        profile.linkedin_url = None
        profile.avatar_url = None
        profile.display_name = None
        await session.commit()
