import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # must run before any module reads os.getenv

from fastapi import FastAPI  # noqa: E402 — import after dotenv
from fastapi.middleware.cors import CORSMiddleware

from api.feedback import click_router as feedback_click_router
from api.feedback import router as feedback_router
from api.jobs import router as jobs_router
from api.matches import router as matches_router
from api.pipeline import router as pipeline_router
from api.users import router as users_router
from scheduler import scheduler

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(title="JobMatch", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://jobmatch-76c4.onrender.com",
        "https://jobmatch-dev-static.onrender.com",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(jobs_router)
app.include_router(matches_router)
app.include_router(feedback_router)
app.include_router(feedback_click_router)
app.include_router(pipeline_router)


@app.get("/health", tags=["health"])
async def health_check() -> dict:
    from sqlalchemy import text
    from db.database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}
