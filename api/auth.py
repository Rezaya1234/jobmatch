"""Password-based authentication endpoints."""
import asyncio
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_session
from api.users import UserResponse, _user_response
from db.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")
_VERIFY_TTL = timedelta(hours=24)
_RESET_TTL = timedelta(hours=1)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    password: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ---------------------------------------------------------------------------
# Email helpers (plain for now — Section 3 adds branded templates)
# ---------------------------------------------------------------------------

async def _send_auth_email(to: str, subject: str, html: str, plain: str) -> None:
    from mailer.sender import _send_via_sendgrid
    await asyncio.to_thread(_send_via_sendgrid, to, subject, html, plain)


async def _send_verification_email(email: str, token: str) -> None:
    from mailer.templates import build_verification_html, build_verification_plain_text
    link = f"{FRONTEND_URL}/verify-email?token={token}"
    try:
        await _send_auth_email(
            email,
            "Verify your StellaPath email",
            build_verification_html(email, link),
            build_verification_plain_text(email, link),
        )
    except Exception:
        logger.exception("Failed to send verification email to %s", email)


async def _send_reset_email(email: str, token: str) -> None:
    from mailer.templates import build_password_reset_html, build_password_reset_plain_text
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    try:
        await _send_auth_email(
            email,
            "Reset your StellaPath password",
            build_password_reset_html(email, link),
            build_password_reset_plain_text(email, link),
        )
    except Exception:
        logger.exception("Failed to send reset email to %s", email)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    if len(body.password) < 8:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters",
        )
    result = await session.execute(select(User).where(User.email == body.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, detail="An account with that email already exists")

    token = secrets.token_urlsafe(32)
    user = User(
        email=body.email.lower(),
        password_hash=_hash_password(body.password),
        email_verified=False,
        verification_token=token,
        verification_token_expires_at=datetime.now(timezone.utc) + _VERIFY_TTL,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    await _send_verification_email(user.email, token)
    return _user_response(user, is_new=True)


@router.post("/login", response_model=UserResponse)
async def login(
    body: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    result = await session.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    # Constant-time check to prevent user enumeration
    if not user or not user.password_hash:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not _check_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.email_verified:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before signing in. Check your inbox for the verification link.",
        )

    return _user_response(user)


@router.get("/verify-email/{token}", response_model=dict)
async def verify_email(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.execute(select(User).where(User.verification_token == token))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or already-used verification link")
    now = datetime.now(timezone.utc)
    if user.verification_token_expires_at and user.verification_token_expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Verification link has expired — request a new one below")

    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    await session.commit()
    return {"ok": True, "email": user.email}


@router.post("/resend-verification", response_model=dict)
async def resend_verification(
    body: ResendVerificationRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    if user and not user.email_verified and user.password_hash:
        token = secrets.token_urlsafe(32)
        user.verification_token = token
        user.verification_token_expires_at = datetime.now(timezone.utc) + _VERIFY_TTL
        await session.commit()
        await _send_verification_email(user.email, token)

    # Always return ok — don't leak whether email exists
    return {"ok": True}


@router.post("/forgot-password", response_model=dict)
async def forgot_password(
    body: ForgotPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    if user and user.password_hash:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.now(timezone.utc) + _RESET_TTL
        await session.commit()
        await _send_reset_email(user.email, token)

    return {"ok": True}


@router.post("/reset-password/{token}", response_model=dict)
async def reset_password(
    token: str,
    body: ResetPasswordRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    if len(body.password) < 8:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters",
        )
    result = await session.execute(select(User).where(User.reset_token == token))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or already-used reset link")
    now = datetime.now(timezone.utc)
    if user.reset_token_expires_at and user.reset_token_expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Reset link has expired — request a new one")

    user.password_hash = _hash_password(body.password)
    user.reset_token = None
    user.reset_token_expires_at = None
    await session.commit()
    return {"ok": True}
