# One-Time Setup Fee Implementation Guide

## Overview
This guide explains how to implement a $49.99 one-time setup fee for hotel registration using Stripe.

## Step 1: Setup Stripe Account

1. **Create Stripe Account**: Go to https://stripe.com and create an account
2. **Get API Keys**:
   - Go to Developers → API keys
   - Copy your **Publishable key** (starts with `pk_`)
   - Copy your **Secret key** (starts with `sk_`)
3. **Test Mode**: Start with test keys (they have `_test_` in them)

## Step 2: Add Environment Variables

Add these to your `.env` file:

```bash
# Stripe Payment Processing
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
```

## Step 3: Install Stripe Package

Run this command:
```bash
npm install stripe
```

## Step 4: Implementation Details

### Frontend Flow:
1. User fills out registration form
2. Sees "$49.99 one-time setup fee" message
3. Enters payment information (Stripe Elements)
4. Submits form → payment processes first
5. If payment succeeds → account is created
6. If payment fails → shows error, no account created

### Backend Flow:
1. Create Payment Intent endpoint (`/api/create-payment-intent`)
2. Verify payment in registration endpoint before creating user
3. Store payment information in database for records

### Security:
- Payment processing happens server-side
- Never store credit card numbers
- Stripe handles PCI compliance
- Verify payment before creating account

## Step 5: Database Schema

Add payment tracking table:

```sql
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  stripe_payment_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## Step 6: Testing

Use Stripe test cards:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- Any future expiry date (12/34)
- Any 3-digit CVC (123)
- Any ZIP code (12345)

## Go Live Checklist

Before going live:
1. ✅ Replace test keys with live keys in `.env`
2. ✅ Test complete registration flow
3. ✅ Verify payment receipts in Stripe dashboard
4. ✅ Test error handling (declined cards)
5. ✅ Ensure email confirmations include payment receipt
6. ✅ Document refund policy

## Support

- Stripe Documentation: https://stripe.com/docs
- Stripe Support: https://support.stripe.com

