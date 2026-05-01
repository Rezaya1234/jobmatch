"""
Per-ATS job fetchers. Each returns a list of normalized job dicts.

Normalized keys:
  url, title, company, source_company (slug), location_raw,
  work_mode, job_type, description, posted_at, source

ATS types:
  greenhouse  — boards-api.greenhouse.io
  lever       — api.lever.co
  ashby       — api.ashbyhq.com
  workday     — {tenant}.wd{n}.myworkdayjobs.com  (POST CXS API)
  google      — careers.google.com (unofficial JSON)
  amazon      — amazon.jobs (unofficial JSON)
"""
import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

try:
    from playwright.async_api import async_playwright as _async_playwright
    _PLAYWRIGHT_OK = True
except ImportError:
    _PLAYWRIGHT_OK = False

logger = logging.getLogger(__name__)

_TIMEOUT = 20
_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobMatchBot/1.0)"}

# Playwright browser launch flags safe for headless Linux containers
_PW_ARGS = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
]
_PW_TIMEOUT = 25_000   # ms per page navigation


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
        if ats == "workday":
            return await _fetch_workday(client, slug, name, source["workday_host"], source["workday_board"])
        if ats == "j2w":
            return await _fetch_j2w(client, slug, name, source["j2w_base"])
        if ats == "halliburton_html":
            return await _fetch_halliburton_html(client, slug, name)
        if ats == "slb_coveo":
            return await _fetch_slb_coveo(slug, name)
        if ats == "oracle_hcm":
            return await _fetch_oracle_hcm(client, slug, name, source["oracle_host"], source["oracle_site"])
        if ats == "eog_html":
            return await _fetch_eog_html(client)
        if ats == "recruitee":
            return await _fetch_recruitee(client, slug, name, source["recruitee_slug"])
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
# Workday (CXS POST API — used by most large enterprise companies)
# ---------------------------------------------------------------------------

_WORKDAY_API_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}
_WORKDAY_PAGE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

_WORKDAY_REMOTE_MAP = {
    "remote":        "remote",
    "fully remote":  "remote",
    "hybrid":        "hybrid",
    "onsite":        "onsite",
    "fully onsite":  "onsite",
    "in office":     "onsite",
}


