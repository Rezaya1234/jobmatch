"""LinkedIn profile enrichment via RapidAPI (Real-Time LinkedIn Scraper).

User provides their LinkedIn profile URL. We call RapidAPI to fetch:
name, headline, profile picture, skills, summary.

Required env var:
  RAPIDAPI_KEY — from rapidapi.com after subscribing to "Real-Time LinkedIn Scraper API"
"""
import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from db.models import UserProfile

logger = logging.getLogger(__name__)

router = APIRouter(tags=["linkedin"])

_KEY = os.getenv("RAPIDAPI_KEY", "")
_API_URL = "https://linkedin-data-api.p.rapidapi.com/get-profile-data-by-url"


class EnrichRequest(BaseModel):
    linkedin_url: str


class EnrichResponse(BaseModel):
    display_name: str | None
    headline: str | None
    avatar_url: str | None
    linkedin_url: str
    skills: list[str]


@router.post("/users/{user_id}/linkedin/enrich", response_model=EnrichResponse)
async def enrich_linkedin(
    user_id: str,
    body: EnrichRequest,
    session: AsyncSession = Depends(get_session),
) -> EnrichResponse:
    if not _KEY:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LinkedIn enrichment is not configured on this server yet.",
        )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            _API_URL,
            params={"url": body.linkedin_url},
            headers={
                "x-rapidapi-host": "linkedin-data-api.p.rapidapi.com",
                "x-rapidapi-key": _KEY,
            },
        )

    if resp.status_code == 404:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="LinkedIn profile not found. Make sure your profile is public.",
        )
    if resp.status_code == 429:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again in a moment.",
        )
    if resp.status_code != 200:
        logger.error("Proxycurl %s: %s", resp.status_code, resp.text[:200])
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not fetch LinkedIn profile. Try again.",
        )

    data = resp.json()
    # RapidAPI field names
    first = data.get("firstName") or data.get("first_name") or ""
    last  = data.get("lastName")  or data.get("last_name")  or ""
    display_name = data.get("full_name") or f"{first} {last}".strip() or None
    headline     = data.get("headline") or data.get("title") or None
    avatar_url   = (
        data.get("profilePicture") or data.get("profile_pic_url")
        or data.get("profilePictureUrl") or None
    )
    skills  = data.get("skills") or []
    summary = data.get("summary") or data.get("about") or ""

    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is not None:
        profile.linkedin_url = body.linkedin_url
        if display_name:
            profile.display_name = display_name
        if avatar_url:
            profile.avatar_url = avatar_url
        # Pre-fill role_description only if user hasn't written one yet
        if not profile.role_description and (summary or headline):
            profile.role_description = summary or headline
        await session.commit()
        logger.info("LinkedIn enriched for user %s — %s", user_id, display_name)

    return EnrichResponse(
        display_name=display_name,
        headline=headline,
        avatar_url=avatar_url,
        linkedin_url=body.linkedin_url,
        skills=skills if isinstance(skills, list) else [],
    )


@router.delete("/users/{user_id}/linkedin", status_code=204)
async def disconnect_linkedin(
    user_id: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    result = await session.execute(
        select(UserProfile).where(UserProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is not None:
        profile.linkedin_url = None
        profile.avatar_url   = None
        profile.display_name = None
        await session.commit()
