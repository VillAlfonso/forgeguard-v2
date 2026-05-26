"""
Authentication routes: register, login, refresh, me, Google OAuth.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, UserApiKey
from ..auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, create_verification_token,
    create_reset_token, decode_token, get_current_user,
)
from ..config import GOOGLE_CLIENT_ID, FRONTEND_URL
from ..email_utils import send_verification_email, send_reset_email

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Request / Response schemas ──────────────────────────

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str
    full_name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict

class RefreshRequest(BaseModel):
    refresh_token: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    scans_this_month: int
    created_at: str

class GoogleAuthRequest(BaseModel):
    id_token: str

class RegisterResponse(BaseModel):
    message: str
    email: str
    verification_required: bool = True

class ResendRequest(BaseModel):
    email: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str


def user_to_dict(user: User, db: Session = None) -> dict:
    from ..models import Role
    role_name = user.role or "user"
    color = "#6dba85"
    if db is not None:
        role_obj = db.query(Role).filter(Role.name == role_name).first()
        if role_obj:
            color = role_obj.color
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name or "",
        "scans_this_month": user.scans_this_month,
        "role": role_name,
        "role_color": color,
        "is_active": bool(user.is_active),
        "created_at": user.created_at.isoformat() if user.created_at else "",
    }


# ── Endpoints ───────────────────────────────────────────

@router.post("/register", response_model=RegisterResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    # Check duplicates
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Account is created unverified; the user can't log in until they confirm
    # their email via the link we send below.
    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        is_verified=False,
        scans_this_month=0,
        scan_reset_date=datetime.utcnow(),
        verification_sent_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    send_verification_email(user.email, create_verification_token(user.id))

    return RegisterResponse(
        message="Account created. Check your email to confirm your address before signing in.",
        email=user.email,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email before signing in. Check your inbox or request a new link.")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user_to_dict(user, db),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(body: RefreshRequest, db: Session = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user_to_dict(user, db),
    )


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    """Confirm an email address from the link we sent, then bounce to the login page."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "verify":
        return RedirectResponse(url=f"{FRONTEND_URL}/login?verified=0")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        return RedirectResponse(url=f"{FRONTEND_URL}/login?verified=0")

    if not user.is_verified:
        user.is_verified = True
        db.commit()

    return RedirectResponse(url=f"{FRONTEND_URL}/login?verified=1")


