"""
Test Agent — computes pipeline evaluation metrics from user feedback.
Writes a daily snapshot to TestAgentMetrics. No LLM calls.
"""
import logging
import math
from datetime import date, timedelta
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import EvaluatedJob, Feedback, Job, JobMatch, TestAgentMetrics, User, UserProfile

logger = logging.getLogger(__name__)

_MIN_LABELED_PER_USER = 3
_K_LARGE = 50
_K_SMALL = 15
_DRIFT_THRESHOLD = 0.05  # flag if metric shifts >5pp from 7-day baseline


class _UserMetrics(NamedTuple):
    precision_at_50: float | None
    precision_at_15: float | None
    recall_at_50: float | None
    ndcg: float | None
    false_positive_rate: float | None
    n_labeled: int


def _dcg(gains: list[float]) -> float:
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def _compute_user_metrics(
    ranked_ids: list[str],
    label_map: dict[str, int],  # job_id -> 1 (relevant) or 0 (not_relevant)
) -> _UserMetrics:
    n_labeled = len(label_map)
    if n_labeled < _MIN_LABELED_PER_USER:
        return _UserMetrics(None, None, None, None, None, n_labeled)

    top_50 = ranked_ids[:_K_LARGE]
    top_15 = ranked_ids[:_K_SMALL]

    labeled_50 = [(jid, label_map[jid]) for jid in top_50 if jid in label_map]
    labeled_15 = [(jid, label_map[jid]) for jid in top_15 if jid in label_map]

    p50 = sum(l for _, l in labeled_50) / len(labeled_50) if labeled_50 else None
    p15 = sum(l for _, l in labeled_15) / len(labeled_15) if labeled_15 else None

    all_relevant = sum(1 for v in label_map.values() if v == 1)
    relevant_in_50 = sum(l for _, l in labeled_50)
    recall = relevant_in_50 / all_relevant if all_relevant > 0 else None

    # NDCG@50: unlabeled positions contribute 0 gain
    gains = [label_map.get(jid, 0) for jid in top_50]
    dcg = _dcg(gains)
    idcg = _dcg(sorted(gains, reverse=True))
    ndcg = dcg / idcg if idcg > 0 else None

    fpr = sum(1 - l for _, l in labeled_50) / len(labeled_50) if labeled_50 else None

    return _UserMetrics(p50, p15, recall, ndcg, fpr, n_labeled)


def _weighted_avg(values: list[float | None], weights: list[int]) -> float | None:
    pairs = [(v, w) for v, w in zip(values, weights) if v is not None and w > 0]
    if not pairs:
        return None
    total_w = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / total_w


def _build_drift_flags(today: dict, baseline: dict) -> dict:
    higher_is_better = {"precision_at_50", "precision_at_15", "recall_at_50", "ndcg", "coverage"}
    flags = {}
    for key, today_val in today.items():
        base_val = baseline.get(key)
        if today_val is None or base_val is None:
            continue
        delta = today_val - base_val
        if key in higher_is_better and delta < -_DRIFT_THRESHOLD:
            flags[key] = f"{key} dropped {abs(delta) * 100:.1f}pp below 7-day baseline"
        elif key == "false_positive_rate" and delta > _DRIFT_THRESHOLD:
            flags[key] = f"false_positive_rate rose {delta * 100:.1f}pp above 7-day baseline"
    return flags


