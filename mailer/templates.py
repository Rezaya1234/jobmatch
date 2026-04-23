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


# ------------------------------------------------------------------
# Daily digest
# ------------------------------------------------------------------

def build_html(recipient_email: str, items: list[JobDigestItem], date_str: str, frontend_url: str) -> str:
    job_cards = "\n".join(_job_card_html(i, rank) for rank, i in enumerate(items, start=1))
    dashboard_url = f"{frontend_url}/dashboard" if frontend_url else "#"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Stellapath Daily Digest</title>
  <style>
    body {{ font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }}
    .wrapper {{ max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }}
    .header {{ background: #fff; border-bottom: 1px solid #e5e5e5; padding: 24px 32px; display: flex; align-items: center; gap: 12px; }}
    .header-text h1 {{ margin: 0; font-size: 18px; color: #1a1a2e; }}
    .header-text p {{ margin: 4px 0 0; color: #888; font-size: 13px; }}
    .body {{ padding: 24px 32px; }}
    .card {{ border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px; margin-bottom: 16px; }}
    .card-rank {{ font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }}
    .card-title {{ font-size: 17px; font-weight: bold; color: #1a1a2e; margin: 0 0 3px; }}
    .card-company {{ font-size: 13px; color: #666; margin: 0 0 12px; }}
    .card-meta {{ font-size: 12px; color: #888; margin-bottom: 10px; }}
    .card-meta span {{ margin-right: 12px; }}
    .score-bar-bg {{ background: #e5e5e5; border-radius: 4px; height: 5px; margin-bottom: 8px; }}
    .score-bar {{ border-radius: 4px; height: 5px; }}
    .score-label {{ font-size: 11px; color: #888; margin-bottom: 10px; }}
    .reasoning {{ font-size: 13px; color: #444; font-style: italic; margin-bottom: 14px; line-height: 1.5; }}
    .btn-primary {{ display: inline-block; background: #6366f1; color: #fff !important; padding: 10px 20px;
                   border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600; }}
    .cta-block {{ text-align: center; padding: 20px 0 8px; }}
    .cta-btn {{ display: inline-block; background: #6366f1; color: #fff !important; padding: 12px 28px;
               border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 700; }}
    .footer {{ text-align: center; padding: 20px; font-size: 12px; color: #bbb; border-top: 1px solid #f0f0f0; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-text">
        <h1>Your Daily Job Digest</h1>
        <p>{date_str} &mdash; {len(items)} top match{"es" if len(items) != 1 else ""} for {recipient_email}</p>
      </div>
    </div>
    <div class="body">
      {job_cards}
      <div class="cta-block">
        <a href="{_esc(dashboard_url)}" class="cta-btn">View your full dashboard &rarr;</a>
      </div>
    </div>
    <div class="footer">
      You&rsquo;re receiving this because you signed up for Stellapath.<br>
      Reply to this email to unsubscribe.
    </div>
  </div>
</body>
</html>"""


def build_plain_text(recipient_email: str, items: list[JobDigestItem], date_str: str, frontend_url: str) -> str:
    dashboard_url = f"{frontend_url}/dashboard" if frontend_url else ""
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
    if dashboard_url:
        lines.append(f"\nSee all your matches: {dashboard_url}")
    lines.append("\nReply to unsubscribe.")
    return "\n".join(lines)


# ------------------------------------------------------------------
# Re-engagement email (sent when user hasn't visited in 30+ days)
# ------------------------------------------------------------------

def build_reengagement_html(recipient_email: str, frontend_url: str) -> str:
    dashboard_url = f"{frontend_url}/dashboard" if frontend_url else "#"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We miss you — Stellapath</title>
  <style>
    body {{ font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }}
    .wrapper {{ max-width: 560px; margin: 48px auto; background: #fff; border-radius: 10px; overflow: hidden; }}
    .body {{ padding: 40px 40px 32px; text-align: center; }}
    .icon {{ font-size: 40px; margin-bottom: 16px; }}
    h1 {{ font-size: 22px; color: #1a1a2e; margin: 0 0 12px; }}
    p {{ font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 24px; }}
    .cta-btn {{ display: inline-block; background: #6366f1; color: #fff !important; padding: 14px 32px;
               border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 700; }}
    .footer {{ text-align: center; padding: 20px; font-size: 12px; color: #bbb; border-top: 1px solid #f0f0f0; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="body">
      <div class="icon">✦</div>
      <h1>Your career path is waiting</h1>
      <p>It&rsquo;s been a while since you checked in. New jobs have been matched to your profile and are ready to review.</p>
      <a href="{_esc(dashboard_url)}" class="cta-btn">Visit your dashboard &rarr;</a>
    </div>
    <div class="footer">
      You&rsquo;re receiving this because you signed up for Stellapath.<br>
      Reply to this email to unsubscribe.
    </div>
  </div>
</body>
</html>"""


def build_reengagement_plain_text(recipient_email: str, frontend_url: str) -> str:
    dashboard_url = f"{frontend_url}/dashboard" if frontend_url else ""
    lines = [
        "YOUR CAREER PATH IS WAITING",
        "",
        "It's been a while since you checked in. New jobs have been matched",
        "to your profile and are ready to review.",
        "",
    ]
    if dashboard_url:
        lines.append(f"Visit your dashboard: {dashboard_url}")
    lines.append("\nReply to unsubscribe.")
    return "\n".join(lines)


# ------------------------------------------------------------------
# Private helpers
# ------------------------------------------------------------------

def _job_card_html(item: JobDigestItem, rank: int) -> str:
    score_pct = int(item.score * 100)
    bar_color = "#22c55e" if score_pct >= 80 else "#f59e0b" if score_pct >= 60 else "#94a3b8"
    meta_parts = _meta_parts(item)
    meta_html = "".join(f"<span>{p}</span>" for p in meta_parts)
    reasoning_html = (
        f'<p class="reasoning">"{_esc(item.reasoning)}"</p>' if item.reasoning else ""
    )
    return f"""
    <div class="card">
      <div class="card-rank">#{rank} Match</div>
      <p class="card-title">{_esc(item.title)}</p>
      <p class="card-company">{_esc(item.company)}</p>
      <div class="card-meta">{meta_html}</div>
      <div class="score-label">{score_pct}% match</div>
      <div class="score-bar-bg"><div class="score-bar" style="width:{score_pct}%;background:{bar_color}"></div></div>
      {reasoning_html}
      <a class="btn-primary" href="{_esc(item.url)}" target="_blank">View Job &rarr;</a>
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
    if not text:
        return ""
    return (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
    )
