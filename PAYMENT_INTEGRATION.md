# Payment Integration: Stripe + PayMongo

## Overview

Revelator now supports two payment processors:
1. **Stripe** — Global payment processor (cards, Apple Pay, Google Pay)
2. **PayMongo** — Philippine payment processor (cards, GCash, Maya, online banking)

Users select their preferred payment method on the Account page, and the system handles checkout accordingly.

---

## Setup Instructions

### 1. Stripe Setup (Global)

**Already configured.** If you need to set up Stripe:

```bash
# Get keys from https://dashboard.stripe.com
# Add to .env:
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_PREMIUM=price_...
```

### 2. PayMongo Setup (Philippines)

PayMongo account required: https://www.paymongo.com/

```bash
# Get API keys from https://dashboard.paymongo.com/developers/api_keys
# Add to .env:
PAYMONGO_SECRET_KEY=sk_live_... or sk_test_...
PAYMONGO_PUBLIC_KEY=pk_live_... or pk_test_...
```

**Test Mode:**
- Use `sk_test_` and `pk_test_` keys
- Test card: 4343 4343 4343 4343

**Production:**
- Switch to `sk_live_` and `pk_live_` keys

---

## Implementation Details

### Backend

**File:** `backend/app/routes/payments.py`

**New Endpoints:**
- `POST /api/payments/paymongo-checkout` — Create checkout session
- `POST /api/payments/paymongo-webhook` — Handle payment success
- `GET /api/payments/paymongo-public-key` — Get public key for frontend

**Database Changes:**
- `User.paymongo_customer_id` — Stores PayMongo customer reference
- `User.paymongo_source_id` — Stores PayMongo source/session ID

**Webhook Flow:**
```
1. User clicks "Upgrade" → selects Stripe/PayMongo
2. Backend creates checkout session
3. User redirected to payment page
4. Payment processed
5. PayMongo/Stripe sends webhook to backend
6. Backend updates user.plan in database
7. User redirected back to /account?payment=success
```

### Frontend

**File:** `frontend/src/pages/Account.jsx`

**Changes:**
- Payment method selector (Stripe vs PayMongo tabs)
- Updated `handleUpgrade(planId)` to pass payment method
- Real-time method selection UI

**File:** `frontend/src/api/client.js`

**Changes:**
- `createCheckout(plan, paymentMethod)` — Routes to correct endpoint
- `getPaymongoPublicKey()` — Fetches PayMongo public key

---

## Payment Flow

### For Stripe Users (Global)

```
User clicks "Upgrade" 
  → Selects plan
  → Payment method = "Stripe"
  → Redirected to Stripe Checkout
  → Pays
  → Redirected back to /account?payment=success
  → Plan updated via webhook
```

### For PayMongo Users (Philippines)

```
User clicks "Upgrade"
  → Selects plan
  → Payment method = "PayMongo"
  → Checkout session created
  → Redirected to PayMongo payment page
  → Pays with card/GCash/Maya/banking
  → Redirected back to /account?payment=success
  → Plan updated via webhook
```

---

## Supported Payment Methods

### Stripe
- Credit cards (Visa, Mastercard, Amex, etc.)
- Digital wallets (Apple Pay, Google Pay)
- Bank transfers (in some regions)

### PayMongo
- Credit cards (Visa, Mastercard)
- GCash (most popular in PH)
- Maya (formerly Paymaya)
- Online banking (BDO, BPI, Metrobank, etc.)

---

## Testing

### Local Testing (Test Mode)

**Stripe:**
- Use `sk_test_` keys in .env
- Test card: 4242 4242 4242 4242
- Any future expiry, any CVC

**PayMongo:**
- Use `sk_test_` keys in .env
- Test card: 4343 4343 4343 4343
- Expiry: 12/25, CVC: 123

### Production Deployment

Switch to `sk_live_` and `pk_live_` keys in .env once ready.

---

## Troubleshooting

### PayMongo Payment Not Going Through

**Check:**
1. API keys are correct (test vs live mode)
2. Webhook endpoint is configured in PayMongo dashboard
3. Currency is PHP (for PH payments)
4. Amount is in centavos (multiply by 100)

### Webhook Not Triggering

**Check:**
1. PayMongo dashboard: Webhooks → verify endpoint URL is correct
2. Logs: Check backend error logs for webhook requests
3. Firewall: Ensure your API accepts incoming requests from PayMongo IP ranges

### User Plan Not Updating

**Check:**
1. User exists in database with matching `user_id`
2. Metadata passed correctly in checkout request
3. Webhook signature verified (PayMongo sends webhook header)

---

## Configuration Reference

### Environment Variables

```env
# Stripe (required for Stripe payments)
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_PREMIUM=price_...

# PayMongo (required for PayMongo payments)
PAYMONGO_SECRET_KEY=sk_test_... or sk_live_...
PAYMONGO_PUBLIC_KEY=pk_test_... or pk_live_...
```

### Plan Pricing

Prices defined in `backend/app/config.py`:
- `PRO_PRICE_USD` — Pro tier monthly price
- `PREMIUM_PRICE_USD` — Premium tier monthly price

---

## Future Enhancements

- [ ] Support for other payment methods (Alipay, WeChat Pay, etc.)
- [ ] Recurring billing management for both providers
- [ ] Invoice generation and email receipts
- [ ] Subscription pause/resume
- [ ] Multi-currency support

---

## Support

**Stripe Documentation:** https://stripe.com/docs
**PayMongo Documentation:** https://developers.paymongo.com/docs

For issues, check error logs in backend console and PayMongo dashboard logs.
