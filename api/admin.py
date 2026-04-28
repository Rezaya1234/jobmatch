"""Admin dashboard API — all endpoints require is_admin=true on the requesting user."""
import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from db.models import (
    AdminAlert,
    AgentLog,
    AlertThresholds,
    Feedback,
    FeedbackSignal,
    Job,
    JobMatch,
    SourceTrustScore,
    TestAgentMetrics,
    User,
    UserProfile,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

_DEFAULT_THRESHOLDS = {
    "precision_at_50_warning": 0.75,
    "precision_at_50_critical": 0.65,
    "precision_at_15_warning": 0.85,
    "thumbs_up_drop_warning": 0.15,
    "llm_cost_spike_warning": 0.30,
    "llm_daily_budget": 600.0,
    "source_trust_warning": 0.70,
    "false_positive_rate_critical": 0.35,
    "drift_threshold": 0.10,
}


async def _require_admin(user_id: str, session: AsyncSession) -> User:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Pipeline Status
# ---------------------------------------------------------------------------

class PipelineStatusResponse(BaseModel):
    status: str  # healthy / degraded / failed
    last_run_at: datetime | None
    next_run_at: datetime | None
    users_processed: int
    avg_match_score: float | None
    total_llm_cost_today: float
    call1_cost: float
    call2_cost: float
    per_user_avg_cost: float


@router.get("/pipeline-status", response_model=PipelineStatusResponse)
async def get_pipeline_status(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> PipelineStatusResponse:
    await _require_admin(user_id, session)
    today = date.today()

    users_processed = await session.scalar(
        select(func.count(func.distinct(JobMatch.user_id)))
        .where(func.date(JobMatch.created_at) == today)
    ) or 0

    avg_score = await session.scalar(
        select(func.avg(JobMatch.normalized_score))
        .where(
            func.date(JobMatch.created_at) == today,
            JobMatch.normalized_score.isnot(None),
        )
    )

    # Check for any logs today to determine status
    recent_log = await session.scalar(
        select(AgentLog.timestamp)
        .order_by(AgentLog.timestamp.desc())
        .limit(1)
    )

    pipeline_status = "healthy"
    if users_processed == 0:
        pipeline_status = "degraded"

    active_alerts = await session.scalar(
        select(func.count(AdminAlert.id))
        .where(AdminAlert.dismissed_at.is_(None))
        .where(AdminAlert.severity == "CRITICAL")
    ) or 0
    if active_alerts > 0:
        pipeline_status = "failed"

    try:
        from scheduler.scheduler import get_next_run_time
        next_run_at = get_next_run_time("daily_pipeline")
    except Exception:
        next_run_at = None

    return PipelineStatusResponse(
        status=pipeline_status,
        last_run_at=recent_log,
        next_run_at=next_run_at,
        users_processed=users_processed,
        avg_match_score=round(float(avg_score) * 100, 1) if avg_score else None,
        total_llm_cost_today=0.0,
        call1_cost=0.0,
        call2_cost=0.0,
        per_user_avg_cost=0.0,
    )


# ---------------------------------------------------------------------------
# Recommended Actions
# ---------------------------------------------------------------------------

class ActionCard(BaseModel):
    severity: str
    title: str
    description: str
    metric_name: str | None
    metric_value: float | None
    root_cause: str
    recommended_action: str
    alert_id: str | None


@router.get("/recommended-actions", response_model=list[ActionCard])
async def get_recommended_actions(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> list[ActionCard]:
    await _require_admin(user_id, session)

    alerts_result = await session.execute(
        select(AdminAlert)
        .where(AdminAlert.dismissed_at.is_(None))
        .where(AdminAlert.suppressed_until.is_(None) | (AdminAlert.suppressed_until < func.now()))
        .order_by(
            AdminAlert.severity.desc(),
            AdminAlert.triggered_at.desc(),
        )
        .limit(5)
    )
    alerts = alerts_result.scalars().all()

    cards = []
    for a in alerts:
        root_cause = _infer_root_cause(a.metric_name, a.failure_type)
        action = _infer_action(a.metric_name, a.severity)
        cards.append(ActionCard(
            severity=a.severity,
            title=a.title,
            description=a.description,
            metric_name=a.metric_name,
            metric_value=a.metric_value,
            root_cause=root_cause,
            recommended_action=action,
            alert_id=str(a.id),
        ))
    return cards


def _infer_root_cause(metric_name: str | None, failure_type: str | None) -> str:
    if failure_type == "data":
        return "Data quality issue — check source trust scores"
    if failure_type == "infra":
        return "Infrastructure issue — check pipeline logs"
    if metric_name and "precision" in metric_name:
        return "Ranking quality degraded — possible over-filtering"
    if metric_name and "trust" in metric_name:
        return "Scraper quality degrading"
    return "Review pipeline logs for root cause"


def _infer_action(metric_name: str | None, severity: str) -> str:
    if metric_name and "precision" in metric_name:
        return "Review Job Scoring Explorer → check near misses → consider relaxing thresholds"
    if metric_name and "trust" in metric_name:
        return "Open Source Health table → investigate failing sources"
    if metric_name and "cost" in metric_name:
        return "Check LLM usage breakdown → review Call 2 trigger rate"
    if severity == "CRITICAL":
        return "Investigate immediately — check Agent Activity Log"
    return "Monitor for 24 hours — check 7-day trend"


# ---------------------------------------------------------------------------
# Test Agent Metrics
# ---------------------------------------------------------------------------

class MetricSnapshot(BaseModel):
    today: float | None
    baseline_7day: float | None
    delta: float | None
    color: str  # green / amber / red


class TestAgentMetricsResponse(BaseModel):
    run_date: date | None
    precision_at_50: MetricSnapshot
    precision_at_15: MetricSnapshot
    recall_at_50: MetricSnapshot
    ndcg: MetricSnapshot
    coverage: MetricSnapshot
    false_positive_rate: MetricSnapshot
    sample_size: int | None
    confidence_score: float | None
    drift_flags: list[str]
    label_sources: dict | None
    has_data: bool


def _color_precision(val: float | None, warn: float, crit: float) -> str:
    if val is None:
        return "gray"
    if val >= warn:
        return "green"
    if val >= crit:
        return "amber"
    return "red"


def _metric_snap(today_val: float | None, baseline_val: float | None, higher_is_better: bool = True, warn: float = 0.75, crit: float = 0.65) -> MetricSnapshot:
    delta = None
    if today_val is not None and baseline_val is not None:
        delta = round(today_val - baseline_val, 4)
    color = _color_precision(today_val, warn, crit) if higher_is_better else (
        "green" if (today_val is not None and today_val <= crit) else
        "amber" if (today_val is not None and today_val <= warn) else "red"
    )
    return MetricSnapshot(today=today_val, baseline_7day=baseline_val, delta=delta, color=color)


@router.get("/test-agent-metrics", response_model=TestAgentMetricsResponse)
async def get_test_agent_metrics(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> TestAgentMetricsResponse:
    await _require_admin(user_id, session)

    result = await session.execute(
        select(TestAgentMetrics)
        .order_by(TestAgentMetrics.run_date.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()

    if not row:
        empty = MetricSnapshot(today=None, baseline_7day=None, delta=None, color="gray")
        return TestAgentMetricsResponse(
            run_date=None,
            precision_at_50=empty, precision_at_15=empty,
            recall_at_50=empty, ndcg=empty, coverage=empty,
            false_positive_rate=empty, sample_size=None,
            confidence_score=None, drift_flags=[], label_sources=None, has_data=False,
        )

    b = row.baseline_7day or {}
    drift = row.drift_flags or {}
    drift_messages = [v for v in drift.values() if v] if isinstance(drift, dict) else []

    return TestAgentMetricsResponse(
        run_date=row.run_date,
        precision_at_50=_metric_snap(row.precision_at_50, b.get("precision_at_50"), warn=0.80, crit=0.65),
        precision_at_15=_metric_snap(row.precision_at_15, b.get("precision_at_15"), warn=0.85, crit=0.75),
        recall_at_50=_metric_snap(row.recall_at_50, b.get("recall_at_50"), warn=0.70, crit=0.50),
        ndcg=_metric_snap(row.ndcg, b.get("ndcg"), warn=0.80, crit=0.65),
        coverage=_metric_snap(row.coverage, b.get("coverage"), warn=0.70, crit=0.50),
        false_positive_rate=_metric_snap(row.false_positive_rate, b.get("false_positive_rate"), higher_is_better=False, warn=0.35, crit=0.35),
        sample_size=row.sample_size,
        confidence_score=row.confidence_score,
        drift_flags=drift_messages,
        label_sources=row.label_sources,
        has_data=True,
    )


# ---------------------------------------------------------------------------
# Test Agent — manual trigger
# ---------------------------------------------------------------------------

@router.post("/test-agent/run")
async def run_test_agent(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _require_admin(user_id, session)
    from agents.test_agent import TestAgent
    row = await TestAgent(session).run()
    if row is None:
        return {"status": "skipped", "reason": "no users with profiles"}
    return {
        "status": "ok",
        "run_date": str(row.run_date),
        "sample_size": row.sample_size,
        "precision_at_50": row.precision_at_50,
        "ndcg": row.ndcg,
        "coverage": row.coverage,
        "drift_flags": list((row.drift_flags or {}).values()),
    }


# ---------------------------------------------------------------------------
# Agent Activity Log
# ---------------------------------------------------------------------------

class LogEntry(BaseModel):
    id: str
    agent_name: str
    log_level: str
    message: str
    details: dict | None
    run_id: str | None
    timestamp: datetime


@router.get("/agent-logs", response_model=list[LogEntry])
async def get_agent_logs(
    user_id: str = Query(...),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[LogEntry]:
    await _require_admin(user_id, session)

    result = await session.execute(
        select(AgentLog)
        .order_by(AgentLog.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    return [
        LogEntry(
            id=str(r.id),
            agent_name=r.agent_name,
            log_level=r.log_level,
            message=r.message,
            details=r.details,
            run_id=r.run_id,
            timestamp=r.timestamp,
        )
        for r in result.scalars().all()
    ]


# ---------------------------------------------------------------------------
# Pipeline Funnel
# ---------------------------------------------------------------------------

class FunnelStage(BaseModel):
    label: str
    count: int
    drop_pct: float | None


class PipelineFunnelResponse(BaseModel):
    stages: list[FunnelStage]
    run_date: date


@router.get("/pipeline-funnel", response_model=PipelineFunnelResponse)
async def get_pipeline_funnel(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> PipelineFunnelResponse:
    await _require_admin(user_id, session)
    today = date.today()

    total_active = await session.scalar(select(func.count(Job.id)).where(Job.active_status == True)) or 0
    passed_hard = await session.scalar(
        select(func.count(JobMatch.id))
        .where(func.date(JobMatch.created_at) == today, JobMatch.passed_hard_filter == True)
    ) or 0
    has_heuristic = await session.scalar(
        select(func.count(JobMatch.id))
        .where(func.date(JobMatch.created_at) == today, JobMatch.heuristic_score.isnot(None))
    ) or 0
    has_embedding = await session.scalar(
        select(func.count(JobMatch.id))
        .where(func.date(JobMatch.created_at) == today, JobMatch.embedding_score.isnot(None))
    ) or 0
    delivered = await session.scalar(
        select(func.count(JobMatch.id))
        .where(func.date(JobMatch.created_at) == today, JobMatch.delivered_at.isnot(None))
    ) or 0

    def drop(current: int, previous: int) -> float | None:
        if previous == 0:
            return None
        return round((previous - current) / previous * 100, 1)

    stages = [
        FunnelStage(label="Jobs in index", count=total_active, drop_pct=None),
        FunnelStage(label="After hard constraints", count=passed_hard, drop_pct=drop(passed_hard, total_active)),
        FunnelStage(label="After heuristics", count=has_heuristic, drop_pct=drop(has_heuristic, passed_hard)),
        FunnelStage(label="After embedding filter", count=has_embedding, drop_pct=drop(has_embedding, has_heuristic)),
        FunnelStage(label="Delivered", count=delivered, drop_pct=drop(delivered, has_embedding)),
    ]
    return PipelineFunnelResponse(stages=stages, run_date=today)


# ---------------------------------------------------------------------------
# Source Health
# ---------------------------------------------------------------------------

class SourceHealthRow(BaseModel):
    source_slug: str
    jobs_today: int
    jobs_yesterday: int
    pct_change: float | None
    trust_score: float
    trust_color: str
    status: str
    status_color: str
    last_scrape_at: datetime | None


@router.get("/source-health", response_model=list[SourceHealthRow])
async def get_source_health(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> list[SourceHealthRow]:
    await _require_admin(user_id, session)

    result = await session.execute(
        select(SourceTrustScore).order_by(SourceTrustScore.rolling_trust_score.asc())
    )
    rows = result.scalars().all()

    out = []
    for r in rows:
        today = r.jobs_returned_last
        yesterday = r.jobs_returned_prev
        pct = round((today - yesterday) / yesterday * 100, 1) if yesterday > 0 else None

        if today == 0:
            s, sc = "Failed", "red"
        elif yesterday > 0 and today < yesterday * 0.5:
            s, sc = "Degraded", "amber"
        else:
            s, sc = "Healthy", "green"

        trust = r.rolling_trust_score
        tc = "green" if trust >= 0.80 else "amber" if trust >= 0.70 else "red"

        out.append(SourceHealthRow(
            source_slug=r.source_slug,
            jobs_today=today,
            jobs_yesterday=yesterday,
            pct_change=pct,
            trust_score=trust,
            trust_color=tc,
            status=s,
            status_color=sc,
            last_scrape_at=r.last_scrape_at,
        ))

    # Sort: failed first, then degraded, then healthy
    order = {"Failed": 0, "Degraded": 1, "Healthy": 2}
    out.sort(key=lambda x: order.get(x.status, 3))
    return out


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

class AlertResponse(BaseModel):
    id: str
    severity: str
    title: str
    description: str
    metric_name: str | None
    metric_value: float | None
    threshold_value: float | None
    baseline_comparison: str | None
    failure_type: str | None
    triggered_at: datetime
    dismissed_at: datetime | None


@router.get("/alerts", response_model=list[AlertResponse])
async def get_alerts(
    user_id: str = Query(...),
    include_dismissed: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
) -> list[AlertResponse]:
    await _require_admin(user_id, session)

    q = select(AdminAlert).order_by(AdminAlert.triggered_at.desc()).limit(100)
    if not include_dismissed:
        q = q.where(AdminAlert.dismissed_at.is_(None))

    result = await session.execute(q)
    return [
        AlertResponse(
            id=str(a.id),
            severity=a.severity,
            title=a.title,
            description=a.description,
            metric_name=a.metric_name,
            metric_value=a.metric_value,
            threshold_value=a.threshold_value,
            baseline_comparison=a.baseline_comparison,
            failure_type=a.failure_type,
            triggered_at=a.triggered_at,
            dismissed_at=a.dismissed_at,
        )
        for a in result.scalars().all()
    ]


@router.patch("/alerts/{alert_id}/dismiss")
async def dismiss_alert(
    alert_id: str,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await _require_admin(user_id, session)
    await session.execute(
        update(AdminAlert)
        .where(AdminAlert.id == alert_id)
        .values(dismissed_at=func.now(), dismissed_by=user.email)
    )
    await session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# User Activity Summary
# ---------------------------------------------------------------------------

class UserActivityResponse(BaseModel):
    total_active_users: int
    new_profiles_today: int
    feedback_signals_today: int
    cold_start_graduations_today: int
    applied_signals_today: int
    interview_signals_today: int


@router.get("/user-activity", response_model=UserActivityResponse)
async def get_user_activity(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> UserActivityResponse:
    await _require_admin(user_id, session)
    today = date.today()

    total_active = await session.scalar(
        select(func.count(func.distinct(JobMatch.user_id)))
        .where(func.date(JobMatch.created_at) == today)
    ) or 0

    new_profiles = await session.scalar(
        select(func.count(UserProfile.id))
        .where(func.date(UserProfile.created_at) == today)
    ) or 0

    feedback_today = await session.scalar(
        select(func.count(Feedback.id))
        .where(func.date(Feedback.created_at) == today)
    ) or 0

    applied = await session.scalar(
        select(func.count(FeedbackSignal.id))
        .where(func.date(FeedbackSignal.created_at) == today, FeedbackSignal.signal_type == "applied")
    ) or 0

    interview = await session.scalar(
        select(func.count(FeedbackSignal.id))
        .where(func.date(FeedbackSignal.created_at) == today, FeedbackSignal.signal_type == "interview")
    ) or 0

    return UserActivityResponse(
        total_active_users=total_active,
        new_profiles_today=new_profiles,
        feedback_signals_today=feedback_today,
        cold_start_graduations_today=0,
        applied_signals_today=applied,
        interview_signals_today=interview,
    )


# ---------------------------------------------------------------------------
# Job Scoring Explorer
# ---------------------------------------------------------------------------

class ScoredJobRow(BaseModel):
    user_email: str
    job_id: str
    job_title: str
    company: str
    match_score: float | None
    in_top_15: bool
    rejection_stage: str | None
    reaction: str | None
    dimension_scores: dict | None


@router.get("/job-scoring", response_model=list[ScoredJobRow])
async def get_job_scoring(
    user_id: str = Query(...),
    run_date: date = Query(default=None),
    score_min: float = Query(default=0.0),
    score_max: float = Query(default=1.0),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> list[ScoredJobRow]:
    await _require_admin(user_id, session)

    if run_date is None:
        run_date = date.today()

    q = (
        select(JobMatch, Job, User, Feedback)
        .join(Job, JobMatch.job_id == Job.id)
        .join(User, JobMatch.user_id == User.id)
        .outerjoin(Feedback, (Feedback.user_id == JobMatch.user_id) & (Feedback.job_id == JobMatch.job_id))
        .where(func.date(JobMatch.created_at) == run_date)
        .where(JobMatch.normalized_score >= score_min)
        .where(JobMatch.normalized_score <= score_max)
        .order_by(JobMatch.normalized_score.desc())
        .limit(limit)
    )
    result = await session.execute(q)

    rows = []
    for match, job, user, feedback in result.all():
        in_top_15 = match.delivered_at is not None
        rejection_stage = None if in_top_15 else (match.hard_filter_reason or "Filtered by ranking")
        reaction = feedback.rating if feedback else None
        rows.append(ScoredJobRow(
            user_email=user.email,
            job_id=str(job.id),
            job_title=job.title,
            company=job.company,
            match_score=match.normalized_score,
            in_top_15=in_top_15,
            rejection_stage=rejection_stage,
            reaction=reaction,
            dimension_scores=match.dimension_scores,
        ))
    return rows


# ---------------------------------------------------------------------------
# Weight Evolution
# ---------------------------------------------------------------------------

class WeightDataPoint(BaseModel):
    date: str
    weights: dict


class WeightEvolutionResponse(BaseModel):
    platform_avg: list[WeightDataPoint]
    user_data: list[WeightDataPoint] | None


@router.get("/weight-evolution", response_model=WeightEvolutionResponse)
async def get_weight_evolution(
    user_id: str = Query(...),
    target_user_email: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> WeightEvolutionResponse:
    await _require_admin(user_id, session)

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    result = await session.execute(
        select(UserProfile.updated_at, UserProfile.learned_weights)
        .where(UserProfile.updated_at >= cutoff)
        .where(UserProfile.learned_weights.isnot(None))
        .order_by(UserProfile.updated_at.asc())
    )
    rows = result.all()

    by_date: dict[str, list[dict]] = {}
    for updated_at, weights in rows:
        if weights:
            d = updated_at.strftime("%Y-%m-%d")
            by_date.setdefault(d, []).append(weights)

    platform_avg = []
    for d, weight_list in sorted(by_date.items()):
        keys = list(weight_list[0].keys()) if weight_list else []
        avg_weights = {k: round(sum(w.get(k, 0) for w in weight_list) / len(weight_list), 4) for k in keys}
        platform_avg.append(WeightDataPoint(date=d, weights=avg_weights))

    user_data = None
    if target_user_email:
        user_result = await session.execute(
            select(User).where(User.email == target_user_email)
        )
        target = user_result.scalar_one_or_none()
        if target:
            profile_result = await session.execute(
                select(UserProfile).where(UserProfile.user_id == target.id)
            )
            profile = profile_result.scalar_one_or_none()
            if profile and profile.learned_weights:
                user_data = [WeightDataPoint(
                    date=profile.updated_at.strftime("%Y-%m-%d"),
                    weights=profile.learned_weights,
                )]

    return WeightEvolutionResponse(platform_avg=platform_avg, user_data=user_data)


# ---------------------------------------------------------------------------
# Alert Thresholds
# ---------------------------------------------------------------------------

class ThresholdsResponse(BaseModel):
    thresholds: dict[str, float]


class ThresholdsUpdateRequest(BaseModel):
    thresholds: dict[str, float]


@router.get("/thresholds", response_model=ThresholdsResponse)
async def get_thresholds(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> ThresholdsResponse:
    await _require_admin(user_id, session)

    result = await session.execute(select(AlertThresholds))
    rows = result.scalars().all()

    merged = dict(_DEFAULT_THRESHOLDS)
    for row in rows:
        if row.warning_threshold is not None:
            merged[f"{row.metric_name}_warning"] = row.warning_threshold
        if row.critical_threshold is not None:
            merged[f"{row.metric_name}_critical"] = row.critical_threshold

    return ThresholdsResponse(thresholds=merged)


@router.patch("/thresholds")
async def update_thresholds(
    body: ThresholdsUpdateRequest,
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _require_admin(user_id, session)

    from sqlalchemy.dialects.postgresql import insert as pg_insert

    for key, value in body.thresholds.items():
        parts = key.rsplit("_", 1)
        if len(parts) != 2 or parts[1] not in ("warning", "critical"):
            continue
        metric, level = parts

        existing = await session.scalar(
            select(AlertThresholds).where(AlertThresholds.metric_name == metric)
        )
        if existing:
            if level == "warning":
                existing.warning_threshold = value
            else:
                existing.critical_threshold = value
        else:
            new_row = AlertThresholds(metric_name=metric)
            if level == "warning":
                new_row.warning_threshold = value
            else:
                new_row.critical_threshold = value
            session.add(new_row)

    await session.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# User check (for frontend admin guard)
# ---------------------------------------------------------------------------

class AdminCheckResponse(BaseModel):
    is_admin: bool


@router.get("/check", response_model=AdminCheckResponse)
async def admin_check(
    user_id: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> AdminCheckResponse:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return AdminCheckResponse(is_admin=bool(user and user.is_admin))


# ---------------------------------------------------------------------------
# Admin seeding — promote/revoke by email, guarded by ADMIN_SEED_SECRET
# ---------------------------------------------------------------------------

@router.post("/seed")
async def seed_admin(
    email: str = Query(...),
    secret: str = Query(...),
    revoke: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
) -> dict:
    import os
    expected = os.environ.get("ADMIN_SEED_SECRET", "")
    if not expected or secret != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid seed secret")

    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No user with email {email}")

    user.is_admin = not revoke
    await session.commit()
    return {"ok": True, "email": email, "is_admin": user.is_admin}
