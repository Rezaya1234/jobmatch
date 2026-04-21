"""
Unit tests for email template builders — pure functions, no I/O.
"""

import pytest

from mailer.templates import JobDigestItem, _esc, _meta_parts, build_html, build_plain_text

DATE = "April 18, 2026"
EMAIL = "user@example.com"


def make_item(**kwargs) -> JobDigestItem:
    defaults = dict(
        title="Senior Engineer",
        company="Acme Corp",
        url="https://example.com/job/1",
        score=0.87,
        reasoning="Strong match for your fintech background.",
        work_mode="remote",
        location_raw="New York, NY",
        salary_min=120_000,
        salary_max=180_000,
        salary_currency="USD",
    )
    defaults.update(kwargs)
    return JobDigestItem(**defaults)


# ------------------------------------------------------------------
# HTML escaping
# ------------------------------------------------------------------

class TestEsc:
    def test_escapes_ampersand(self):
        assert _esc("A & B") == "A &amp; B"

    def test_escapes_less_than(self):
        assert _esc("<script>") == "&lt;script&gt;"

    def test_escapes_double_quotes(self):
        assert _esc('"hello"') == "&quot;hello&quot;"

    def test_plain_text_unchanged(self):
        assert _esc("hello world 123") == "hello world 123"


# ------------------------------------------------------------------
# Meta parts
# ------------------------------------------------------------------

class TestMetaParts:
    def test_includes_work_mode(self):
        parts = _meta_parts(make_item(work_mode="remote"))
        assert any("Remote" in p for p in parts)

    def test_formats_salary_with_commas(self):
        parts = _meta_parts(make_item(salary_min=100_000, salary_max=200_000, salary_currency="USD"))
        salary_part = next(p for p in parts if "USD" in p)
        assert "100,000" in salary_part
        assert "200,000" in salary_part

    def test_omits_salary_when_both_missing(self):
        parts = _meta_parts(make_item(salary_min=None, salary_max=None))
        assert not any("USD" in p for p in parts)

    def test_includes_location(self):
        parts = _meta_parts(make_item(location_raw="New York, NY"))
        assert "New York, NY" in parts


# ------------------------------------------------------------------
# Plain text
# ------------------------------------------------------------------

class TestBuildPlainText:
    def test_contains_job_title(self):
        text = build_plain_text(EMAIL, [make_item()], DATE)
        assert "Senior Engineer" in text

    def test_contains_company(self):
        text = build_plain_text(EMAIL, [make_item()], DATE)
        assert "Acme Corp" in text

    def test_contains_score_as_percentage(self):
        text = build_plain_text(EMAIL, [make_item(score=0.87)], DATE)
        assert "87%" in text

    def test_contains_url(self):
        text = build_plain_text(EMAIL, [make_item()], DATE)
        assert "https://example.com/job/1" in text

    def test_multiple_items_numbered(self):
        items = [make_item(), make_item(title="Junior Dev", url="https://example.com/2")]
        text = build_plain_text(EMAIL, items, DATE)
        assert "#1" in text
        assert "#2" in text

    def test_contains_date(self):
        text = build_plain_text(EMAIL, [make_item()], DATE)
        assert DATE in text


# ------------------------------------------------------------------
# HTML
# ------------------------------------------------------------------

class TestBuildHtml:
    def test_is_html_document(self):
        html = build_html(EMAIL, [make_item()], DATE)
        assert html.strip().startswith("<!DOCTYPE html>")
        assert "</html>" in html

    def test_contains_job_title(self):
        html = build_html(EMAIL, [make_item(title="Staff Engineer")], DATE)
        assert "Staff Engineer" in html

    def test_escapes_company_name(self):
        html = build_html(EMAIL, [make_item(company="A & B Corp")], DATE)
        assert "&amp;" in html
        assert "A & B Corp" not in html

    def test_contains_apply_link(self):
        html = build_html(EMAIL, [make_item(url="https://example.com/apply")], DATE)
        assert "https://example.com/apply" in html

    def test_shows_score_percentage(self):
        html = build_html(EMAIL, [make_item(score=0.92)], DATE)
        assert "92%" in html
