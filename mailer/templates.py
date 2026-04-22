from dataclasses import dataclass


@dataclass
class JobDigestItem:
    title: str
    company: str
    url: str
    score: float
    reasoning: str | None
    work_mode: str | None
    location_raw: str | None
    salary_min: int | None
    salary_max: int | None
    salary_currency: str | None
    user_id: str = ""
    job_id: str = ""
    feedback_base_url: str = ""


def build_html(recipient_email: str, items: list[JobDigestItem], date_str: str) -> str:
    job_cards = "\n".join(_job_card_html(i, rank) for rank, i in enumerate(items, start=1))
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your JobMatch Daily Digest</title>
  <style>
    body {{ font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }}
    .wrapper {{ max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }}
    .header {{ background: #1a1a2e; color: #fff; padding: 28px 32px; }}
    .header h1 {{ margin: 0; font-size: 22px; }}
    .header p {{ margin: 6px 0 0; color: #aaa; font-size: 14px; }}
    .body {{ padding: 24px 32px; }}
    .card {{ border: 1px solid #e5e5e5; border-radius: 6px; padding: 20px; margin-bottom: 16px; }}
    .card-rank {{ font-size: 12px; color: #888; margin-bottom: 6px; }}
    .card-title {{ font-size: 18px; font-weight: bold; color: #1a1a2e; margin: 0 0 4px; }}
    .card-company {{ font-size: 14px; color: #555; margin: 0 0 12px; }}
    .card-meta {{ font-size: 13px; color: #666; margin-bottom: 10px; }}
    .card-meta span {{ margin-right: 14px; }}
    .score-bar-bg {{ background: #e5e5e5; border-radius: 4px; height: 6px; margin-bottom: 10px; }}
    .score-bar {{ background: #4caf50; border-radius: 4px; height: 6px; }}
    .score-label {{ font-size: 12px; color: #555; margin-bottom: 8px; }}
    .reasoning {{ font-size: 13px; color: #444; font-style: italic; margin-bottom: 14px; }}
    .btn {{ display: inline-block; background: #1a1a2e; color: #fff; padding: 10px 20px;
            border-radius: 4px; text-decoration: none; font-size: 14px; }}
    .footer {{ text-align: center; padding: 20px; font-size: 12px; color: #aaa; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Your Daily Job Digest</h1>
      <p>{date_str} &mdash; {len(items)} top match{"es" if len(items) != 1 else ""} for {recipient_email}</p>
    </div>
    <div class="body">
      {job_cards}
    </div>
    <div class="footer">
      You're receiving this because you signed up for JobMatch.<br>
      Reply to this email to unsubscribe.
    </div>
  </div>
</body>
</html>"""


def build_plain_text(recipient_email: str, items: list[JobDigestItem], date_str: str) -> str:
    lines = [
        f"YOUR DAILY JOB DIGEST — {date_str}",
        f"{len(items)} top match{'es' if len(items) != 1 else ''} for {recipient_email}",
        "=" * 60,
    ]
    for rank, item in enumerate(items, start=1):
        lines.append(f"\n#{rank} — {item.title} at {item.company}")
        lines.append(f"Match score: {int(item.score * 100)}%")
        if item.reasoning:
            lines.append(f"Why: {item.reasoning}")
        meta = _meta_parts(item)
        if meta:
            lines.append("  ".join(meta))
        lines.append(item.url)
        lines.append("-" * 60)
    lines.append("\nReply to unsubscribe.")
    return "\n".join(lines)


# ------------------------------------------------------------------
# Private helpers
# ------------------------------------------------------------------

def _job_card_html(item: JobDigestItem, rank: int) -> str:
    score_pct = int(item.score * 100)
    meta_parts = _meta_parts(item)
    meta_html = "".join(f"<span>{p}</span>" for p in meta_parts)
    reasoning_html = (
        f'<p class="reasoning">"{item.reasoning}"</p>' if item.reasoning else ""
    )
    feedback_html = ""
    if item.feedback_base_url and item.user_id and item.job_id:
        base = item.feedback_base_url.rstrip("/")
        up_url = f"{base}/feedback/click?user_id={item.user_id}&job_id={item.job_id}&rating=thumbs_up"
        down_url = f"{base}/feedback/click?user_id={item.user_id}&job_id={item.job_id}&rating=thumbs_down"
        feedback_html = f"""
      <div style="margin-top:12px;display:flex;gap:10px;">
        <a href="{up_url}" style="text-decoration:none;background:#dcfce7;color:#166534;
           padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;">👍 Good match</a>
        <a href="{down_url}" style="text-decoration:none;background:#fee2e2;color:#991b1b;
           padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;">👎 Not relevant</a>
      </div>"""
    return f"""
    <div class="card">
      <div class="card-rank">#{rank} Match</div>
      <p class="card-title">{_esc(item.title)}</p>
      <p class="card-company">{_esc(item.company)}</p>
      <div class="card-meta">{meta_html}</div>
      <div class="score-label">{score_pct}% match</div>
      <div class="score-bar-bg"><div class="score-bar" style="width:{score_pct}%"></div></div>
      {reasoning_html}
      <a class="btn" href="{_esc(item.url)}" target="_blank">View Job &rarr;</a>
      {feedback_html}
    </div>"""


def _meta_parts(item: JobDigestItem) -> list[str]:
    parts = []
    if item.work_mode:
        parts.append(item.work_mode.replace("_", " ").title())
    if item.location_raw:
        parts.append(item.location_raw)
    if item.salary_min or item.salary_max:
        currency = item.salary_currency or ""
        lo = f"{item.salary_min:,}" if item.salary_min else "?"
        hi = f"{item.salary_max:,}" if item.salary_max else "?"
        parts.append(f"{currency} {lo}–{hi}")
    return parts


def _esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
    )
