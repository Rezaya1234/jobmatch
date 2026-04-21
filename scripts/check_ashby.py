import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio, httpx, json

async def main():
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        for slug in ["openai", "cursor", "perplexity"]:
            url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
            headers = {"User-Agent": "Mozilla/5.0 (compatible; JobMatchBot/1.0)",
                       "Content-Type": "application/json", "Accept": "application/json"}
            r = await client.get(url, headers=headers)
            print(f"\n--- {slug} GET status={r.status_code} ---")
            if r.status_code == 200:
                data = r.json()
                print(f"  keys: {list(data.keys())}")
                for k, v in data.items():
                    if isinstance(v, list):
                        print(f"  {k}: {len(v)} items")
                        if v:
                            print(f"  first item keys: {list(v[0].keys())}")
                    else:
                        print(f"  {k}: {v!r}")
            elif r.status_code == 405:
                print("  405 — trying POST")
                r2 = await client.post(url, content=b"{}", headers=headers)
                print(f"  POST status={r2.status_code}")
                if r2.status_code == 200:
                    data = r2.json()
                    print(f"  keys: {list(data.keys())}")
                    for k, v in data.items():
                        if isinstance(v, list):
                            print(f"  {k}: {len(v)} items")
            else:
                print(f"  body: {r.text[:200]}")

asyncio.run(main())
