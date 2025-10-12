# QuickBooks Online Payment Integration - Step by Step

## ✅ You Have: QuickBooks Online (paid account)
## 🎯 Goal: Automated payment collection on your website

---

## STEP 1: Enable QuickBooks Payments (5 minutes)

### Check if Already Enabled:
1. Log into QuickBooks Online
2. Click **Settings (⚙️)** → **Account and Settings**
3. Click **Payments** tab
4. Look for "QuickBooks Payments" status

### If Not Enabled:
1. Same place: Click **Connect** or **Get Started**
2. Fill out merchant account application:
   - Business information
   - Bank account (for deposits)
   - Owner information
   - EIN/Tax ID
3. Submit application
4. **Wait for approval** (usually 1-2 business days)

### Payment Processing Fees:
- Credit/Debit Cards: 2.9% + $0.25
- ACH Bank Transfer: 1% (max $10)
- For $49.99: ~$1.70 per transaction

---

## STEP 2: Create Product/Service Item (3 minutes)

This is what invoices will charge for:

1. In QuickBooks: **Settings (⚙️)** → **Products and Services**
2. Click **New** → Select **Service**
3. Fill in:
   - **Name**: FEDEVENT Hotel Setup Fee
   - **SKU**: SETUP-FEE (optional)
   - **Category**: Services
   - **Description**: One-time hotel registration setup fee for FEDEVENT platform access
   - **Sales price/rate**: $49.99
   - **Income account**: Sales or Service Revenue
   - **Is taxable**: No (check your state requirements)
4. Click **Save and Close**

