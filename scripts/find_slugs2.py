"""Extended slug search including Ashby and more variations."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobMatchBot/1.0)"}

async def check_greenhouse(client, slug):
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    try:
        r = await client.get(url, headers=_HEADERS, timeout=10)
        if r.status_code == 200:
            count = len(r.json().get("jobs", []))
            return ("greenhouse", slug, count)
    except Exception:
        pass
    return None

async def check_lever(client, slug):
    url = f"https://api.lever.co/v0/postings/{slug}"
    try:
        r = await client.get(url, params={"mode": "json"}, headers=_HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            count = len(data) if isinstance(data, list) else len(data.get("postings", []))
            return ("lever", slug, count)
    except Exception:
        pass
    return None

async def check_ashby(client, slug):
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
    try:
        r = await client.get(url, headers=_HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            jobs = data.get("results") or data.get("jobPostings") or []
            return ("ashby", slug, len(jobs))
        if r.status_code == 405:
            r2 = await client.post(url, content=b"{}", headers=_HEADERS, timeout=10)
            if r2.status_code == 200:
                data = r2.json()
                jobs = data.get("results") or data.get("jobPostings") or []
                return ("ashby", slug, len(jobs))
    except Exception:
        pass
    return None

async def find(client, company, candidates):
    """Try all ATS types for each slug candidate."""
    tasks = []
    for slug in candidates:
        tasks.append(check_greenhouse(client, slug))
        tasks.append(check_lever(client, slug))
        tasks.append(check_ashby(client, slug))
    results = await asyncio.gather(*tasks)
    found = [r for r in results if r]
    return found

COMPANIES = {
    "OpenAI":       ["openai", "open-ai"],
    "Cohere":       ["cohere", "cohere-inc"],
    "Hugging Face": ["huggingface", "huggingfaceinc", "hf"],
    "W&B":          ["wandb", "wandbai"],
    "Groq":         ["groq", "groq-inc", "groqinc"],
    "Writer":       ["writer", "writerai", "writer-inc"],
    "Runway":       ["runway", "runwayml"],
    "Pinecone":     ["pinecone", "pinecone-io"],
    "Gong":         ["gong", "gong-io", "gongio"],
    "C3.ai":        ["c3ai", "c3dotai", "c3-ai"],
    "Palantir":     ["palantir", "palantirtechnologies"],
    "DataRobot":    ["datarobot"],
    "Zendesk":      ["zendesk", "zendeskinc"],
    "Perplexity":   ["perplexityai", "perplexity-ai", "perplexity"],
    "ElevenLabs":   ["elevenlabs", "eleven-labs"],
    "Cursor":       ["anysphere", "cursor", "cursorai"],
    "Harvey AI":    ["harveyai", "harvey-ai", "harvey"],
    "Sierra AI":    ["sierra-ai", "sierraai", "sierra"],
    "Mistral AI":   ["mistral", "mistralai", "mistral-ai"],
}

async def main():
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for company, slugs in COMPANIES.items():
            found = await find(client, company, slugs)
            if found:
                print(f"  {company}: {found}")
            else:
                print(f"  {company}: NOT FOUND on GH/Lever/Ashby")

asyncio.run(main())
