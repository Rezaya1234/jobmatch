"""
Fast heuristic scorer — no LLM, no API calls.
Ranks jobs after hard filtering, before embedding similarity.
"""
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from db.models import Job, UserProfile


def score_heuristic(job: "Job", profile: "UserProfile") -> float:
    """Return 0.0–1.0 based on keyword/title/experience/salary overlap."""
    profile_text = (profile.role_description or "").lower()
    job_text = ((job.description or "") + " " + (job.title or "")).lower()

    title_score = _title_match(job.title or "", profile_text)
    keyword_score = _keyword_overlap(job_text, profile_text)
    exp_score = _experience_alignment(job, profile)
    salary_score = _salary_alignment(job, profile)

    total = (
        title_score * 0.30
        + keyword_score * 0.30
        + exp_score * 0.20
        + salary_score * 0.20
    )
    return round(min(1.0, max(0.0, total)), 4)


def _title_match(title: str, profile_text: str) -> float:
    if not title or not profile_text:
        return 0.5
    title_words = set(re.findall(r'\b\w{4,}\b', title.lower()))
    profile_words = set(re.findall(r'\b\w{4,}\b', profile_text))
    if not title_words:
        return 0.5
    overlap = title_words & profile_words
    return min(1.0, len(overlap) / max(1, len(title_words)))


def _keyword_overlap(job_text: str, profile_text: str) -> float:
    if not job_text or not profile_text:
        return 0.5
    profile_keywords = set(re.findall(r'\b\w{4,}\b', profile_text))
    if not profile_keywords:
        return 0.5
    sample = list(profile_keywords)[:30]  # cap to avoid slow matching on huge profiles
    found = sum(1 for kw in sample if kw in job_text)
    return min(1.0, found / max(1, len(sample)))


def _experience_alignment(job: "Job", profile: "UserProfile") -> float:
    years_exp = getattr(profile, 'years_experience', None)
    if not years_exp:
        return 0.5
    desc = (job.description or "").lower()
    match = re.search(r'(\d+)\+?\s*(?:to\s*\d+\s*)?years?\s*(?:of\s+)?(?:experience|exp)', desc)
    if not match:
        return 0.5
    required = int(match.group(1))
    gap = required - years_exp
    if gap <= 0:
        return 1.0
    if gap <= 2:
        return 0.6
    return 0.2


def _salary_alignment(job: "Job", profile: "UserProfile") -> float:
    if not profile.salary_min:
        return 0.5
    job_max = job.salary_max or job.salary_min
    if not job_max:
        return 0.5
    if job_max >= profile.salary_min:
        return 1.0
    if job_max >= profile.salary_min * 0.85:
        return 0.6
    return 0.2
