"""Try multiple slug variations to find which ones work for each ATS."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; JobMatchBot/1.0)"}

GREENHOUSE_CANDIDATES = {
    "OpenAI":          ["openai", "open-ai", "openai-2"],
    "Cohere":          ["cohere", "cohere-inc"],
    "Hugging Face":    ["huggingface", "huggingfaceinc", "hugging-face"],
    "W&B":             ["wandb", "weightsandbiases", "weights-biases"],
    "Groq":            ["groq", "groq-inc"],
    "Glean":           ["glean", "gleanie", "gleanwork"],
    "Writer":          ["writer", "writer-inc", "writerai"],
    "Runway":          ["runway", "runwayml", "runway-ml"],
    "Pinecone":        ["pinecone", "pinecone-inc"],
    "Gong":            ["gong", "gong-io"],
    "C3.ai":           ["c3dotai", "c3ai", "c3-ai"],
    "Palantir":        ["palantir", "palantirtechnologies"],
    "DataRobot":       ["datarobot", "data-robot"],
    "Zendesk":         ["zendesk", "zendesk-inc"],
}

LEVER_CANDIDATES = {
    "Perplexity":      ["perplexity", "perplexityai", "perplexity-ai"],
    "ElevenLabs":      ["elevenlabs", "eleven-labs", "elevenlabs-2"],
    "Cursor":          ["cursor", "anysphere", "cursorai"],
    "Harvey AI":       ["harvey", "harveyai", "harvey-ai"],
    "Sierra AI":       ["sierra", "sierra-ai", "sierraai"],
}

async def check_greenhouse(client, company, slug):
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
    try:
        r = await client.get(url, headers=_HEADERS, timeout=10)
        if r.status_code == 200:
            count = len(r.json().get("jobs", []))
            return slug, count
    except Exception:
        pass
    return None, 0

async def check_lever(client, company, slug):
    url = f"https://api.lever.co/v0/postings/{slug}"
    try:
        r = await client.get(url, params={"mode": "json"}, headers=_HEADERS, timeout=10)
        if r.status_code == 200:
            data = r.json()
            count = len(data) if isinstance(data, list) else len(data.get("postings", []))
            return slug, count
    except Exception:
        pass
    return None, 0

async def main():
    async with httpx.AsyncClient(follow_redirects=True) as client:
        print("=== GREENHOUSE ===")
        for company, slugs in GREENHOUSE_CANDIDATES.items():
            tasks = [check_greenhouse(client, company, s) for s in slugs]
            results = await asyncio.gather(*tasks)
            found = [(s, c) for s, c in results if s]
            if found:
                print(f"  {company}: {found}")
            else:
                print(f"  {company}: NO MATCH (tried {slugs})")

        print("\n=== LEVER ===")
        for company, slugs in LEVER_CANDIDATES.items():
            tasks = [check_lever(client, company, s) for s in slugs]
            results = await asyncio.gather(*tasks)
            found = [(s, c) for s, c in results if s]
            if found:
                print(f"  {company}: {found}")
            else:
                print(f"  {company}: NO MATCH (tried {slugs})")

asyncio.run(main())
