"""
Admin CRUD routes — all endpoints require is_admin=True.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..auth import get_current_admin, get_current_super_admin, hash_password
from ..database import get_db
from ..models import User, Scan, PromoCode
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/admin", tags=["admin"])


VALID_PLANS = {"free", "basic", "pro"}


class UserUpdate(BaseModel):
    plan: Optional[str] = None
    is_admin: Optional[bool] = None
    is_super_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None  # optional reset


def _user_row(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "full_name": u.full_name or "",
        "plan": u.plan,
        "is_admin": bool(u.is_admin),
        "is_super_admin": bool(u.is_super_admin),
        "is_active": bool(u.is_active),
        "is_verified": bool(u.is_verified),
        "scans_this_month": u.scans_this_month,
        "stripe_customer_id": u.stripe_customer_id,
        "stripe_subscription_id": u.stripe_subscription_id,
        "created_at": u.created_at.isoformat() if u.created_at else "",
        "updated_at": u.updated_at.isoformat() if u.updated_at else "",
    }


@router.get("/stats")
def stats(_: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_scans = db.query(func.count(Scan.id)).scalar() or 0
    plan_counts = dict(db.query(User.plan, func.count(User.id)).group_by(User.plan).all())
    admin_count = db.query(func.count(User.id)).filter(User.is_admin == True).scalar() or 0
    return {
        "total_users": total_users,
        "total_scans": total_scans,
        "admins": admin_count,
        "plans": {p: plan_counts.get(p, 0) for p in ("free", "basic", "pro")},
    }


@router.get("/users")
def list_users(
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
    q: Optional[str] = None,
    plan: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(User.email.ilike(like), User.username.ilike(like), User.full_name.ilike(like)))
    if plan:
        query = query.filter(User.plan == plan)

    total = query.count()
    rows = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    return {"users": [_user_row(u) for u in rows], "total": total}


@router.get("/users/{user_id}")
def get_user(user_id: str, _: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    scan_count = db.query(func.count(Scan.id)).filter(Scan.user_id == user_id).scalar() or 0
    data = _user_row(user)
    data["total_scans"] = scan_count
    return data


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    body: UserUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.plan is not None:
        if body.plan not in VALID_PLANS:
            raise HTTPException(status_code=400, detail=f"Invalid plan. Options: {sorted(VALID_PLANS)}")
        user.plan = body.plan

    if body.is_admin is not None or body.is_super_admin is not None:
        if not admin.is_super_admin:
            raise HTTPException(status_code=403, detail="Only super admins can change admin roles")

    if body.is_admin is not None:
        if user.id == admin.id and body.is_admin is False:
            raise HTTPException(status_code=400, detail="You cannot remove your own admin role")
        user.is_admin = body.is_admin

    if body.is_super_admin is not None:
        if user.id == admin.id and body.is_super_admin is False:
            # Check if user is the last super admin
            super_admin_count = db.query(User).filter(User.is_super_admin == True).count()
            if super_admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot remove the last super admin")
        user.is_super_admin = body.is_super_admin

    if body.is_active is not None:
        if user.id == admin.id and body.is_active is False:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        user.is_active = body.is_active

    if body.full_name is not None:
        user.full_name = body.full_name

    if body.username is not None and body.username != user.username:
        if db.query(User).filter(User.username == body.username, User.id != user.id).first():
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = body.username

    if body.email is not None and body.email != user.email:
        if db.query(User).filter(User.email == body.email, User.id != user.id).first():
            raise HTTPException(status_code=400, detail="Email already registered")
        user.email = body.email

    if body.password is not None:
        if len(body.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        user.hashed_password = hash_password(body.password)

    db.commit()
    db.refresh(user)
    return _user_row(user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"deleted": user_id}


# ============================================
# Super Admin Endpoints
# ============================================

@router.get("/super/info")
def super_admin_info(super_admin: User = Depends(get_current_super_admin), db: Session = Depends(get_db)):
    """Super admin dashboard: view all admins and super admins."""
    admins = db.query(User).filter(User.is_admin == True).all()
    super_admins = db.query(User).filter(User.is_super_admin == True).all()
    return {
        "current_user": _user_row(super_admin),
        "admins": [_user_row(u) for u in admins],
        "super_admins": [_user_row(u) for u in super_admins],
        "admin_count": len(admins),
        "super_admin_count": len(super_admins),
    }


@router.post("/super/promote")
def promote_to_super_admin(
    user_id: str,
    super_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Promote a user to super admin (super admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_super_admin:
        raise HTTPException(status_code=400, detail="User is already super admin")

    user.is_super_admin = True
    user.is_admin = True
    db.commit()
    db.refresh(user)
    return _user_row(user)


# ============================================
# Promo Code Management (Super Admin)
# ============================================

class GenerateCodeRequest(BaseModel):
    plan: str  # free, pro, premium
    code: str  # custom code, e.g., "CLASS-2024-FALL"
    max_uses: int  # required: max number of uses
    expires_in_days: Optional[int] = None


@router.post("/super/generate-code")
def generate_promo_code(
    body: GenerateCodeRequest,
    super_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Generate a promo code (super admin only)."""
    if body.plan not in ("free", "pro", "premium"):
        raise HTTPException(status_code=400, detail="Invalid plan. Options: free, pro, premium")

    if db.query(PromoCode).filter(PromoCode.code == body.code.upper()).first():
        raise HTTPException(status_code=400, detail="Code already exists")

    expires_at = None
    if body.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=body.expires_in_days)

    code = PromoCode(
        code=body.code.upper(),
        plan=body.plan,
        max_uses=body.max_uses,
        expires_at=expires_at,
        created_by=super_admin.id,
    )
    db.add(code)
    db.commit()
    db.refresh(code)

    return {
        "id": code.id,
        "code": code.code,
        "plan": code.plan,
        "max_uses": code.max_uses,
        "expires_at": code.expires_at.isoformat() if code.expires_at else None,
        "created_at": code.created_at.isoformat(),
    }


@router.get("/super/codes")
def list_promo_codes(super_admin: User = Depends(get_current_super_admin), db: Session = Depends(get_db)):
    """View all promo codes (super admin only)."""
    codes = db.query(PromoCode).order_by(PromoCode.created_at.desc()).all()
    return {
        "codes": [
            {
                "id": c.id,
                "code": c.code,
                "plan": c.plan,
                "is_active": c.is_active,
                "uses": f"{c.uses_count}/{c.max_uses if c.max_uses else 'unlimited'}",
                "expires_at": c.expires_at.isoformat() if c.expires_at else "Never",
                "created_at": c.created_at.isoformat(),
            }
            for c in codes
        ]
    }


@router.post("/super/codes/{code_id}/deactivate")
def deactivate_code(
    code_id: str,
    super_admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Deactivate a promo code (super admin only)."""
    code = db.query(PromoCode).filter(PromoCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")

    code.is_active = False
    db.commit()
    return {"success": True, "message": f"Code {code.code} deactivated"}
