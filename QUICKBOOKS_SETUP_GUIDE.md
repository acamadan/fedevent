# QuickBooks Automated Payment Setup - Complete Guide

## 🎉 CONGRATULATIONS!

Your QuickBooks full automation system has been implemented! Here's how to set it up.

## ✅ What's Been Implemented:

1. **Automated Invoice Creation** - When hotels register, QuickBooks creates invoice automatically
2. **Automatic Email** - Invoice with "Pay Now" button sent to hotel
3. **Webhook Integration** - Payment notifications received automatically
4. **Auto Account Activation** - Accounts activate instantly when paid
5. **Confirmation Emails** - Hotels receive activation confirmation

## 🚀 SETUP STEPS (30 minutes)

### STEP 1: Install Packages (2 minutes)

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent
npm install
```

This installs the QuickBooks packages.

---

### STEP 2: Enable QuickBooks Payments (if not already enabled)

1. Log into QuickBooks Online
2. Click **Settings (⚙️)** → **Account and Settings**
3. Click **Payments** tab
4. If not enabled, click **Connect** to enable QuickBooks Payments
5. ✅ If already enabled, you're good!

---

### STEP 3: Create Product/Service Item (3 minutes)

1. In QuickBooks: **Settings (⚙️)** → **Products and Services**
2. Click **New** → **Service**
3. Fill in:
   - **Name**: FEDEVENT Hotel Setup Fee
   - **Description**: One-time hotel registration setup fee
   - **Sales price/rate**: $49.99
   - **Income account**: Sales or Service Revenue
   - **Taxable**: No
4. Click **Save and Close**
5. **IMPORTANT**: After saving, click to edit the item again
6. Look at the URL - it will be like: `https://app.qbo.intuit.com/app/item?nameId=XXX`
7. **Copy the number XXX** - this is your Item ID

---

### STEP 4: Get API Credentials (10 minutes)

#### 4.1: Create Developer Account

1. Go to https://developer.intuit.com/
2. Click **Sign In** (use your QuickBooks login)
3. Accept developer terms if prompted

#### 4.2: Create App

1. Click **My Apps** → **Create an app** (or **+ Create an app** button)
2. Select **QuickBooks Online and Payments API**
3. Name your app: **FEDEVENT Payment System**
4. Click **Create app**

#### 4.3: Get Keys

1. In your app, click **Keys & credentials** (left sidebar)
2. Under **Production Keys** (or **Development Keys** for testing):
   - Copy **Client ID** (starts with AB...)
   - Copy **Client Secret** (click "Show" to reveal)
3. **SAVE THESE SECURELY!**

#### 4.4: Set Redirect URI

1. Same page, scroll to **Redirect URIs**
2. Click **Add URI**
3. Add: `https://fedevent.com/api/quickbooks/callback`
4. If testing locally, also add: `http://localhost:3000/api/quickbooks/callback`
5. Click **Save**

#### 4.5: Get Company/Realm ID

1. Log into QuickBooks Online
2. Look at the URL in your browser
3. It will be like: `https://app.qbo.intuit.com/app/homepage?realmId=1234567890`
4. **Copy the number after `realmId=`** - this is your Realm ID/Company ID

---

### STEP 5: Add to .env File (2 minutes)

Create or edit your `.env` file in the project root:

```bash
# QuickBooks Online API Credentials
QB_CLIENT_ID=your_client_id_here
QB_CLIENT_SECRET=your_client_secret_here
QB_REALM_ID=your_realm_id_here
QB_ENVIRONMENT=production
QB_REDIRECT_URI=https://fedevent.com/api/quickbooks/callback

# QuickBooks Settings
QB_ITEM_ID=1  # Replace with your Item ID from Step 3

# Admin Email (if not already set)
ADMIN_EMAIL=your-email@fedevent.com
```

**Replace:**
- `your_client_id_here` with your actual Client ID
- `your_client_secret_here` with your actual Client Secret
- `your_realm_id_here` with your actual Realm ID
- `1` in QB_ITEM_ID with the Item ID you copied in Step 3
- `your-email@fedevent.com` with your email

**IMPORTANT**: Make sure `.env` is in your `.gitignore` file (it should be)

---

### STEP 6: Restart Server (1 minute)

```bash
npm start
```

You should see in the console:
```
✅ QuickBooks OAuth client initialized
✅ QuickBooks tokens table ready
```

---

### STEP 7: Connect QuickBooks (ONE-TIME) (5 minutes)

This connects your server to QuickBooks:

1. **Make sure you're logged in as admin** on your fedevent site
2. Go to: `https://fedevent.com/quickbooks/auth`
3. You'll be redirected to QuickBooks
4. Click **Connect**
5. Sign in to QuickBooks if needed
6. Click **Authorize**
7. You'll be redirected back to success page showing:
   - ✅ QuickBooks Connected!
   - Your Realm ID
   - Confirmation message

**That's it!** Your system is now connected.

---

### STEP 8: Set Up Webhook (for Auto-Activation) (10 minutes)

This makes accounts activate automatically when paid.

#### 8.1: In Developer Portal

1. Go to https://developer.intuit.com/
2. Open your **FEDEVENT Payment System** app
3. Click **Webhooks** (left sidebar)
4. Click **Create webhook**

#### 8.2: Configure Webhook

Fill in:
- **Webhook URL**: `https://fedevent.com/api/quickbooks/webhook`
- **Events to Subscribe**:
  - ✅ Payment
  - ✅ Invoice
