"""
Per-ATS job fetchers. Each returns a list of normalized job dicts.

Normalized keys:
  url, title, company, source_company (slug), location_raw,
  work_mode, job_type, description, posted_at, source
"""
import logging
import re
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 20
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobMatchBot/1.0)"}


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

async def fetch_company_jobs(client: httpx.AsyncClient, source: dict) -> list[dict]:
    """Route to the correct fetcher based on ATS type."""
    ats = source["ats"]
    slug = source["slug"]
    name = source["name"]
    try:
        if ats == "greenhouse":
            return await _fetch_greenhouse(client, slug, name)
        if ats == "lever":
            return await _fetch_lever(client, slug, name)
        if ats == "ashby":
            return await _fetch_ashby(client, slug, name)
        if ats == "google":
            return await _fetch_google(client)
        if ats == "microsoft":
            return await _fetch_microsoft(client)
        if ats == "amazon":
            return await _fetch_amazon(client)
        logger.warning("Unknown ATS type '%s' for %s", ats, name)
        return []
    except httpx.HTTPStatusError as e:
        logger.warning("%s (%s) returned HTTP %s — skipping", name, slug, e.response.status_code)
        return []
    except Exception:
        logger.exception("Failed to fetch jobs for %s (%s)", name, slug)
        return []


# ---------------------------------------------------------------------------
# Greenhouse
# ---------------------------------------------------------------------------

async def _fetch_greenhouse(client: httpx.AsyncClient, slug: str, company_name: str) -> list[dict]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    resp = await client.get(url, params={"content": "true"}, headers=_HEADERS, timeout=_TIMEOUT)
    resp.raise_for_status()
    jobs = resp.json().get("jobs", [])
    results = []
    for j in jobs:
        location = j.get("location", {}).get("name", "")
        results.append({
            "url": j.get("absolute_url") or f"https://boards.greenhouse.io/{slug}/jobs/{j['id']}",
            "title": j.get("title", ""),
            "company": company_name,
            "source_company": slug,
            "location_raw": location,
            "work_mode": _infer_work_mode(location, j.get("title", "")),
            "job_type": "full_time",
            "description": _strip_html(j.get("content") or ""),
            "posted_at": _parse_iso(j.get("updated_at")),
            "source": slug,
        })
    return results


# ---------------------------------------------------------------------------
# Lever
# ---------------------------------------------------------------------------

async def _fetch_lever(client: httpx.AsyncClient, slug: str, company_name: str) -> list[dict]:
    url = f"https://api.lever.co/v0/postings/{slug}"
    resp = await client.get(url, params={"mode": "json"}, headers=_HEADERS, timeout=_TIMEOUT)
    resp.raise_for_status()
    jobs = resp.json()
    if not isinstance(jobs, list):
        jobs = jobs.get("postings", [])
    results = []
    for j in jobs:
        cats = j.get("categories", {})
        location = cats.get("location", "") or ""
        commitment = cats.get("commitment", "") or ""
        description = _strip_html(j.get("descriptionPlain") or j.get("description") or "")
        results.append({
            "url": j.get("hostedUrl") or f"https://jobs.lever.co/{slug}/{j.get('id')}",
            "title": j.get("text", ""),
            "company": company_name,
            "source_company": slug,
            "location_raw": location,
            "work_mode": _infer_work_mode(location, j.get("text", "")),
            "job_type": _map_lever_commitment(commitment),
            "description": description,
            "posted_at": _parse_epoch_ms(j.get("createdAt")),
            "source": slug,
        })
    return results


# ---------------------------------------------------------------------------
# Ashby
# ---------------------------------------------------------------------------

