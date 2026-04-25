"""
CompanyInsightAgent — generates weekly hiring intelligence per company.
Processes every active company that has at least 2 open jobs,
upserts results into the company_insights table.
"""
import json
import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.company_sources import COMPANY_DOMAIN
from db.models import CompanyInsight, Job
from llm.client import LLMClient, Message, ModelTier

logger = logging.getLogger(__name__)

_MIN_JOBS = 2
_TITLE_LIMIT = 20

_SYSTEM = (
    "You are a hiring intelligence analyst generating job-seeker insights from job posting data. "
    "Be direct, specific, and honest. Base all assessments strictly on the provided job data. "
    "Always respond with valid JSON — no markdown fences, no extra text."
)

_PROMPT = """\
Analyze this company for job seekers based on its current job postings.

Company: {company_name}
Active job count: {count}
Sector: {sector}
Company type: {company_type}
Company size: {company_size}
Locations hiring: {locations}
Recent job titles:
  - {titles}

Return a JSON object with exactly these fields:
- summary: string (1-2 sentences: what makes this company worth considering)
- hiring_outlook: one of "growing", "stable", "slowing"
- hiring_outlook_reason: string (one sentence explaining the outlook)
- interview_difficulty: integer 1-5 (1=very easy, 5=very hard)
- response_rate: string like "~60%"
- time_to_hire: string like "2-4 weeks"
- hiring_trend: one of "up", "flat", "down"
- overall_rating: float 0.0-5.0 (be conservative, default ~3.5 for unknown)
- rating_source: always the string "Inferred from job data"
- pros: array of 3-5 strings (reasons to consider this company)
- cons: array of 2-4 strings (honest potential drawbacks)
- signals: array of 1-3 objects with keys "title" (string), "date" (YYYY-MM), "type" (one of: "hiring_surge", "expansion", "tech_stack", "culture", "leadership")
- hiring_areas: array of department strings inferred from titles (e.g. "Engineering", "Product")
- risks: array of 2-3 strings (things job seekers should consider)
- website: string, the company's primary website URL (e.g. "https://openai.com") — null if unknown
- hq_location: string, city/state or city/country of HQ (e.g. "San Francisco, CA") — null if unknown"""


def _slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


class CompanyInsightAgent:
    def __init__(self, session: AsyncSession, llm: LLMClient) -> None:
        self._session = session
        self._llm = llm

    async def run(self) -> int:
        """Generate/refresh insights for all qualifying companies. Returns count processed."""
        companies = await self._gather_companies()
        logger.info("CompanyInsightAgent: %d companies to process", len(companies))
        processed = 0
        for data in companies:
            try:
                await self._process(data)
                processed += 1
            except Exception:
                logger.exception("CompanyInsightAgent: failed for %s", data['company_name'])
        return processed

    async def _gather_companies(self) -> list[dict]:
        result = await self._session.execute(
            select(
                Job.company,
                func.count(Job.id).label('job_count'),
                func.array_agg(Job.title.distinct()).label('titles'),
                func.array_agg(Job.location_raw.distinct()).label('locations'),
                func.max(Job.company_type).label('company_type'),
                func.max(Job.company_size).label('company_size'),
                func.max(Job.sector).label('sector'),
            )
            .where(Job.is_active == True)
            .group_by(Job.company)
            .having(func.count(Job.id) >= _MIN_JOBS)
            .order_by(func.count(Job.id).desc())
        )
        return [
            {
                'company_name': r.company,
                'count': r.job_count,
                'titles': [t for t in (r.titles or []) if t][:_TITLE_LIMIT],
                'locations': list({loc for loc in (r.locations or []) if loc})[:10],
                'company_type': r.company_type,
                'company_size': r.company_size,
                'sector': r.sector,
            }
            for r in result.all()
        ]

    async def _process(self, data: dict) -> None:
        prompt = _PROMPT.format(
            company_name=data['company_name'],
            count=data['count'],
            sector=data['sector'] or 'Unknown',
            company_type=data['company_type'] or 'Unknown',
            company_size=data['company_size'] or 'Unknown',
            locations=', '.join(data['locations']) if data['locations'] else 'Various',
            titles='\n  - '.join(data['titles']) if data['titles'] else 'Various roles',
        )
        raw = await self._llm.complete(
            messages=[Message(role='user', content=prompt)],
            system=_SYSTEM,
            tier=ModelTier.STANDARD,
            max_tokens=1500,
        )
        insight = self._parse(raw)
        await self._upsert(_slugify(data['company_name']), data, insight)

    def _parse(self, raw: str) -> dict:
        text = raw.strip()
        # Try extracting from code fences first (even if preceded by prose)
        fence = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
        if fence:
            text = fence.group(1)
        else:
            # Fall back: grab from first { to last }
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end > start:
                text = text[start:end + 1]
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning("CompanyInsightAgent: JSON parse failed. Raw response: %.300s", raw)
            return {}

    async def _upsert(self, slug: str, data: dict, insight: dict) -> None:
        result = await self._session.execute(
            select(CompanyInsight).where(CompanyInsight.slug == slug)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = CompanyInsight(id=uuid.uuid4(), slug=slug, company_name=data['company_name'])
            self._session.add(row)

        row.company_name = data['company_name']
        row.active_job_count = data['count']
        row.sector = data.get('sector')
        row.company_type = data.get('company_type')
        row.company_size = data.get('company_size')
        row.summary = insight.get('summary')
        row.hiring_outlook = insight.get('hiring_outlook')
        row.hiring_outlook_reason = insight.get('hiring_outlook_reason')
        row.interview_difficulty = insight.get('interview_difficulty')
        row.response_rate = insight.get('response_rate')
        row.time_to_hire = insight.get('time_to_hire')
        row.hiring_trend = insight.get('hiring_trend')
        row.overall_rating = insight.get('overall_rating')
        row.rating_source = insight.get('rating_source')
        row.pros = insight.get('pros')
        row.cons = insight.get('cons')
        row.signals = insight.get('signals')
        row.hiring_areas = insight.get('hiring_areas')
        row.risks = insight.get('risks')
        # Prefer LLM-returned website; fall back to known domain from company_sources
        known_domain = COMPANY_DOMAIN.get(data['company_name'])
        row.website = insight.get('website') or (f'https://{known_domain}' if known_domain else None)
        row.hq_location = insight.get('hq_location')
        row.generated_at = datetime.now(timezone.utc)

        await self._session.commit()
