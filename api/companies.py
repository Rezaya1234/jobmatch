import asyncio
import logging
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote as urlquote

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.company_sources import COMPANY_SOURCE_SLUG
from api.deps import get_session
from db.models import CompanyHiringSnapshot, CompanyInsight, FeedbackEvent, Job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["companies"])

_news_cache: dict[str, tuple[list, float]] = {}
_NEWS_TTL = 86400  # 24 hours


class CompanySummary(BaseModel):
    slug: str
    company_name: str
    sector: str | None
    company_size: str | None
    hiring_outlook: str | None
    hiring_trend: str | None
    active_job_count: int
    overall_rating: float | None
    summary: str | None
    logo_url: str | None
    website: str | None
    hiring_areas: list | None


class HiringVelocity(BaseModel):
    jobs_today: int
    jobs_7_days_ago: int
    jobs_30_days_ago: int
    week_change: int
    week_change_pct: float
    month_change: int
    month_change_pct: float
    trend: str
    data_available: bool
    snapshot_date: date | None


class RecentNewsItem(BaseModel):
    headline: str
    source: str
    url: str
    published_at: str


class CompanyDetail(BaseModel):
    slug: str
    company_name: str
    sector: str | None
    company_size: str | None
    company_type: str | None
    ticker_symbol: str | None
    hq_location: str | None
    website: str | None
    logo_url: str | None
    summary: str | None
    hiring_outlook: str | None
    hiring_outlook_reason: str | None
    interview_difficulty: int | None
    response_rate: str | None
    time_to_hire: str | None
    hiring_trend: str | None
    overall_rating: float | None
    rating_source: str | None
    pros: list | None
    cons: list | None
    signals: list | None
    hiring_areas: list | None
    risks: list | None
    active_job_count: int
    generated_at: str | None
    hiring_velocity: HiringVelocity | None
    recent_news: list[RecentNewsItem]
    user_feedback_count: int


class JobSummary(BaseModel):
    id: str
    title: str
    location_raw: str | None
    work_mode: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    url: str
    posted_at: str | None


@router.get("", response_model=list[CompanySummary])
async def list_companies(
    q: str | None = Query(None),
    outlook: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    session: AsyncSession = Depends(get_session),
) -> list[CompanySummary]:
    live_counts = (
        select(Job.company, func.count(Job.id).label("cnt"))
        .where(Job.is_active.is_(True))
        .group_by(Job.company)
        .subquery()
    )
    stmt = (
        select(CompanyInsight, func.coalesce(live_counts.c.cnt, 0).label("live_count"))
        .outerjoin(live_counts, CompanyInsight.company_name == live_counts.c.company)
        .order_by(func.coalesce(live_counts.c.cnt, 0).desc())
    )
    if q:
        stmt = stmt.where(CompanyInsight.company_name.ilike(f"%{q}%"))
    if outlook:
        stmt = stmt.where(CompanyInsight.hiring_outlook == outlook)
    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    return [
        CompanySummary(
            slug=r.slug,
            company_name=r.company_name,
            sector=r.sector,
            company_size=r.company_size,
            hiring_outlook=r.hiring_outlook,
            hiring_trend=r.hiring_trend,
            active_job_count=live_count,
            overall_rating=r.overall_rating,
            summary=r.summary,
            logo_url=r.logo_url,
            website=r.website,
            hiring_areas=r.hiring_areas,
        )
        for r, live_count in result.all()
    ]


