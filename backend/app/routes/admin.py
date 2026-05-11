"""
Admin CRUD routes — all endpoints require is_admin=True.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..auth import get_current_admin, get_current_super_admin, get_user_from_token, hash_password
from ..config import UPLOAD_DIR
from ..database import get_db
from ..models import User, Scan, AdminAuditLog, Role
from datetime import datetime, timedelta, timezone
import json

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserUpdate(BaseModel):
    role: Optional[str] = None  # user | admin | superadmin
    is_active: Optional[bool] = None
    full_name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


_role_color_cache: dict = {}


def _get_role_color(role_name: str, db: Session) -> str:
    if role_name in _role_color_cache:
        return _role_color_cache[role_name]
    role = db.query(Role).filter(Role.name == role_name).first()
    color = role.color if role else "#6dba85"
    _role_color_cache[role_name] = color
    return color


def _user_row(u: User, db: Session = None) -> dict:
    role_name = u.role or "user"
    color = _get_role_color(role_name, db) if db is not None else "#6dba85"
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "full_name": u.full_name or "",
        "role": role_name,
        "role_color": color,
        "is_active": bool(u.is_active),
        "is_verified": bool(u.is_verified),
        "scans_this_month": u.scans_this_month,
        "created_at": u.created_at.isoformat() if u.created_at else "",
        "updated_at": u.updated_at.isoformat() if u.updated_at else "",
    }


def _log_admin_action(db: Session, admin_id: str, action: str, target_user_id: str = None, details: dict = None):
    """Log an admin action to the audit trail."""
    log = AdminAuditLog(
        admin_id=admin_id,
        action=action,
        target_user_id=target_user_id,
        details=json.dumps(details) if details else None,
    )
    db.add(log)
    db.commit()


@router.get("/stats")
def stats(_: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_scans = db.query(func.count(Scan.id)).scalar() or 0
    admin_count = db.query(func.count(User.id)).filter(User.role == "admin").scalar() or 0
    super_admin_count = db.query(func.count(User.id)).filter(User.role == "superadmin").scalar() or 0
    return {
        "total_users": total_users,
        "total_scans": total_scans,
        "admins": admin_count,
        "super_admins": super_admin_count,
    }


@router.get("/users")
def list_users(
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
    q: Optional[str] = None,
    role: Optional[str] = Query(None, description="Filter by role name"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = db.query(User)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(User.email.ilike(like), User.username.ilike(like), User.full_name.ilike(like)))
    if role:
        query = query.filter(User.role == role)

    total = query.count()
    rows = query.order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    _role_color_cache.clear()  # refresh in case colors were edited
    return {"users": [_user_row(u, db) for u in rows], "total": total}


@router.get("/users/{user_id}")
def get_user(user_id: str, _: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    scan_count = db.query(func.count(Scan.id)).filter(Scan.user_id == user_id).scalar() or 0
    data = _user_row(user, db)
    data["total_scans"] = scan_count
    return data


@router.put("/users/{user_id}")
def update_user(
    user_id: str,
    body: UserUpdate,
    admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Update a user. Super admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes = {}

    if body.role is not None:
        # Verify role exists in the roles table (supports dynamic custom roles)
        role_obj = db.query(Role).filter(Role.name == body.role).first()
        if not role_obj:
            raise HTTPException(status_code=400, detail=f"Role '{body.role}' does not exist")
        if user.id == admin.id and body.role != "superadmin":
            superadmin_count = db.query(User).filter(User.role == "superadmin").count()
            if superadmin_count <= 1 and user.role == "superadmin":
                raise HTTPException(status_code=400, detail="Cannot remove the last super admin")
        if user.role != body.role:
            changes["role"] = {"from": user.role, "to": body.role}
        user.role = body.role

    if body.is_active is not None:
        if user.id == admin.id and body.is_active is False:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        if user.is_active != body.is_active:
            changes["is_active"] = {"from": user.is_active, "to": body.is_active}
        user.is_active = body.is_active

    if body.full_name is not None and body.full_name != user.full_name:
        changes["full_name"] = {"from": user.full_name, "to": body.full_name}
        user.full_name = body.full_name

    if body.username is not None and body.username != user.username:
        if db.query(User).filter(User.username == body.username, User.id != user.id).first():
            raise HTTPException(status_code=400, detail="Username already taken")
        changes["username"] = {"from": user.username, "to": body.username}
        user.username = body.username

    if body.email is not None and body.email != user.email:
        if db.query(User).filter(User.email == body.email, User.id != user.id).first():
            raise HTTPException(status_code=400, detail="Email already registered")
        changes["email"] = {"from": user.email, "to": body.email}
        user.email = body.email

    if body.password is not None:
        if len(body.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        user.hashed_password = hash_password(body.password)
        changes["password"] = "changed"

    db.commit()
    db.refresh(user)

    if changes:
        _log_admin_action(db, admin.id, "update_user", user_id,
                          {"username": user.username, "email": user.email, "changes": changes})

    return _user_row(user, db)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Delete a user. Super admin only."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Cannot delete a super admin. Demote first.")

    snapshot = {"username": user.username, "email": user.email, "role": user.role}
    db.delete(user)
    db.commit()

    _log_admin_action(db, admin.id, "delete_user", None, snapshot)

    return {"deleted": user_id}


# ============================================
# Super Admin Endpoints
# ============================================

@router.get("/super/info")
def super_admin_info(super_admin: User = Depends(get_current_super_admin), db: Session = Depends(get_db)):
    """Super admin dashboard: view all admins and super admins."""
    admins = db.query(User).filter(User.role == "admin").all()
    super_admins = db.query(User).filter(User.role == "superadmin").all()
    return {
        "current_user": _user_row(super_admin, db),
        "admins": [_user_row(u, db) for u in admins],
        "super_admins": [_user_row(u, db) for u in super_admins],
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
    if user.role == "superadmin":
        raise HTTPException(status_code=400, detail="User is already super admin")

    user.role = "superadmin"
    db.commit()
    db.refresh(user)
    return _user_row(user, db)


# ============================================
# Promo Code Management (Super Admin)
# ============================================

# ============================================
# Gemini Vision Status
# ============================================

# Free-tier limits by model (RPD = requests per day, RPM = per minute)
_GEMINI_FREE_LIMITS = {
    "gemini-2.5-flash":      {"rpd": 1500, "rpm": 10},
    "gemini-2.5-pro":        {"rpd":   25, "rpm":  5},
    "gemini-2.0-flash":      {"rpd": 1500, "rpm": 15},
    "gemini-2.0-flash-exp":  {"rpd": 1500, "rpm": 15},
    "gemini-1.5-flash":      {"rpd": 1500, "rpm": 15},
    "gemini-1.5-pro":        {"rpd":   50, "rpm":  2},
}


@router.get("/gemini-status")
def gemini_status(_: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    """Return Gemini Vision API usage stats and free-tier quota info."""
    from ..config import GEMINI_API_KEY, GEMINI_VISION_MODEL

    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today_start + timedelta(days=1)
    hours_until_reset = (tomorrow - now_utc).total_seconds() / 3600

    calls_today = (
        db.query(func.count(Scan.id))
        .filter(Scan.detected_category.isnot(None), Scan.created_at >= today_start)
        .scalar() or 0
    )
    total_calls = (
        db.query(func.count(Scan.id))
        .filter(Scan.detected_category.isnot(None))
        .scalar() or 0
    )

    limits = _GEMINI_FREE_LIMITS.get(GEMINI_VISION_MODEL, {"rpd": 1500, "rpm": 15})

    return {
        "configured": bool(GEMINI_API_KEY),
        "model": GEMINI_VISION_MODEL,
        "calls_today": calls_today,
        "daily_limit": limits["rpd"],
        "calls_remaining_today": max(0, limits["rpd"] - calls_today),
        "rpm_limit": limits["rpm"],
        "total_calls_ever": total_calls,
        "resets_in_hours": round(hours_until_reset, 1),
        "reset_time_utc": tomorrow.isoformat() + "Z",
    }


# ============================================
# Admin Actions (Ban User) — Super Admin Only
# Regular admins are read-only — they cannot ban, delete, or modify users.
# ============================================

@router.post("/users/{user_id}/ban")
def ban_user(
    user_id: str,
    admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Ban a user (deactivate account). Super admin only."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot ban your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Cannot ban a super admin")

    if not user.is_active:
        raise HTTPException(status_code=400, detail="User is already banned")

    user.is_active = False
    db.commit()
    db.refresh(user)

    _log_admin_action(db, admin.id, "ban_user", user_id, {"username": user.username, "email": user.email})

    return {"success": True, "message": f"User {user.username} has been banned"}


@router.post("/users/{user_id}/unban")
def unban_user(
    user_id: str,
    admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Unban a user (reactivate account). Super admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_active:
        raise HTTPException(status_code=400, detail="User is already active")

    user.is_active = True
    db.commit()
    db.refresh(user)

    _log_admin_action(db, admin.id, "unban_user", user_id, {"username": user.username, "email": user.email})

    return {"success": True, "message": f"User {user.username} has been unbanned"}


@router.post("/users/{user_id}/promote-admin")
def promote_to_admin(
    user_id: str,
    admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Promote a regular user to admin. Super admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == "admin":
        raise HTTPException(status_code=400, detail="User is already an admin")
    if user.role == "superadmin":
        raise HTTPException(status_code=400, detail="User is already a super admin")

    prev_role = user.role
    user.role = "admin"
    db.commit()
    db.refresh(user)

    _log_admin_action(db, admin.id, "promote_admin", user_id,
                      {"username": user.username, "email": user.email, "from_role": prev_role})

    return {"success": True, "message": f"{user.username} promoted to admin", "user": _user_row(user, db)}


@router.post("/users/{user_id}/demote-admin")
def demote_admin(
    user_id: str,
    admin: User = Depends(get_current_super_admin),
    db: Session = Depends(get_db),
):
    """Demote an admin back to a regular user. Super admin only."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != "admin":
        raise HTTPException(status_code=400, detail="User is not an admin")

    user.role = "user"
    db.commit()
    db.refresh(user)

    _log_admin_action(db, admin.id, "demote_admin", user_id,
                      {"username": user.username, "email": user.email})

    return {"success": True, "message": f"{user.username} demoted to user", "user": _user_row(user, db)}


