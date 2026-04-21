"""Find ATS slugs for the 6 companies not currently in company_sources.py."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio, httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobMatchBot/1.0)",
            "Accept": "application/json", "Content-Type": "application/json"}

async def try_greenhouse(client, slug):
    try:
        r = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
                             headers=_HEADERS, timeout=10)
        if r.status_code == 200:
            return ("greenhouse", slug, len(r.json().get("jobs", [])))
    except Exception:
        pass

async def try_lever(client, slug):
    try:
        r = await client.get(f"https://api.lever.co/v0/postings/{slug}",
                             params={"mode": "json"}, headers=_HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            cnt = len(data) if isinstance(data, list) else len(data.get("postings", []))
            return ("lever", slug, cnt)
    except Exception:
        pass

async def try_ashby(client, slug):
    try:
        r = await client.get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}",
                             headers=_HEADERS, timeout=15)
        if r.status_code == 200:
            data = r.json()
            cnt = len(data.get("jobs") or data.get("results") or data.get("jobPostings") or [])
            return ("ashby", slug, cnt)
        if r.status_code == 405:
            r2 = await client.post(f"https://api.ashbyhq.com/posting-api/job-board/{slug}",
                                   content=b"{}", headers=_HEADERS, timeout=15)
            if r2.status_code == 200:
                data = r2.json()
                cnt = len(data.get("jobs") or data.get("results") or data.get("jobPostings") or [])
                return ("ashby", slug, cnt)
    except Exception:
        pass

CANDIDATES = {
    "Hugging Face": ["huggingface", "huggingfaceinc", "hf", "hugging-face"],
    "W&B":          ["wandb", "weightsandbiases", "weights-and-biases", "wandbai"],
    "Groq":         ["groq", "groqinc", "groq-inc"],
    "C3.ai":        ["c3ai", "c3-ai", "c3dotai", "c3dot-ai"],
    "DataRobot":    ["datarobot", "data-robot", "datarob"],
    "Zendesk":      ["zendesk", "zendeskinc", "zendeskjobs"],
}

async def main():
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for company, slugs in CANDIDATES.items():
            tasks = []
            for slug in slugs:
                tasks += [try_greenhouse(client, slug),
                          try_lever(client, slug),
                          try_ashby(client, slug)]
            results = [r for r in await asyncio.gather(*tasks) if r]
            if results:
                print(f"  {company}: {results}")
            else:
                print(f"  {company}: NOT FOUND (tried {slugs})")

asyncio.run(main())
