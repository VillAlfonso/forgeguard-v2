"""
JWT authentication utilities.
"""

from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .config import SECRET_KEY, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS
from .database import get_db
from .models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _pw_bytes(password: str) -> bytes:
    # bcrypt has a hard 72-byte limit; truncate to stay safe across all versions.
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:  # No password (e.g., Google OAuth users)
        return False
    try:
        return bcrypt.checkpw(_pw_bytes(plain), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "exp": expire, "type": "access"},
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def create_refresh_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": user_id, "exp": expire, "type": "refresh"},
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def create_verification_token(user_id: str) -> str:
    """Short-lived token emailed to a user to confirm their address (24h)."""
    expire = datetime.utcnow() + timedelta(hours=24)
    return jwt.encode(
        {"sub": user_id, "exp": expire, "type": "verify"},
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def create_reset_token(user_id: str) -> str:
    """Short-lived token emailed to a user to reset their password (1h)."""
    expire = datetime.utcnow() + timedelta(hours=1)
    return jwt.encode(
        {"sub": user_id, "exp": expire, "type": "reset"},
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency: extract the current user from JWT."""
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def get_role_permissions(role_name: str, db: Session) -> list:
    """Look up the permissions JSON array for a given role name."""
    import json
    from .models import Role
    role = db.query(Role).filter(Role.name == role_name).first()
    if not role:
        return []
    try:
        return json.loads(role.permissions or "[]")
    except (ValueError, TypeError):
        return []


def user_has_permission(user: User, perm: str, db: Session) -> bool:
    """Check whether a user's role grants the given permission. Superadmin shortcut included."""
    if not user:
        return False
    perms = get_role_permissions(user.role, db)
    return "is_superadmin" in perms or perm in perms


def get_current_admin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Permission-aware admin check: requires view_users OR superadmin."""
    if user_has_permission(current_user, "view_users", db):
        return current_user
    raise HTTPException(status_code=403, detail="Admin access required")


def get_current_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return current_user


def require_permission(perm: str):
    """Dependency factory: returns a dep that ensures the current user has `perm`."""
    def _dep(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if not user_has_permission(current_user, perm, db):
            raise HTTPException(status_code=403, detail=f"Permission '{perm}' required")
        return current_user
    return _dep


def get_user_from_token(token: str, db: Session) -> User:
    """Resolve a user from a raw access token string.

    Used by endpoints that accept the token as a query parameter (e.g. <img src>
    can't set Authorization headers). Owner-level access only; keep use narrow.
    """
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user