# ============================================
# Audit Logs — Admin (read) and Super Admin
# ============================================

@router.get("/super/logs")
def view_audit_logs(
    viewer: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    kind: Optional[str] = Query(None, description="Filter: 'admin', 'scan', or None for all"),
):
    """View audit logs (admin actions + user scans). Admins and super admins."""
    # Admin actions
    admin_logs_query = db.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())
    admin_logs_total = admin_logs_query.count()

    # Scans (treated as user_scan events in the unified log)
    scans_query = db.query(Scan).order_by(Scan.created_at.desc())
    scans_total = scans_query.count()

    combined = []

    if kind in (None, "admin"):
        for log in admin_logs_query.limit(500).all():
            admin_user = db.query(User).filter(User.id == log.admin_id).first()
            target_user = db.query(User).filter(User.id == log.target_user_id).first() if log.target_user_id else None
            combined.append({
                "id": f"admin_{log.id}",
                "kind": "admin",
                "actor": {"username": admin_user.username, "email": admin_user.email, "role": admin_user.role} if admin_user else None,
                "action": log.action,
                "target": {"username": target_user.username, "email": target_user.email} if target_user else None,
                "details": json.loads(log.details) if log.details else None,
                "created_at": log.created_at.isoformat(),
            })

    if kind in (None, "scan"):
        for scan in scans_query.limit(500).all():
            user = db.query(User).filter(User.id == scan.user_id).first()
            combined.append({
                "id": f"scan_{scan.id}",
                "kind": "scan",
                "actor": {"username": user.username, "email": user.email, "role": user.role} if user else None,
                "action": "user_scan",
                "target": None,
                "scan": {
                    "scan_id": scan.scan_id,
                    "filename": scan.filename,
                    "verdict": scan.verdict,
                    "confidence_score": scan.confidence_score,
                    "detected_category": scan.detected_category,
                    "detected_subtype": scan.detected_subtype,
                    "category_confidence": scan.category_confidence,
                    "category_explanation": scan.category_explanation,
                    "category_evidence": json.loads(scan.category_evidence) if scan.category_evidence else [],
                    "reasoning_steps": json.loads(scan.reasoning_steps) if scan.reasoning_steps else [],
                    "alternatives": json.loads(scan.alternatives) if scan.alternatives else [],
                    "anomaly_location": scan.anomaly_location,
                    "certainty_level": scan.certainty_level,
                    "tools_likely_used": scan.tools_likely_used,
                    "document_type": scan.document_type,
                    "image_width": scan.image_width,
                    "image_height": scan.image_height,
                    "has_image": bool(scan.image_path),
                    "llm_explanation": scan.llm_explanation,
                    "user_context": {
                        "suspicion_reason": scan.suspicion_reason,
                        "area_of_concern": scan.area_of_concern,
                        "image_source": scan.image_source,
                        "shot_type": scan.shot_type,
                        "lighting": scan.lighting,
                        "physical_clues": scan.physical_clues,
                        "is_forged_belief": scan.is_forged_belief,
                    },
                },
                "created_at": scan.created_at.isoformat() if scan.created_at else "",
            })

    # Sort merged log by timestamp desc, then paginate
    combined.sort(key=lambda x: x["created_at"], reverse=True)
    paginated = combined[offset:offset + limit]

    return {
        "logs": paginated,
        "total": len(combined),
        "admin_actions_total": admin_logs_total,
        "scans_total": scans_total,
    }


@router.get("/scans/{scan_id}/image")
def admin_scan_image(
    scan_id: str,
    token: str = Query(..., description="Access token (query param so <img src> works)"),
    db: Session = Depends(get_db),
):
    """Fetch any user's scan image. Admin or super admin only."""
    user = get_user_from_token(token, db)
    if user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    scan = db.query(Scan).filter(Scan.scan_id == scan_id).first()
    if not scan or not scan.image_path:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = (UPLOAD_DIR / scan.image_path).resolve()
    if not str(file_path).startswith(str(UPLOAD_DIR.resolve())) or not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(file_path, media_type="image/jpeg")