**IMPORTANT**: Write down the Item ID (you'll see it in the URL when editing)

---

## STEP 3: Get API Credentials (10 minutes)

### 3.1: Create Developer Account
1. Go to https://developer.intuit.com/
2. Click **Sign In** (use your QuickBooks login)
3. Accept developer terms

### 3.2: Create App
1. Click **My Apps** → **Create an app**
2. Choose **QuickBooks Online and Payments API**
3. Fill in:
   - **App name**: FEDEVENT Payment System
   - **Description**: Hotel registration payment processing
   - **App type**: Web app
4. Click **Create app**

### 3.3: Get Your Keys
1. In your new app, click **Keys & credentials**
2. You'll see:
   - **Client ID** (like: ABxxxxxxxxxxxxxxxxxxx)
   - **Client Secret** (like: xxxxxxxxxxxxxxxxxxx)
3. **IMPORTANT**: Copy both and save securely

### 3.4: Set Redirect URI
1. Same page, scroll to **Redirect URIs**
2. Add: `https://fedevent.com/api/quickbooks/callback`
3. If testing locally also add: `http://localhost:3000/api/quickbooks/callback`
4. Click **Save**

### 3.5: Get Company ID (Realm ID)
1. Log into QuickBooks Online
2. Look at URL: `https://app.qbo.intuit.com/app/homepage?realmId=XXXXX`
3. The number after `realmId=` is your **Company/Realm ID**
4. Copy this number

---

## STEP 4: Install Required Packages (2 minutes)

Run these commands in your project directory:

```bash
npm install intuit-oauth node-quickbooks
```

---

## STEP 5: Add Credentials to .env (2 minutes)

Add these to your `.env` file:

```bash
# QuickBooks Online API Credentials
QB_CLIENT_ID=your_client_id_here
QB_CLIENT_SECRET=your_client_secret_here
QB_REALM_ID=your_realm_id_here
QB_ENVIRONMENT=production
QB_REDIRECT_URI=https://fedevent.com/api/quickbooks/callback

# QuickBooks Settings
QB_ITEM_ID=1  # The product/service item ID from Step 2
QB_AUTO_SEND_INVOICE=true
```

**Security Note**: Never commit .env file to git!

---

## STEP 6: Implement OAuth Connection (I'll Add This Code)

This connects your website to QuickBooks (one-time setup).

I'll add this to your server.js - You'll just need to run it once.

---

## STEP 7: Test the Integration (5 minutes)

### Test Invoice Creation:
1. Register a test hotel on your site
2. Check QuickBooks: Sales → Invoices
3. New invoice should appear for $49.99
4. Invoice should auto-email to hotel

### Test Payment:
1. Hotel receives invoice email
2. Clicks "Review and Pay"
3. Enters test card: `4111 1111 1111 1111`
4. Pays $49.99
5. Check your admin dashboard - should auto-activate

---

## 🎯 TWO IMPLEMENTATION OPTIONS

### OPTION A: Automated Invoicing (Easier)
**How it works:**
- Hotel registers
- QuickBooks creates invoice
- Invoice emails to hotel with payment link
- Hotel pays
- You verify payment → Mark as paid
- Account activates

**Pros:**
✅ Easier to implement (30 minutes)
✅ Professional invoices
✅ Hotels can pay immediately
✅ Recorded in QuickBooks

**Cons:**
❌ You still manually verify and activate

---

### OPTION B: Full Automation (Best)
**How it works:**
- Hotel registers
- QuickBooks creates invoice
- Invoice emails to hotel
- Hotel pays
- **Webhook notifies system automatically**
- **Account activates instantly**
- Confirmation email auto-sent

**Pros:**
✅ Zero manual work
✅ Instant activation
✅ Best user experience
✅ Fully automated

**Cons:**
❌ Takes longer to set up (2 hours)
❌ More complex

---

## 📋 OPTION A: Automated Invoicing Implementation

I'll add this code to your server.js:

### Code Structure:
1. OAuth setup for QuickBooks connection
2. Function to create QuickBooks invoice
3. Update registration endpoint to create invoice
4. Invoice auto-emails to hotel with payment button

**What You'll Do:**
1. Run one-time OAuth connection (I'll guide you)
2. Test with sample registration
3. Verify invoice created and sent

**Implementation Time**: 30 minutes (mostly waiting for OAuth)

---

## 📋 OPTION B: Full Automation Implementation

Adds to Option A:
1. Webhook endpoint to receive payment notifications
2. Automatic account activation
3. Automatic confirmation email
4. Complete hands-off system

**What You'll Do:**
1. Everything from Option A
2. Register webhook URL in QuickBooks developer portal
3. Test payment notification
4. Verify auto-activation

**Implementation Time**: 2 hours

---

## 💰 COST BREAKDOWN

### What You're Already Paying:
- QuickBooks Online: $30-60/month (you have this)

### New Costs:
- QuickBooks Payments Processing:
  - Credit Card: 2.9% + $0.25 per transaction
  - ACH: 1% per transaction
  - Monthly fee: $0
- For $49.99 payment:
  - Credit card: $1.70
  - ACH: $0.50

### Revenue Calculation:
- You charge: $49.99
- Processing fee: -$1.70
- Your net: $48.29 per hotel

---

## 🚀 READY TO IMPLEMENT?

### Quick Start Checklist:

**You do:**
- [ ] Step 1: Enable QuickBooks Payments (if not enabled)
- [ ] Step 2: Create "Setup Fee" product item
- [ ] Step 3: Get API credentials from developer.intuit.com
- [ ] Step 4: Get your Company/Realm ID
- [ ] Step 5: Give me the credentials

**I do:**
- [ ] Add OAuth setup code
- [ ] Implement automated invoice creation
- [ ] Update registration endpoint
- [ ] Test the complete flow
- [ ] Optional: Add webhook for full automation

---

## 🎯 WHICH OPTION?

### My Recommendation:

**Start with Option A (Automated Invoicing):**
- Quick to set up (30 min)
- Hotels can pay immediately
- You just mark as paid (takes 10 seconds)
- Test your process

**Upgrade to Option B later:**
- When you're processing 10+ hotels/day
- Want zero manual work
- Have tested the system

---

## ❓ COMMON QUESTIONS

**Q: Do I need to pay QuickBooks Payments monthly fee?**
A: No! Just per-transaction fees.

**Q: Can hotels pay with bank transfer (ACH)?**
A: Yes! It's cheaper too (1% vs 2.9%).

**Q: Will this work with my existing QuickBooks account?**
A: Yes! Everything integrates with your current setup.

**Q: Can I test before going live?**
A: Yes! Use sandbox mode to test everything first.

**Q: What if payment fails?**
A: Account stays pending, hotel can retry payment.

---

## 🎬 NEXT STEPS

Tell me:
1. ✅ Have you enabled QuickBooks Payments? (Yes/No)
2. Which option? (A = Invoicing, B = Full Automation)
3. Ready for me to implement? (I'll guide you through API setup)

Then I'll:
1. Walk you through getting API credentials
2. Add all the code to your server.js
3. Test it with you
4. Launch! 🚀

---

## 📞 SUPPORT

- QuickBooks Payments Support: 1-800-488-7330
- Developer Support: https://help.developer.intuit.com/
- Need help? Just ask!

**Ready to start?** 🎉