async def _fetch_workday(
    client: httpx.AsyncClient,
    slug: str,
    company_name: str,
    workday_host: str,
    workday_board: str,
) -> list[dict]:
    # Tenant is the subdomain prefix: e.g. "conocophillips" from "conocophillips.wd1.myworkdayjobs.com"
    tenant = workday_host.split(".")[0]
    page_url = f"https://{workday_host}/en-US/{workday_board}/jobs"
    api_url  = f"https://{workday_host}/wday/cxs/{tenant}/{workday_board}/jobs"

    # GET the jobs page first — establishes CALYPSO_CSRF_TOKEN session cookie
    # that Workday requires before accepting POST requests
    await client.get(page_url, headers=_WORKDAY_PAGE_HEADERS, timeout=_TIMEOUT)

    results = []
    offset = 0
    limit = 20
    while True:
        body = {"appliedFacets": {}, "limit": limit, "offset": offset, "searchText": ""}
        resp = await client.post(api_url, json=body, headers=_WORKDAY_API_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        jobs = data.get("jobPostings", [])
        if not jobs:
            break
        for j in jobs:
            location  = j.get("locationsText") or ""
            ext_path  = j.get("externalPath") or ""
            remote_raw = (j.get("remoteType") or "").lower()
            work_mode  = _WORKDAY_REMOTE_MAP.get(remote_raw) or _infer_work_mode(location, j.get("title", ""))
            results.append({
                "url":          f"https://{workday_host}{ext_path}" if ext_path else "",
                "title":        j.get("title", ""),
                "company":      company_name,
                "source_company": slug,
                "location_raw": location,
                "work_mode":    work_mode,
                "job_type":     "full_time",
                "description":  "",   # Workday list API does not include description
                "posted_at":    None, # Workday returns relative "Posted X Days Ago"
                "source":       slug,
            })
        total = data.get("total", 0)
        offset += limit
        if offset >= min(total, 200):   # cap at 200 per company
            break
    return results


# ---------------------------------------------------------------------------
# EOG Resources — custom ASP Classic portal (careers.eogresources.com)
# Submit search form → parse HTML table for job rows
# ---------------------------------------------------------------------------

_EOG_BASE = "https://careers.eogresources.com"
_EOG_SEARCH_HEADERS = {
    **_HEADERS,
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": f"{_EOG_BASE}/adhocjobsearch.asp",
}

async def _fetch_eog_html(client: httpx.AsyncClient) -> list[dict]:
    resp = await client.post(
        f"{_EOG_BASE}/Process_jobsearch.asp",
        data={"Job_Title": "All", "City": "All", "distance": "1000", "Position_Type": "All"},
        headers=_EOG_SEARCH_HEADERS,
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    html = resp.text

    # Each job is a div.list-group-item block:
    #   <a class="coloredlink bold" href="jobdetails.asp?jo_num=10950&...">Title</a>
    #   <div class="col-md-12 thinrow">Houston, TX</div>
    #   <div class="col-md-12 thinrow">Posted&nbsp;4/16/2026</div>
    block_re = re.compile(
        r'<div[^>]+list-group-item[^>]*>(.*?)</div>\s*</div>\s*</div>',
        re.IGNORECASE | re.DOTALL,
    )
    title_re  = re.compile(r'class="coloredlink bold"[^>]*href="([^"]+)"[^>]*>([^<]+)<', re.I)
    thinrow_re = re.compile(r'class="[^"]*thinrow[^"]*"[^>]*>\s*([^<]+?)\s*<', re.I)
    jo_num_re  = re.compile(r'jo_num=(\d+)', re.I)

    results = []
    seen: set[str] = set()
    for block in block_re.finditer(html):
        block_html = block.group(1)
        tm = title_re.search(block_html)
        if not tm:
            continue
        href, title = tm.group(1), tm.group(2).strip()
        jo_match = jo_num_re.search(href)
        if not jo_match:
            continue
        jo_num = jo_match.group(1)
        if jo_num in seen:
            continue
        seen.add(jo_num)

        thinrows = thinrow_re.findall(block_html)
        location = thinrows[0].strip() if thinrows else ""
        raw_date = thinrows[1].strip() if len(thinrows) > 1 else ""
        # raw_date looks like "Posted\xa04/16/2026" — parse the MM/DD/YYYY part
        date_match = re.search(r'(\d{1,2}/\d{1,2}/\d{4})', raw_date)
        posted_at = _parse_workday_date(date_match.group(1)) if date_match else None

        results.append({
            "url": f"{_EOG_BASE}/{href}",
            "title": title,
            "company": "EOG Resources",
            "source_company": "eogresources",
            "location_raw": location,
            "work_mode": _infer_work_mode(location, title),
            "job_type": "full_time",
            "description": "",
            "posted_at": posted_at,
            "source": "eogresources",
        })
    return results


# ---------------------------------------------------------------------------
# Oracle HCM Cloud — Recruiting Candidate Experience (CE) public API
# ---------------------------------------------------------------------------

_ORACLE_HCM_HEADERS = {
    **_HEADERS,
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

async def _fetch_oracle_hcm(
    client: httpx.AsyncClient,
    slug: str,
    company_name: str,
    oracle_host: str,
    oracle_site: str,
) -> list[dict]:
    base = f"https://{oracle_host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions"
    results = []
    offset = 0
    limit = 25
    total = 9999   # updated from first response
    while offset < min(total, 500):
        finder = (
            f"findReqs;siteNumber={oracle_site}"
            f",limit={limit},offset={offset},sortBy=POSTING_DATES_DESC"
        )
        params = {
            "finder": finder,
            "onlyData": "true",
            "expand": "requisitionList",
        }
        resp = await client.get(base, params=params, headers=_ORACLE_HCM_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])
        if not items:
            break
        item = items[0]
        if offset == 0:
            total = item.get("TotalJobsCount") or total
        req_list = item.get("requisitionList", [])
        if not req_list:
            break
        for j in req_list:
            job_id = str(j.get("Id", ""))
            location = j.get("PrimaryLocation") or ""
            workplace = (j.get("WorkplaceType") or "").lower()
            work_mode = (
                "remote"  if workplace == "remote"
                else "hybrid" if workplace == "hybrid"
                else _infer_work_mode(location, j.get("Title", ""))
            )
            results.append({
                "url": f"https://{oracle_host}/hcmUI/CandidateExperience/en/sites/{oracle_site}/job/{job_id}",
                "title": j.get("Title", ""),
                "company": company_name,
                "source_company": slug,
                "location_raw": location,
                "work_mode": work_mode,
                "job_type": "full_time",
                "description": j.get("ShortDescriptionStr") or "",
                "posted_at": _parse_iso(j.get("PostedDate")),
                "source": slug,
            })
        offset += limit
    return results


# ---------------------------------------------------------------------------
# Recruitee (used by Coterra Energy, etc.)
# ---------------------------------------------------------------------------

async def _fetch_recruitee(
    client: httpx.AsyncClient,
    slug: str,
    company_name: str,
    recruitee_slug: str,
) -> list[dict]:
    resp = await client.get(
        f"https://{recruitee_slug}.recruitee.com/api/offers/",
        headers=_HEADERS,
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    jobs = data.get("offers", [])
    results = []
    for j in jobs:
        city = j.get("city") or ""
        country = j.get("country") or ""
        location = ", ".join(p for p in [city, country] if p)
        remote = j.get("remote", False)
        work_mode = "remote" if remote else _infer_work_mode(location, j.get("title", ""))
        results.append({
            "url": j.get("careers_url") or f"https://{recruitee_slug}.recruitee.com/o/{j.get('slug', '')}",
            "title": j.get("title", ""),
            "company": company_name,
            "source_company": slug,
            "location_raw": location,
            "work_mode": work_mode,
            "job_type": "full_time",
            "description": _strip_html(j.get("description") or ""),
            "posted_at": _parse_iso(j.get("published_at")),
            "source": slug,
        })
    return results


# ---------------------------------------------------------------------------
# J2W (Jobs2Web) — used by ExxonMobil, Expand Energy, Tenaris, TechnipFMC
# POST /services/jobs/search with JSON body; paginate via startrow
# ---------------------------------------------------------------------------

_J2W_HEADERS = {
    **_HEADERS,
    "Content-Type": "application/json",
    "Accept": "application/json",
}

async def _fetch_j2w(
    client: httpx.AsyncClient,
    slug: str,
    company_name: str,
    j2w_base: str,
) -> list[dict]:
    await client.get(j2w_base + "/", headers=_HEADERS, timeout=_TIMEOUT)
    results = []
    startrow = 0
    limit = 25
    while True:
        body = {
            "page": 0,
            "keywords": "",
            "locationsearch": "",
            "sortby": "referencedate",
            "sortdir": "desc",
            "recordsperpage": limit,
            "startrow": startrow,
            "filterquery": {},
        }
        resp = await client.post(
            f"{j2w_base}/services/jobs/search",
            json=body,
            headers=_J2W_HEADERS,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        jobs = resp.json().get("jobList", [])
        if not jobs:
            break
        for j in jobs:
            urltitle = j.get("urltitle") or ""
            url = f"{j2w_base}/jobs/{urltitle}" if urltitle else j2w_base
            location = j.get("location") or ""
            results.append({
                "url": url,
                "title": j.get("title", ""),
                "company": company_name,
                "source_company": slug,
                "location_raw": location,
                "work_mode": _infer_work_mode(location, j.get("title", "")),
                "job_type": "full_time",
                "description": "",
                "posted_at": _parse_iso(j.get("referencedate", "").replace("[UTC]", "")),
                "source": slug,
            })
        startrow += limit
        if len(jobs) < limit or startrow >= 500:   # cap at 500 per company
            break
    return results


# ---------------------------------------------------------------------------
# Halliburton — server-side rendered HTML at jobs.halliburton.com/search
# Pagination via ?startrow=N query param; parse table.searchResults rows
# ---------------------------------------------------------------------------

_HAL_BASE = "https://jobs.halliburton.com"
_HAL_HEADERS = {
    **_HEADERS,
    "Accept": "text/html,application/xhtml+xml",
}
_HAL_ROW_RE = re.compile(
    r'<a\s+href="(/job/[^"]+)"\s+class="jobTitle-link">([^<]+)</a>'
    r'.*?<span class="jobLocation">\s*(.*?)\s*</span>'
    r'.*?<span class="jobDate">\s*(.*?)\s*</span>',
    re.DOTALL | re.IGNORECASE,
)
_HAL_TOTAL_RE = re.compile(r'Results\s+\d+\s+to\s+\d+\s+of\s+(\d+)', re.IGNORECASE)


async def _fetch_halliburton_html(
    client: httpx.AsyncClient,
    slug: str,
    company_name: str,
) -> list[dict]:
    results = []
    seen: set[str] = set()
    startrow = 0
    limit = 25
    total = 9999   # will be updated from first page
    while startrow < min(total, 500):
        resp = await client.get(
            f"{_HAL_BASE}/search",
            params={"startrow": startrow},
            headers=_HAL_HEADERS,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        html = resp.text
        if startrow == 0:
            m = _HAL_TOTAL_RE.search(html)
            if m:
                total = int(m.group(1))
        for m in _HAL_ROW_RE.finditer(html):
            path, title, location, raw_date = m.group(1), m.group(2), m.group(3), m.group(4)
            if path in seen:
                continue
            seen.add(path)
            # raw_date looks like "Apr 27, 2026"
            posted_at = _parse_hal_date(raw_date.strip())
            results.append({
                "url": f"{_HAL_BASE}{path}",
                "title": title.strip(),
                "company": company_name,
                "source_company": slug,
                "location_raw": location.strip(),
                "work_mode": _infer_work_mode(location, title),
                "job_type": "full_time",
                "description": "",
                "posted_at": posted_at,
                "source": slug,
            })
        if not results and startrow == 0:
            break
        startrow += limit
    return results


def _parse_hal_date(value: str) -> datetime | None:
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# SAP SuccessFactors — Playwright browser automation
# SF career portals load jobs via authenticated JS API calls; the only
# reliable way to scrape them is to render the page in a real browser,
# intercept the JSON API responses, and parse what comes back.
# ---------------------------------------------------------------------------

async def _fetch_successfactors(
    slug: str,
    company_name: str,
    sf_company: str,
    sf_url: str | None = None,
) -> list[dict]:
    if not _PLAYWRIGHT_OK:
        logger.warning("Playwright not installed — skipping %s (SuccessFactors)", company_name)
        return []
    portal = sf_url or f"https://career4.successfactors.com/careers?company={sf_company}"
    return await _playwright_sf(slug, company_name, portal)


async def _playwright_sf(slug: str, company_name: str, portal_url: str) -> list[dict]:
    collected: list[dict] = []

    async def on_response(response):
        ct = response.headers.get("content-type", "")
        if "json" not in ct:
            return
        url = response.url
        if not any(k in url for k in ("jobRequisition", "reqsearch", "jobPosting", "JobReq", "careers")):
            return
        try:
            data = await response.json()
            if isinstance(data, dict):
                collected.append(data)
        except Exception:
            pass

    async with _async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=_PW_ARGS)
        page = await browser.new_page()
        page.on("response", on_response)
        try:
            await page.goto(portal_url, wait_until="networkidle", timeout=_PW_TIMEOUT)
        except Exception:
            try:
                await page.goto(portal_url, wait_until="domcontentloaded", timeout=_PW_TIMEOUT)
                await asyncio.sleep(6)
            except Exception:
                pass

        # DOM fallback — grab all links that look like SF job detail pages
        dom_jobs: list[dict] = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('a[href]'))
                .filter(a => /jobId|jobReqId|jobreqId|jobReq/i.test(a.href))
                .map(a => ({ href: a.href, text: (a.textContent || '').trim() }))
                .filter(j => j.text && j.text.length < 200);
        }""")

        await browser.close()

    results = []
    seen: set[str] = set()

    # 1. Parse intercepted JSON API responses
    job_id_fields = ("jobReqId", "jobId", "id", "requisitionId")
    title_fields  = ("externalTitle", "title", "name", "positionName")
    for data in collected:
        jobs = (
            data.get("d", {}).get("results", [])
            or data.get("results", [])
            or data.get("jobPostings", [])
            or data.get("data", [])
            or data.get("jobs", [])
        )
        if not isinstance(jobs, list):
            continue
        for j in jobs:
            title  = next((j.get(f, "") for f in title_fields  if j.get(f)), "").strip()
            job_id = next((str(j.get(f, "")) for f in job_id_fields if j.get(f)), "")
            if not title or not job_id or job_id in seen:
                continue
            seen.add(job_id)
            city    = j.get("city") or ""
            state   = j.get("stateCode") or j.get("state") or ""
            country = j.get("country") or ""
            location = ", ".join(p for p in [city, state, country] if p)
            apply_url = j.get("applyUrl") or j.get("externalJobPostingUrl") or f"{portal_url}&jobId={job_id}"
            results.append({
                "url": apply_url,
                "title": title,
                "company": company_name,
                "source_company": slug,
                "location_raw": location,
                "work_mode": _infer_work_mode(location, title),
                "job_type": "full_time",
                "description": "",
                "posted_at": None,
                "source": slug,
            })

    # 2. DOM fallback — if the API interception got nothing
    if not results:
        job_id_re = re.compile(r'(?:jobId|jobReqId|jobreqId)=(\w+)', re.I)
        for dom in dom_jobs:
            href, text = dom["href"], dom["text"]
            m = job_id_re.search(href)
            uid = m.group(1) if m else href
            if uid in seen:
                continue
            seen.add(uid)
            results.append({
                "url": href,
                "title": text,
                "company": company_name,
                "source_company": slug,
                "location_raw": "",
                "work_mode": None,
                "job_type": "full_time",
                "description": "",
                "posted_at": None,
                "source": slug,
            })

    return results


# ---------------------------------------------------------------------------
# SLB — Coveo-powered career portal (careers.slb.com)
# ---------------------------------------------------------------------------

async def _fetch_slb_coveo(slug: str, company_name: str) -> list[dict]:
    if not _PLAYWRIGHT_OK:
        logger.warning("Playwright not installed — skipping SLB (Coveo)")
        return []

    collected: list[dict] = []

    async def on_response(response):
        ct = response.headers.get("content-type", "")
        if "json" not in ct:
            return
        url = response.url
        if not any(k in url for k in ("coveo", "search", "job")):
            return
        try:
            data = await response.json()
            if isinstance(data, dict) and ("results" in data or "data" in data):
                collected.append(data)
        except Exception:
            pass

    async with _async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=_PW_ARGS)
        page = await browser.new_page()
        page.on("response", on_response)
        try:
            await page.goto("https://careers.slb.com/job-listing", wait_until="networkidle", timeout=_PW_TIMEOUT)
        except Exception:
            try:
                await page.goto("https://careers.slb.com/job-listing", wait_until="domcontentloaded", timeout=_PW_TIMEOUT)
                await asyncio.sleep(6)
            except Exception:
                pass

        dom_jobs: list[dict] = await page.evaluate("""() => {
            return Array.from(document.querySelectorAll('a[href]'))
                .filter(a => /\\/job\\/|position|requisition/i.test(a.href) && a.href.includes('slb'))
                .map(a => ({ href: a.href, text: (a.textContent || '').trim() }))
                .filter(j => j.text && j.text.length > 3 && j.text.length < 200);
        }""")

        await browser.close()

    results = []
    seen: set[str] = set()

    # Parse Coveo search results
    for data in collected:
        jobs = data.get("results", []) or data.get("data", [])
        for j in jobs:
            raw   = j.get("raw", {}) if isinstance(j, dict) else {}
            title = (raw.get("title") or raw.get("sljobname") or
                     j.get("title") or j.get("name") or "").strip()
            url   = j.get("clickUri") or j.get("uri") or j.get("url") or ""
            if not title or not url or url in seen:
                continue
            seen.add(url)
            location = raw.get("location") or raw.get("sllocation") or ""
            results.append({
                "url": url,
                "title": title,
                "company": company_name,
                "source_company": slug,
                "location_raw": location,
                "work_mode": _infer_work_mode(location, title),
                "job_type": "full_time",
                "description": "",
                "posted_at": None,
                "source": slug,
            })

    # DOM fallback
    if not results:
        for dom in dom_jobs:
            if dom["href"] in seen:
                continue
            seen.add(dom["href"])
            results.append({
                "url": dom["href"],
                "title": dom["text"],
                "company": company_name,
                "source_company": slug,
                "location_raw": "",
                "work_mode": None,
                "job_type": "full_time",
                "description": "",
                "posted_at": None,
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
    for offset in range(0, 2000, 100):
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


def _parse_workday_date(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%Y %H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None