class TestAgent:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def run(self, run_date: date | None = None) -> TestAgentMetrics | None:
        today = run_date or date.today()
        session = self.session

        # 1. All users with profiles
        users_result = await session.execute(
            select(User.id).join(UserProfile, UserProfile.user_id == User.id)
        )
        user_ids = [str(r[0]) for r in users_result.all()]
        if not user_ids:
            logger.info("TestAgent: no users with profiles — skipping")
            return None

        # 2. Per-user metrics
        user_metrics: list[_UserMetrics] = []

        for uid in user_ids:
            ranked_result = await session.execute(
                select(JobMatch.job_id, JobMatch.score)
                .join(Job, JobMatch.job_id == Job.id)
                .where(
                    JobMatch.user_id == uid,
                    JobMatch.passed_hard_filter.is_(True),
                    Job.is_active.is_(True),
                )
                .order_by(JobMatch.score.desc().nulls_last())
            )
            ranked_ids = [str(row.job_id) for row in ranked_result.all()]

            fb_result = await session.execute(
                select(Feedback.job_id, Feedback.rating).where(Feedback.user_id == uid)
            )
            label_map: dict[str, int] = {
                str(row.job_id): (1 if row.rating == "thumbs_up" else 0)
                for row in fb_result.all()
            }

            # EvaluatedJob labels (user source) fill in gaps
            eval_result = await session.execute(
                select(EvaluatedJob.job_id, EvaluatedJob.relevance_label).where(
                    EvaluatedJob.user_id == uid,
                    EvaluatedJob.label_source == "user",
                )
            )
            for row in eval_result.all():
                jid = str(row.job_id)
                if jid not in label_map:
                    label_map[jid] = 1 if row.relevance_label == "relevant" else 0

            user_metrics.append(_compute_user_metrics(ranked_ids, label_map))

        # 3. Aggregate (weighted by labeled sample size per user)
        weights = [m.n_labeled for m in user_metrics]
        p50 = _weighted_avg([m.precision_at_50 for m in user_metrics], weights)
        p15 = _weighted_avg([m.precision_at_15 for m in user_metrics], weights)
        recall = _weighted_avg([m.recall_at_50 for m in user_metrics], weights)
        ndcg = _weighted_avg([m.ndcg for m in user_metrics], weights)
        fpr = _weighted_avg([m.false_positive_rate for m in user_metrics], weights)
        sample_size = sum(
            m.n_labeled for m in user_metrics if m.n_labeled >= _MIN_LABELED_PER_USER
        )

        # 4. Coverage: % of users with ≥1 scored match (score ≥ 0.5)
        covered = 0
        for uid in user_ids:
            has_match = await session.execute(
                select(JobMatch.id)
                .join(Job, JobMatch.job_id == Job.id)
                .where(
                    JobMatch.user_id == uid,
                    JobMatch.passed_hard_filter.is_(True),
                    JobMatch.score >= 0.5,
                    Job.is_active.is_(True),
                )
                .limit(1)
            )
            if has_match.scalar_one_or_none():
                covered += 1
        coverage = covered / len(user_ids)

        # 5. Confidence score — log-scale saturation; 100 labels ≈ 1.0
        confidence = min(1.0, math.log1p(sample_size) / math.log1p(100)) if sample_size > 0 else 0.0

        # 6. 7-day baseline from prior TestAgentMetrics rows
        cutoff = today - timedelta(days=7)
        prior_result = await session.execute(
            select(TestAgentMetrics)
            .where(TestAgentMetrics.run_date >= cutoff, TestAgentMetrics.run_date < today)
            .order_by(TestAgentMetrics.run_date.desc())
        )
        prior_rows = prior_result.scalars().all()

        def _avg_field(rows, field):
            vals = [getattr(r, field) for r in rows if getattr(r, field) is not None]
            return sum(vals) / len(vals) if vals else None

        baseline: dict = {}
        if prior_rows:
            for f in ("precision_at_50", "precision_at_15", "recall_at_50", "ndcg", "coverage", "false_positive_rate"):
                baseline[f] = _avg_field(prior_rows, f)

        # 7. Drift flags
        today_vals = {
            "precision_at_50": p50, "precision_at_15": p15,
            "recall_at_50": recall, "ndcg": ndcg,
            "coverage": coverage, "false_positive_rate": fpr,
        }
        drift_flags = _build_drift_flags(today_vals, baseline) if baseline else {}

        # 8. Label source counts
        fb_total = (await session.execute(select(func.count()).select_from(Feedback))).scalar() or 0
        ej_total = (
            await session.execute(
                select(func.count()).select_from(EvaluatedJob).where(EvaluatedJob.label_source == "user")
            )
        ).scalar() or 0

        # 8b. Embedding health
        active_jobs_total = (
            await session.execute(select(func.count()).select_from(Job).where(Job.is_active.is_(True)))
        ).scalar() or 0
        jobs_with_emb = (
            await session.execute(
                select(func.count()).select_from(Job).where(
                    Job.is_active.is_(True), Job.embedding_vector.is_not(None)
                )
            )
        ).scalar() or 0
        profiles_total = (await session.execute(select(func.count()).select_from(UserProfile))).scalar() or 0
        profiles_with_emb = (
            await session.execute(
                select(func.count()).select_from(UserProfile).where(UserProfile.profile_embedding.is_not(None))
            )
        ).scalar() or 0

        job_emb_pct = round(jobs_with_emb / active_jobs_total, 4) if active_jobs_total else 0.0
        profile_emb_pct = round(profiles_with_emb / profiles_total, 4) if profiles_total else 0.0

        label_sources = {
            "user_feedback": fb_total,
            "evaluated_jobs_user": ej_total,
            "jobs_with_embedding": jobs_with_emb,
            "jobs_missing_embedding": active_jobs_total - jobs_with_emb,
            "job_embedding_coverage": job_emb_pct,
            "profiles_with_embedding": profiles_with_emb,
            "profiles_missing_embedding": profiles_total - profiles_with_emb,
            "profile_embedding_coverage": profile_emb_pct,
        }

        # 9. Upsert
        existing = await session.execute(
            select(TestAgentMetrics).where(TestAgentMetrics.run_date == today)
        )
        row = existing.scalar_one_or_none()
        if row is None:
            row = TestAgentMetrics(run_date=today)
            session.add(row)

        row.precision_at_50 = p50
        row.precision_at_15 = p15
        row.recall_at_50 = recall
        row.ndcg = ndcg
        row.coverage = coverage
        row.false_positive_rate = fpr
        row.sample_size = sample_size
        row.confidence_score = confidence
        row.drift_flags = drift_flags
        row.baseline_7day = baseline or None
        row.label_sources = label_sources

        await session.commit()

        logger.info(
            "TestAgent: date=%s p50=%s p15=%s recall=%s ndcg=%s cov=%.2f fpr=%s n=%d | "
            "job_emb=%.1f%% profile_emb=%.1f%%",
            today,
            f"{p50:.3f}" if p50 is not None else "n/a",
            f"{p15:.3f}" if p15 is not None else "n/a",
            f"{recall:.3f}" if recall is not None else "n/a",
            f"{ndcg:.3f}" if ndcg is not None else "n/a",
            coverage,
            f"{fpr:.3f}" if fpr is not None else "n/a",
            sample_size,
            job_emb_pct * 100,
            profile_emb_pct * 100,
        )
        return row
