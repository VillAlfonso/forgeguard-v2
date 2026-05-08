"""
Payment routes for Stripe and PayMongo subscription management.
"""

import base64
import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import User
from ..config import (
    STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID_PRO, STRIPE_PRICE_ID_PREMIUM, FRONTEND_URL,
    PAYMONGO_SECRET_KEY, PAYMONGO_PUBLIC_KEY,
    PRO_PRICE_USD, PREMIUM_PRICE_USD,
)

router = APIRouter(prefix="/api/payments", tags=["payments"])


def get_stripe():
    """Lazy import stripe so the app works even without the package."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured. Add STRIPE_SECRET_KEY to .env")
    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        return stripe
    except ImportError:
        raise HTTPException(status_code=503, detail="stripe package not installed. Run: pip install stripe")


PLAN_PRICE_MAP = {
    "pro": STRIPE_PRICE_ID_PRO,
    "premium": STRIPE_PRICE_ID_PREMIUM,
}


class CheckoutRequest(BaseModel):
    plan: str  # "pro" or "premium"
    payment_method: str = "stripe"  # "stripe" or "paymongo"


def get_paymongo():
    """Lazy import and validate PayMongo configuration."""
    if not PAYMONGO_SECRET_KEY:
        raise HTTPException(status_code=503, detail="PayMongo is not configured. Add PAYMONGO_SECRET_KEY to .env")
    return {
        "secret_key": PAYMONGO_SECRET_KEY,
        "public_key": PAYMONGO_PUBLIC_KEY,
    }


@router.get("/plans")
def get_plans():
    return {
        "plans": [
            {
                "id": "free", "name": "Free", "price": 0,
                "scans_per_month": 10, "unlimited": False, "llm_included": False,
                "features": [
                    "10 scans / month",
                    "Verdict + bounding boxes",
                    "Scan history with images",
                    "Community support",
                ],
            },
            {
                "id": "pro", "name": "Pro", "price": PRO_PRICE_USD,
                "scans_per_month": -1, "unlimited": True, "llm_included": False,
                "features": [
                    "Unlimited scans",
                    "Verdict + bounding boxes",
                    "Scan history with images",
                    "Email support",
                ],
            },
            {
                "id": "premium", "name": "Premium", "price": PREMIUM_PRICE_USD,
                "scans_per_month": -1, "unlimited": True, "llm_included": True,
                "features": [
                    "Unlimited scans",
                    "AI forensic explanation on every scan",
                    "Priority processing",
                    "Priority support",
                ],
            },
        ]
    }


@router.post("/create-checkout")
def create_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stripe = get_stripe()

    price_id = PLAN_PRICE_MAP.get(body.plan)
    if not price_id:
        raise HTTPException(status_code=400, detail="Invalid plan. Choose 'pro' or 'premium'.")

    # Create or reuse Stripe customer
    if not current_user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=current_user.email,
            metadata={"user_id": current_user.id},
        )
        current_user.stripe_customer_id = customer.id
        db.commit()

    # Create checkout session
    session = stripe.checkout.Session.create(
        customer=current_user.stripe_customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{FRONTEND_URL}/account?payment=success&session_id={{CHECKOUT_SESSION_ID}}&provider=stripe",
        cancel_url=f"{FRONTEND_URL}/account?payment=cancelled",
        metadata={"user_id": current_user.id, "plan": body.plan},
    )

    return {"checkout_url": session.url, "session_id": session.id}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    stripe = get_stripe()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        plan = session.get("metadata", {}).get("plan", "basic")
        subscription_id = session.get("subscription")

        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.plan = plan
                user.stripe_subscription_id = subscription_id
                db.commit()

    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        subscription_id = sub.get("id")
        user = db.query(User).filter(User.stripe_subscription_id == subscription_id).first()
        if user:
            user.plan = "free"
            user.stripe_subscription_id = None
            db.commit()

    return {"status": "ok"}


@router.get("/verify-session")
def verify_session(
    session_id: str = None,
    provider: str = "stripe",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify payment on success redirect and update user plan — no webhook needed."""
    if provider == "stripe":
        stripe = get_stripe()
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id required for Stripe verification")
        try:
            session = stripe.checkout.Session.retrieve(session_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not retrieve session: {e}")

        if session.payment_status != "paid":
            raise HTTPException(status_code=400, detail="Payment not completed")

        if session.metadata.get("user_id") != current_user.id:
            raise HTTPException(status_code=403, detail="Session does not belong to this user")

        plan = session.metadata.get("plan", "pro")
        current_user.plan = plan
        if session.subscription:
            current_user.stripe_subscription_id = session.subscription
        db.commit()
        return {"status": "ok", "plan": plan}

    elif provider == "paymongo":
        paymongo = get_paymongo()
        pm_session_id = session_id or current_user.paymongo_source_id
        if not pm_session_id:
            raise HTTPException(status_code=400, detail="No PayMongo session found")

        auth_string = base64.b64encode(f"{paymongo['secret_key']}:".encode()).decode()
        try:
            response = requests.get(
                f"https://api.paymongo.com/v1/checkout_sessions/{pm_session_id}",
                headers={"Authorization": f"Basic {auth_string}"},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"PayMongo API error: {e}")

        attrs = data.get("data", {}).get("attributes", {})
        status = attrs.get("payment_intent", {}).get("attributes", {}).get("status")
        if status != "succeeded":
            raise HTTPException(status_code=400, detail="Payment not completed")

        plan = attrs.get("metadata", {}).get("plan", "pro")
        current_user.plan = plan
        db.commit()
        return {"status": "ok", "plan": plan}

    raise HTTPException(status_code=400, detail="Invalid provider")


@router.post("/cancel")
def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription")

    stripe = get_stripe()
    stripe.Subscription.modify(current_user.stripe_subscription_id, cancel_at_period_end=True)
    return {"message": "Subscription will cancel at end of billing period"}


# ============================================
# PayMongo Payment Routes
# ============================================

@router.post("/paymongo-checkout")
def create_paymongo_checkout(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a PayMongo payment link for subscription."""
    paymongo = get_paymongo()

    amount_cents = int(PRO_PRICE_USD * 100) if body.plan == "pro" else int(PREMIUM_PRICE_USD * 100)

    # Create PayMongo charge with webhook
    auth_string = base64.b64encode(f"{paymongo['secret_key']}:".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_string}",
        "Content-Type": "application/json",
    }

    payload = {
        "data": {
            "type": "checkout_session",
            "attributes": {
                "amount": amount_cents,
                "currency": "PHP",
                "description": f"Revelator {body.plan.upper()} Plan",
                "statement_descriptor": "REVELATOR",
                "line_items": [
                    {
                        "amount": amount_cents,
                        "currency": "PHP",
                        "description": f"Revelator {body.plan.upper()} Plan",
                        "name": f"Revelator {body.plan.upper()} Plan",
                        "quantity": 1,
                    }
                ],
                "payment_method_types": ["card", "gcash"],
                "redirect": {
                    "success": f"{FRONTEND_URL}/account?payment=success&provider=paymongo",
                    "failed": f"{FRONTEND_URL}/account?payment=cancelled",
                },
                "metadata": {
                    "user_id": current_user.id,
                    "plan": body.plan,
                    "email": current_user.email,
                },
            }
        }
    }

    try:
        response = requests.post(
            "https://api.paymongo.com/v1/checkout_sessions",
            json=payload,
            headers=headers,
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        checkout_url = data["data"]["attributes"]["checkout_url"]
        session_id = data["data"]["id"]

        # Store session for webhook reference
        current_user.paymongo_source_id = session_id
        db.commit()

        return {"checkout_url": checkout_url, "session_id": session_id, "provider": "paymongo"}

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"PayMongo API error: {str(e)}")


@router.post("/paymongo-webhook")
async def paymongo_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle PayMongo payment success webhooks."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    event_type = payload.get("data", {}).get("type")

    if event_type == "payment.success":
        payment_data = payload.get("data", {}).get("attributes", {})
        metadata = payment_data.get("metadata", {})

        user_id = metadata.get("user_id")
        plan = metadata.get("plan", "pro")

        if user_id:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.plan = plan
                user.paymongo_customer_id = payment_data.get("source", {}).get("id")
                db.commit()
                return {"status": "ok"}

    return {"status": "ok"}


@router.get("/paymongo-public-key")
def get_paymongo_public_key():
    """Get PayMongo public key for frontend integration."""
    try:
        paymongo = get_paymongo()
        return {"public_key": paymongo["public_key"]}
    except HTTPException:
        return {"public_key": None}