async def _fetch_ashby(client: httpx.AsyncClient, slug: str, company_name: str) -> list[dict]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    headers = {**_HEADERS, "Content-Type": "application/json", "Accept": "application/json"}
    # Try GET first, fall back to POST
    resp = await client.get(url, headers=headers, timeout=_TIMEOUT)
    if resp.status_code == 405:
        resp = await client.post(url, content=b"{}", headers=headers, timeout=_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    jobs = data.get("jobs") or data.get("results") or data.get("jobPostings") or []
    results = []
    for j in jobs:
        location = j.get("location") or j.get("locationName") or ""
        workplace = (j.get("workplaceType") or "").lower()
        work_mode = (
            "remote" if workplace == "remote" or j.get("isRemote")
            else "hybrid" if workplace == "hybrid"
            else "onsite" if workplace in ("onsite", "in_office")
            else _infer_work_mode(location, j.get("title", ""))
        )
        results.append({
            "url": j.get("jobUrl") or j.get("applyUrl") or j.get("applicationUrl") or "",
            "title": j.get("title", ""),
            "company": company_name,
            "source_company": slug,
            "location_raw": location,
            "work_mode": work_mode,
            "job_type": _map_ashby_employment(j.get("employmentType", "")),
            "description": _strip_html(j.get("descriptionHtml") or j.get("descriptionPlain") or ""),
            "posted_at": _parse_iso(j.get("publishedAt")),
            "source": slug,
        })
    return results


# ---------------------------------------------------------------------------
# Google (unofficial)
# ---------------------------------------------------------------------------

async def _fetch_google(client: httpx.AsyncClient) -> list[dict]:
    results = []
    for page in range(1, 6):
        resp = await client.get(
            "https://careers.google.com/api/jobs/results/",
            params={
                "q": "artificial intelligence machine learning",
                "page": page,
                "page_size": 20,
                "sort_by": "date",
            },
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        jobs = data.get("jobs", [])
        if not jobs:
            break
        for j in jobs:
            locations = j.get("locations", [])
            location = locations[0].get("display", "") if locations else ""
            results.append({
                "url": f"https://careers.google.com/jobs/results/{j.get('job_id', '')}",
                "title": j.get("title", ""),
                "company": "Google",
                "source_company": "google",
                "location_raw": location,
                "work_mode": _infer_work_mode(location, j.get("title", "")),
                "job_type": "full_time",
                "description": j.get("description", ""),
                "posted_at": _parse_iso(j.get("publish_date")),
                "source": "google",
            })
    return results


# ---------------------------------------------------------------------------
# Microsoft (unofficial)
# ---------------------------------------------------------------------------

async def _fetch_microsoft(client: httpx.AsyncClient) -> list[dict]:
    results = []
    for page in range(1, 6):
        resp = await client.get(
            "https://gcsservices.careers.microsoft.com/api/search",
            params={
                "q": "artificial intelligence",
                "l": "en_us",
                "pg": page,
                "pgSz": 20,
                "o": "Relevance",
                "flt": "true",
            },
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        jobs = data.get("operationResult", {}).get("result", {}).get("jobs", [])
        if not jobs:
            break
        for j in jobs:
            location = j.get("properties", {}).get("primaryWorkLocation", "")
            job_id = j.get("jobId", "")
            results.append({
                "url": f"https://careers.microsoft.com/us/en/job/{job_id}",
                "title": j.get("title", ""),
                "company": "Microsoft",
                "source_company": "microsoft",
                "location_raw": location,
                "work_mode": _infer_work_mode(location, j.get("title", "")),
                "job_type": "full_time",
                "description": j.get("description", ""),
                "posted_at": _parse_iso(j.get("postingDate")),
                "source": "microsoft",
            })
    return results


# ---------------------------------------------------------------------------
# Amazon (unofficial)
# ---------------------------------------------------------------------------

async def _fetch_amazon(client: httpx.AsyncClient) -> list[dict]:
    results = []
    for offset in range(0, 200, 100):
        resp = await client.get(
            "https://www.amazon.jobs/en/search.json",
            params={
                "query": "artificial intelligence machine learning",
                "result_limit": 100,
                "offset": offset,
                "country_code": "US",
            },
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        jobs = data.get("jobs", [])
        if not jobs:
            break
        for j in jobs:
            location = j.get("location", "")
            results.append({
                "url": f"https://www.amazon.jobs{j.get('job_path', '')}",
                "title": j.get("title", ""),
                "company": "Amazon",
                "source_company": "amazon",
                "location_raw": location,
                "work_mode": _infer_work_mode(location, j.get("title", "")),
                "job_type": "full_time",
                "description": j.get("description", ""),
                "posted_at": _parse_iso(j.get("posted_date")),
                "source": "amazon",
            })
    return results


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def _infer_work_mode(location: str, title: str) -> str | None:
    text = (location + " " + title).lower()
    if "remote" in text:
        return "remote"
    if "hybrid" in text:
        return "hybrid"
    if any(k in text for k in ("onsite", "on-site", "in office", "in-office")):
        return "onsite"
    if location and not any(k in text for k in ("remote", "hybrid", "anywhere", "worldwide")):
        return "onsite"
    return None


def _map_lever_commitment(commitment: str) -> str:
    c = commitment.lower()
    if "part" in c:
        return "part_time"
    if "contract" in c or "freelance" in c:
        return "contract"
    if "intern" in c:
        return "internship"
    return "full_time"


def _map_ashby_employment(employment_type: str) -> str:
    t = employment_type.lower()
    if "part" in t:
        return "part_time"
    if "contract" in t or "freelance" in t:
        return "contract"
    if "intern" in t:
        return "internship"
    return "full_time"


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _parse_epoch_ms(value: int | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=timezone.utc)
    except (ValueError, TypeError):
        return None