- Click **Save**

#### 8.3: Test Webhook

QuickBooks will send a test notification. If successful, you'll see "Webhook verified!"

---

### STEP 9: Test the Complete Flow (10 minutes)

#### Test Registration:

1. Go to `/hotel-signup.html`
2. Fill out registration form
3. Submit

#### What Should Happen:

1. ✅ Account created (pending status)
2. ✅ QuickBooks creates customer
3. ✅ QuickBooks creates invoice
4. ✅ Invoice emailed to hotel with "Pay Now" button
5. ✅ Check your QuickBooks - invoice should be there!

#### Test Payment:

1. Hotel receives invoice email
2. Hotel clicks "Review and Pay"
3. Hotel enters payment info
   - Use test card: `4111 1111 1111 1111`
   - Exp: any future date
   - CVC: any 3 digits
4. Hotel clicks "Pay"

#### What Should Happen:

1. ✅ QuickBooks processes payment
2. ✅ Webhook notifies your server
3. ✅ Account auto-activates
4. ✅ Hotel receives activation email
5. ✅ Hotel can access dashboard

---

## 🎯 HOW IT WORKS

### Registration Flow:

```
Hotel Registers
     ↓
Server creates user (pending)
     ↓
Server calls QuickBooks API
     ↓
QuickBooks creates invoice
     ↓
QuickBooks emails invoice to hotel
     ↓
Done! Hotel has payment link
```

### Payment Flow:

```
Hotel clicks "Pay Now" in email
     ↓
Enters card info on QuickBooks page
     ↓
QuickBooks processes payment
     ↓
QuickBooks sends webhook to your server
     ↓
Server receives payment notification
     ↓
Server activates account automatically
     ↓
Server sends activation email
     ↓
Done! Hotel can login
```

---

## 💰 COSTS

### Monthly:
- QuickBooks Online: $30-60 (you already pay this)
- Webhook/API: $0

### Per Transaction:
- Credit card: 2.9% + $0.25 = ~$1.70 per $49.99
- ACH transfer: 1% = ~$0.50 per $49.99

### Example:
- 10 hotels register = 10 × $49.99 = $499.90
- Processing fees = 10 × $1.70 = $17.00
- Your net revenue = $482.90

---

## ✅ CHECKLIST

Before going live, verify:

- [ ] QuickBooks Payments enabled
- [ ] Service item created ($49.99)
- [ ] API credentials added to .env
- [ ] Server restarted
- [ ] OAuth connection completed
- [ ] Webhook configured
- [ ] Test registration successful
- [ ] Test invoice created in QuickBooks
- [ ] Test payment processes
- [ ] Test auto-activation works
- [ ] Test emails sent

---

## 🔧 TROUBLESHOOTING

### "QuickBooks not configured"
**Fix**: Check `.env` file has QB_CLIENT_ID and QB_CLIENT_SECRET

### "No valid QuickBooks token"
**Fix**: Go to `/quickbooks/auth` to connect

### "Invoice creation failed"
**Fix**: 
1. Check QB_ITEM_ID is correct
2. Verify QuickBooks Payments is enabled
3. Check console logs for specific error

### "Webhook not receiving payments"
**Fix**:
1. Verify webhook URL in developer portal
2. Check it's `https://fedevent.com/api/quickbooks/webhook`
3. Make sure webhook is enabled

### "Account not auto-activating"
**Fix**:
1. Check webhook is configured
2. Look at server console logs when payment made
3. Verify payment notification received

---

## 📊 MONITORING

### Check QuickBooks Connection:
```
Go to: /api/quickbooks/status
(requires admin login)
```

Returns:
```json
{
  "connected": true,
  "realmId": "1234567890",
  "tokenExpiresIn": 3000,
  "lastUpdated": "2025-01-09 10:30:00"
}
```

### Check Logs:

Server console will show:
```
✅ QuickBooks OAuth client initialized
📝 Creating QuickBooks customer for Hotel ABC...
✅ QB Customer created: 123
📄 Creating QuickBooks invoice...
✅ QB Invoice created: 456
📧 Sending QuickBooks invoice to hotel@example.com...
✅ QB Invoice emailed to hotel@example.com
```

When payment received:
```
📥 QuickBooks webhook received
💰 Payment received notification: 789
✅ QB Payment details retrieved: 789
📄 Found linked invoice: 456
🎯 Found matching payment record for hotel@example.com
✅ Account auto-activated for hotel@example.com
✅ Activation email sent to hotel@example.com
```

---

## 🎉 SUCCESS!

Once set up, your system will:

✅ **Fully automatic invoice creation**
✅ **Automatic payment collection**
✅ **Instant account activation**
✅ **Zero manual work required**
✅ **Professional QuickBooks invoicing**
✅ **All payments recorded in your books**

---

## 📞 SUPPORT

### QuickBooks Issues:
- Support: 1-800-488-7330
- Developer Help: https://help.developer.intuit.com/

### Integration Issues:
- Check server logs
- Verify all steps completed
- Test with sandbox mode first

---

## 🚀 READY TO GO LIVE!

1. Complete all setup steps above
2. Test with a real payment (or sandbox)
3. Verify everything works
4. Start accepting registrations!

**Your automated payment system is ready!** 🎉

Every new hotel registration will now:
1. Create invoice automatically
2. Email hotel with payment link
3. Accept payment
4. Activate account instantly
5. Send confirmation

**Zero manual work needed!** 🚀

