# Website Card Payment Processing Setup Guide

## Current Situation
You have: **QuickBooks Self-Employed**
You want: **Card payments on your website (fedevent.com)**

## The Problem
QuickBooks Self-Employed does NOT support API integration for website payments.

---

## ✅ SOLUTION OPTIONS

### OPTION 1: Upgrade to QuickBooks Online + QuickBooks Payments (RECOMMENDED)

**What You Need:**
- Upgrade from Self-Employed to QuickBooks Online Simple Start ($30/month)
- Enable QuickBooks Payments (free to enable, pay per transaction)

**Why This Is Best:**
✅ Keep using QuickBooks ecosystem
✅ All payments automatically recorded
✅ Can integrate with your website
✅ Professional invoicing
✅ Better for growing business

**Cost:**
- QuickBooks Online: $30/month
- Payment processing: 2.9% + $0.25 per transaction
- For $49.99: ~$1.70 per payment

**Setup Time:** 30-60 minutes

---

### OPTION 2: Use Stripe (POPULAR ALTERNATIVE)

**What You Need:**
- Stripe account (free to create)
- Stripe API integration on website

**Why Choose This:**
✅ Easy to set up on website
✅ Lower fees than QuickBooks
✅ Industry standard for online payments
✅ Great documentation
✅ Can still use QuickBooks Self-Employed for bookkeeping

**Cost:**
- No monthly fee
- Payment processing: 2.9% + $0.30 per transaction
- For $49.99: ~$1.75 per payment

**Setup Time:** 1-2 hours (I can help you implement)

---

### OPTION 3: Keep Self-Employed + Use Payment Links (EASIEST)

**What You Need:**
- Your existing QuickBooks Self-Employed account
- Create payment requests manually

**Why Choose This:**
✅ No upgrade needed
✅ No monthly fees
✅ Use what you have
✅ Works right now

**How It Works:**
1. Hotel registers on website
2. You get notification email
3. You send payment request via QuickBooks app
4. Hotel pays via link
5. You mark as paid in admin dashboard

**Cost:**
- Current QuickBooks plan
- Payment processing fees only

**Setup Time:** 5 minutes

---

## 🚀 RECOMMENDED APPROACH

### For Your Situation (Starting Out):

I recommend a **HYBRID approach**:

**NOW (Week 1):**
- Use Option 3 (Payment Links from Self-Employed)
- Hotels register → You send payment request
- Takes you 2 minutes per registration

**SOON (Month 2-3):**
- Integrate Stripe on website (Option 2)
- Hotels pay instantly on signup
- Automatic account activation

**LATER (Month 6+):**
- Consider upgrading to QuickBooks Online (Option 1)
- When you need better accounting features

---

## 📋 DETAILED SETUP GUIDES

### OPTION 1: QuickBooks Online Integration

#### Step 1: Upgrade Your Account
1. Log into QuickBooks Self-Employed
2. Go to Settings → Billing
3. Click "Upgrade to QuickBooks Online"
4. Choose "Simple Start" plan ($30/month)
5. Complete upgrade process

#### Step 2: Enable QuickBooks Payments
1. In QuickBooks Online: Settings → Account and Settings
2. Go to Payments tab
3. Click "Connect" under QuickBooks Payments
4. Fill out application:
   - Business info
   - Bank account (for deposits)
   - Owner information
5. Wait for approval (usually 1-2 business days)

#### Step 3: Get API Credentials
1. Go to https://developer.intuit.com/
2. Sign in with QuickBooks account
3. Create new app:
   - Name: "FEDEVENT Payments"
   - Select: QuickBooks Online + Payments API
4. Get credentials:
   - Client ID
   - Client Secret
   - Company ID (Realm ID)

#### Step 4: Install Dependencies
```bash
npm install intuit-oauth node-quickbooks
```

#### Step 5: Add to .env
```bash
QB_CLIENT_ID=your_client_id
QB_CLIENT_SECRET=your_client_secret
QB_REALM_ID=your_realm_id
QB_ENVIRONMENT=production
```

#### Step 6: Implement on Website
I'll provide the complete code when you're ready!

**Total Setup Time:** 30-60 minutes
**Monthly Cost:** $30 + transaction fees

---

### OPTION 2: Stripe Integration (RECOMMENDED FOR NOW)

#### Step 1: Create Stripe Account
1. Go to https://stripe.com
2. Click "Start now" (free)
3. Sign up with email
4. Verify email address
5. Complete business profile:
   - Business name: CREATA Global Event Agency LLC
   - Business type: Limited Liability Company
   - Industry: Event Planning
   - Website: fedevent.com

#### Step 2: Activate Payments
1. In Stripe dashboard: Settings → Account
2. Complete business verification:
   - EIN/Tax ID
   - Bank account for deposits
   - Personal identification
3. Wait for approval (usually instant, sometimes 1-2 days)

#### Step 3: Get API Keys
1. In Stripe: Developers → API keys
2. Copy:
   - **Publishable key** (starts with `pk_live_`)
   - **Secret key** (starts with `sk_live_`)
3. **Important:** Use test keys first (`pk_test_` and `sk_test_`)

#### Step 4: Add Stripe to Your Site

**Install Stripe:**
```bash
npm install stripe
```

**Add to .env:**
```bash
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
```