@router.post("/resend-verification")
def resend_verification(body: ResendRequest, db: Session = Depends(get_db)):
    """Send a fresh verification link. Always returns success to avoid leaking which emails exist."""
    user = db.query(User).filter(User.email == body.email).first()
    if user and not user.is_verified and user.hashed_password:
        user.verification_sent_at = datetime.utcnow()
        db.commit()
        send_verification_email(user.email, create_verification_token(user.id))
    return {"message": "If that account needs verification, a new link has been sent."}


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Email a password-reset link. Always returns success so emails can't be enumerated."""
    user = db.query(User).filter(User.email == body.email).first()
    # Only password accounts can reset; Google-only accounts have no password to change.
    if user and user.hashed_password:
        send_reset_email(user.email, create_reset_token(user.id))
    return {"message": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Set a new password using a valid reset token from the emailed link."""
    payload = decode_token(body.token)
    if not payload or payload.get("type") != "reset":
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user.hashed_password = hash_password(body.password)
    # Completing a reset proves email ownership, so mark verified too.
    user.is_verified = True
    db.commit()
    return {"message": "Password updated. You can now sign in."}


@router.post("/google", response_model=TokenResponse)
def google_login(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Sign in with Google using an ID token from Google Identity Services."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as grequests
    except ImportError:
        raise HTTPException(status_code=500, detail="Google auth library not installed")

    try:
        idinfo = id_token.verify_oauth2_token(body.id_token, grequests.Request(), GOOGLE_CLIENT_ID)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {str(e)}")

    google_id = idinfo.get("sub")
    email = idinfo.get("email")
    full_name = idinfo.get("name", "")

    if not google_id or not email:
        raise HTTPException(status_code=400, detail="Invalid token: missing google_id or email")

    # Find existing user by google_id
    user = db.query(User).filter(User.google_id == google_id).first()

    if not user:
        # Try to find by email to link existing accounts
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link existing email account to Google
            user.google_id = google_id
            db.commit()
        else:
            # Create new user — generate unique username from email prefix
            base = email.split("@")[0]
            username = base
            n = 1
            while db.query(User).filter(User.username == username).first():
                username = f"{base}{n}"
                n += 1

            user = User(
                email=email,
                username=username,
                hashed_password=None,  # Google users don't have passwords
                full_name=full_name,
                google_id=google_id,
                is_active=True,
                is_verified=True,  # Google already verified the email
                scans_this_month=0,
                scan_reset_date=datetime.utcnow(),
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user_to_dict(user, db),
    )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_to_dict(current_user, db)


@router.put("/me")
def update_me(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if "full_name" in body:
        current_user.full_name = body["full_name"]
    if "username" in body:
        existing = db.query(User).filter(User.username == body["username"]).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = body["username"]
    db.commit()
    db.refresh(current_user)
    return user_to_dict(current_user, db)




class ApiKeyRequest(BaseModel):
    api_key: str


@router.put("/api-key")
def set_api_key(
    body: ApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legacy single-key endpoint — kept for backward compatibility."""
    api_key = body.api_key.strip() if body.api_key else None
    if api_key and not api_key.startswith("AIza"):
        raise HTTPException(status_code=400, detail="Invalid API key format. Gemini API keys start with 'AIza'.")
    current_user.gemini_api_key = api_key
    db.commit()
    return {"success": True, "message": "API key saved" if api_key else "API key removed"}


# ── Multi-key endpoints ──────────────────────────────────────────────────────

def _key_to_dict(k: UserApiKey) -> dict:
    hours_until_reset = None
    if k.quota_exhausted_at:
        from datetime import timezone
        elapsed = (datetime.utcnow() - k.quota_exhausted_at).total_seconds()
        remaining = max(0, 86400 - elapsed)  # 24h window
        hours_until_reset = round(remaining / 3600, 1)

    return {
        "id": k.id,
        "label": k.label,
        "key_preview": f"...{k.api_key[-4:]}",
        "api_key": k.api_key,
        "is_active": bool(k.is_active),
        "quota_exhausted": bool(k.quota_exhausted_at and hours_until_reset and hours_until_reset > 0),
        "hours_until_reset": hours_until_reset,
        "created_at": k.created_at.isoformat() if k.created_at else "",
    }


@router.get("/api-keys")
def list_api_keys(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = db.query(UserApiKey).filter(UserApiKey.user_id == current_user.id).order_by(UserApiKey.created_at).all()
    return {"keys": [_key_to_dict(k) for k in keys]}


class AddKeyRequest(BaseModel):
    api_key: str
    label: str = "My Key"


class UpdateKeyRequest(BaseModel):
    label: str = None
    api_key: str = None


@router.post("/api-keys")
def add_api_key(body: AddKeyRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    api_key = body.api_key.strip()
    if not api_key.startswith("AIza"):
        raise HTTPException(status_code=400, detail="Invalid API key format. Gemini API keys start with 'AIza'.")

    count = db.query(UserApiKey).filter(UserApiKey.user_id == current_user.id).count()
    if count >= 20:
        raise HTTPException(status_code=400, detail="Maximum of 20 API keys allowed.")

    key = UserApiKey(
        user_id=current_user.id,
        label=body.label.strip() or "My Key",
        api_key=api_key,
        is_active=count == 0,  # Auto-activate if first key
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return _key_to_dict(key)


@router.delete("/api-keys/{key_id}")
def delete_api_key(key_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(UserApiKey).filter(UserApiKey.id == key_id, UserApiKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    db.delete(key)
    db.commit()
    return {"success": True}


@router.put("/api-keys/{key_id}/activate")
def activate_api_key(key_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = db.query(UserApiKey).filter(UserApiKey.user_id == current_user.id).all()
    target = next((k for k in keys if k.id == key_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Key not found")
    for k in keys:
        k.is_active = (k.id == key_id)
    db.commit()
    return {"success": True}


@router.put("/api-keys/{key_id}")
def update_api_key(
    key_id: str,
    body: UpdateKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key = db.query(UserApiKey).filter(UserApiKey.id == key_id, UserApiKey.user_id == current_user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")

    if body.label is not None:
        key.label = body.label.strip()

    if body.api_key is not None:
        api_key = body.api_key.strip()
        if not api_key.startswith("AIza"):
            raise HTTPException(status_code=400, detail="Invalid API key format. Gemini API keys start with 'AIza'.")
        key.api_key = api_key

    db.commit()
    return _key_to_dict(key)