@router.get("/{slug}", response_model=CompanyDetail)
async def get_company(
    slug: str,
    session: AsyncSession = Depends(get_session),
) -> CompanyDetail:
    result = await session.execute(
        select(CompanyInsight).where(CompanyInsight.slug == slug)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Company not found")

    # ---- Live job count ----
    live_count_result = await session.execute(
        select(func.count(Job.id)).where(
            Job.company == row.company_name,
            Job.is_active.is_(True),
        )
    )
    live_active_count = int(live_count_result.scalar() or 0)

    # ---- Hiring velocity from CompanyHiringSnapshot ----
    # Use the ATS source slug (may differ from _slugify slug stored on CompanyInsight)
    source_slug = COMPANY_SOURCE_SLUG.get(row.company_name, slug)
    snap_result = await session.execute(
        select(CompanyHiringSnapshot)
        .where(CompanyHiringSnapshot.source_slug == source_slug)
        .order_by(CompanyHiringSnapshot.snapshot_date.desc())
        .limit(1)
    )
    recent = snap_result.scalar_one_or_none()

    if recent:
        snap_date = recent.snapshot_date
        jobs_today = recent.active_job_count

        snap_7_result = await session.execute(
            select(CompanyHiringSnapshot)
            .where(
                CompanyHiringSnapshot.source_slug == source_slug,
                CompanyHiringSnapshot.snapshot_date <= snap_date - timedelta(days=7),
            )
            .order_by(CompanyHiringSnapshot.snapshot_date.desc())
            .limit(1)
        )
        snap_7 = snap_7_result.scalar_one_or_none()

        snap_30_result = await session.execute(
            select(CompanyHiringSnapshot)
            .where(
                CompanyHiringSnapshot.source_slug == source_slug,
                CompanyHiringSnapshot.snapshot_date <= snap_date - timedelta(days=30),
            )
            .order_by(CompanyHiringSnapshot.snapshot_date.desc())
            .limit(1)
        )
        snap_30 = snap_30_result.scalar_one_or_none()

        jobs_7 = snap_7.active_job_count if snap_7 else jobs_today
        jobs_30 = snap_30.active_job_count if snap_30 else jobs_today

        week_change = jobs_today - jobs_7
        week_change_pct = round((week_change / jobs_7 * 100) if jobs_7 else 0.0, 1)
        month_change = jobs_today - jobs_30
        month_change_pct = round((month_change / jobs_30 * 100) if jobs_30 else 0.0, 1)
        trend = "up" if week_change > 0 else "down" if week_change < 0 else "flat"

        hiring_velocity = HiringVelocity(
            jobs_today=jobs_today,
            jobs_7_days_ago=jobs_7,
            jobs_30_days_ago=jobs_30,
            week_change=week_change,
            week_change_pct=week_change_pct,
            month_change=month_change,
            month_change_pct=month_change_pct,
            trend=trend,
            data_available=True,
            snapshot_date=snap_date,
        )

        # Derive outlook from real snapshot data — override LLM value
        if snap_7 is not None and jobs_7 > 0:
            raw_pct = (jobs_today - jobs_7) / jobs_7 * 100
            if raw_pct > 5:
                computed_outlook, computed_trend = "growing", "up"
            elif raw_pct < -5:
                computed_outlook, computed_trend = "slowing", "down"
            else:
                computed_outlook, computed_trend = "stable", "flat"
        else:
            computed_outlook, computed_trend = None, None
    else:
        hiring_velocity = HiringVelocity(
            jobs_today=0, jobs_7_days_ago=0, jobs_30_days_ago=0,
            week_change=0, week_change_pct=0.0,
            month_change=0, month_change_pct=0.0,
            trend="flat", data_available=False, snapshot_date=None,
        )
        computed_outlook, computed_trend = None, None

    # ---- User feedback count ----
    fb_result = await session.execute(
        select(func.count(FeedbackEvent.user_id.distinct()))
        .join(Job, FeedbackEvent.job_id == Job.id)
        .where(Job.company == row.company_name)
    )
    user_feedback_count = int(fb_result.scalar() or 0)

    # ---- Recent news ----
    news_items = await _fetch_company_news(row.company_name)

    return CompanyDetail(
        slug=row.slug,
        company_name=row.company_name,
        sector=row.sector,
        company_size=row.company_size,
        company_type=row.company_type,
        ticker_symbol=row.ticker_symbol,
        hq_location=row.hq_location,
        website=row.website,
        logo_url=row.logo_url,
        summary=row.summary,
        hiring_outlook=computed_outlook,
        hiring_outlook_reason=row.hiring_outlook_reason,
        interview_difficulty=row.interview_difficulty,
        response_rate=row.response_rate,
        time_to_hire=row.time_to_hire,
        hiring_trend=computed_trend,
        overall_rating=row.overall_rating,
        rating_source=row.rating_source,
        pros=row.pros,
        cons=row.cons,
        signals=row.signals,
        hiring_areas=row.hiring_areas,
        risks=row.risks,
        active_job_count=live_active_count,
        generated_at=row.generated_at.isoformat() if row.generated_at else None,
        hiring_velocity=hiring_velocity,
        recent_news=[RecentNewsItem(**item) for item in news_items],
        user_feedback_count=user_feedback_count,
    )


@router.get("/{slug}/jobs", response_model=list[JobSummary])
async def get_company_jobs(
    slug: str,
    limit: int = Query(20, le=100),
    session: AsyncSession = Depends(get_session),
) -> list[JobSummary]:
    result = await session.execute(
        select(CompanyInsight).where(CompanyInsight.slug == slug)
    )
    insight = result.scalar_one_or_none()
    if insight is None:
        raise HTTPException(status_code=404, detail="Company not found")

    jobs_result = await session.execute(
        select(Job)
        .where(Job.company == insight.company_name, Job.is_active == True)
        .order_by(Job.scraped_at.desc())
        .limit(limit)
    )
    return [
        JobSummary(
            id=str(j.id),
            title=j.title,
            location_raw=j.location_raw,
            work_mode=j.work_mode,
            salary_min=j.salary_min,
            salary_max=j.salary_max,
            salary_currency=j.salary_currency,
            url=j.url,
            posted_at=j.posted_at.isoformat() if j.posted_at else None,
        )
        for j in jobs_result.scalars().all()
    ]


# ---------------------------------------------------------------------------
# News helpers
# ---------------------------------------------------------------------------

def _fetch_company_news_sync(company_name: str) -> list[dict]:
    """Fetch Google News RSS, return up to 5 items from the last 30 days."""
    try:
        url = (
            "https://news.google.com/rss/search"
            f"?q={urlquote(company_name)}&hl=en-US&gl=US&ceid=US:en"
        )
        resp = http_requests.get(
            url, timeout=10,
            headers={"User-Agent": "Mozilla/5.0 (compatible; StellaPath/1.0)"},
        )
        if resp.status_code != 200:
            return []
        root = ET.fromstring(resp.content)
        channel = root.find("channel")
        if channel is None:
            return []
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        results: list[dict] = []
        for item in channel.findall("item"):
            if len(results) >= 5:
                break
            title = item.findtext("title") or ""
            link = item.findtext("link") or ""
            pub_str = item.findtext("pubDate") or ""
            source_name = item.findtext("source") or ""
            try:
                published_at = parsedate_to_datetime(pub_str)
                if published_at.tzinfo is None:
                    published_at = published_at.replace(tzinfo=timezone.utc)
                if published_at < cutoff:
                    continue
            except Exception:
                continue
            if source_name and title.endswith(f" - {source_name}"):
                headline = title[: -len(f" - {source_name}")]
            else:
                parts = title.rsplit(" - ", 1)
                headline = parts[0]
                if not source_name and len(parts) > 1:
                    source_name = parts[1]
            results.append({
                "headline": headline.strip(),
                "source": source_name.strip(),
                "url": link.strip(),
                "published_at": published_at.isoformat(),
            })
        return results
    except Exception:
        logger.warning("News fetch failed for %s", company_name, exc_info=True)
        return []


async def _fetch_company_news(company_name: str) -> list[dict]:
    now = time.time()
    cached = _news_cache.get(company_name)
    if cached:
        items, ts = cached
        if now - ts < _NEWS_TTL:
            return items
    items = await asyncio.to_thread(_fetch_company_news_sync, company_name)
    _news_cache[company_name] = (items, now)
    return items