#### Step 5: Update server.js

I'll add this code for you:

```javascript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create payment intent endpoint
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 4999, // $49.99 in cents
      currency: 'usd',
      description: 'FEDEVENT Hotel Registration Setup Fee',
      metadata: {
        email: req.body.email,
        hotelName: req.body.hotelName,
      },
    });
    
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook for payment confirmation
app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      
      // Find and activate user account
      const payment = db.prepare(`
        SELECT * FROM payments 
        WHERE stripe_payment_intent_id = ?
      `).get(paymentIntent.id);
      
      if (payment) {
        // Mark as paid and activate account
        db.prepare(`UPDATE payments SET status = 'paid', paid_at = datetime('now') WHERE id = ?`).run(payment.id);
        db.prepare(`UPDATE users SET account_status = 'active', setup_fee_paid = 1 WHERE id = ?`).run(payment.user_id);
        
        // Send activation email
        console.log(`✅ Account auto-activated via Stripe`);
      }
    }
    
    res.json({received: true});
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
```

#### Step 6: Update Frontend (hotel-signup.html)

Add Stripe payment form (I'll do this for you when ready):

```html
<script src="https://js.stripe.com/v3/"></script>
<script>
  const stripe = Stripe('your_publishable_key');
  // Payment form code here
</script>
```

**Total Setup Time:** 1-2 hours (I'll help!)
**Monthly Cost:** $0 + transaction fees
**Best for:** Growing businesses, professional setup

---

### OPTION 3: QuickBooks Self-Employed Payment Requests

#### Step 1: Enable Payment Requests
1. Open QuickBooks Self-Employed app (mobile)
2. Go to Menu → Get Paid
3. Enable "Request Payment"
4. Connect a bank account if not already done

#### Step 2: Create Template
1. In app: Create new payment request
2. Amount: $49.99
3. Description: "FEDEVENT Hotel Registration Setup Fee"
4. Save as template

#### Step 3: Your Workflow
When hotel registers:
1. You receive admin notification email
2. Open QuickBooks app
3. Send payment request to hotel email
4. They click link and pay
5. You get notification
6. Go to admin-payments.html and mark as paid

**Pros:**
✅ Use existing account
✅ No upgrade needed
✅ Works immediately

**Cons:**
❌ Manual work (2 min per registration)
❌ Not automated
❌ Hotels wait for payment link

**Total Setup Time:** 5 minutes
**Monthly Cost:** Current plan only

---

## 💰 COST COMPARISON

| Option | Setup | Monthly Fee | Per Transaction | $49.99 Cost |
|--------|-------|-------------|-----------------|-------------|
| QB Online | 1 hour | $30 | 2.9% + $0.25 | $1.70 |
| Stripe | 2 hours | $0 | 2.9% + $0.30 | $1.75 |
| QB Self-Employed | 5 min | $0 (current) | 2.9% + $0.25 | $1.70 |

---

## 🎯 MY RECOMMENDATION FOR YOU

### Phase 1 (THIS WEEK): Option 3
Use QuickBooks Self-Employed payment requests:
- No setup needed
- Works immediately
- Manual but manageable
- Test your process

### Phase 2 (NEXT MONTH): Add Stripe
Integrate Stripe on website:
- Automated payment collection
- Professional checkout
- Instant account activation
- I'll help you implement

### Phase 3 (LATER): Evaluate QuickBooks Online
When you're processing 50+ hotels/month:
- Better accounting features
- Unified system
- Worth the $30/month

---

## 🚀 WANT TO START NOW?

### Choose Your Path:

**A) Quick Start (Today):**
Use QuickBooks Self-Employed payment requests
→ I'll update your email templates with instructions
→ 5 minutes to set up

**B) Professional Setup (This Week):**
Integrate Stripe on website
→ I'll implement the complete payment system
→ 2 hours (I do most of the work)

**C) Full QuickBooks (When Ready):**
Upgrade to QB Online
→ I'll guide you through the process
→ 1 hour setup

---

## ❓ WHICH SHOULD YOU CHOOSE?

### Choose Option 3 (Self-Employed Links) If:
- ✅ You're launching THIS WEEK
- ✅ Processing < 5 registrations per day
- ✅ Don't mind 2 min manual work per registration
- ✅ Want to test the business model first

### Choose Option 2 (Stripe) If:
- ✅ You want professional payment processing
- ✅ Want automated account activation
- ✅ Processing 5+ registrations per day
- ✅ Want the best user experience
- ✅ Lower monthly costs

### Choose Option 1 (QuickBooks Online) If:
- ✅ You already use QuickBooks for everything
- ✅ Want unified accounting
- ✅ Need professional invoicing
- ✅ Processing 10+ registrations per day

---

## 🎬 NEXT STEPS

**Tell me which option you want, and I'll:**

1. **Option 3**: Update your email templates to explain payment request process (5 min)

2. **Option 2**: Implement complete Stripe integration on your website (1-2 hours)
   - Add payment form to signup
   - Automatic charge processing
   - Auto account activation
   - Full implementation

3. **Option 1**: Guide you through QuickBooks Online upgrade and API setup

**Which sounds best for you?** 

My recommendation: Start with **Option 3 this week** to launch, then add **Option 2 (Stripe) next month** for automation. Best of both worlds! 🚀

