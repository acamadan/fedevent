# QuickBooks Payments Setup - $49.99 One-Time Fee

## Overview
Since you already have QuickBooks Self-Employed with payment processing, we'll integrate QuickBooks Payments API to charge the $49.99 setup fee.

## Step 1: Get QuickBooks API Credentials

1. **Go to Intuit Developer Portal**: https://developer.intuit.com/
2. **Create an App**:
   - Sign in with your QuickBooks credentials
   - Go to "My Apps" → "Create an app"
   - Select "QuickBooks Online and Payments"
3. **Get Your Keys**:
   - Client ID
   - Client Secret
   - Save these securely

4. **Set Scopes**: Enable `com.intuit.quickbooks.payment`

## Step 2: Add Environment Variables

Add these to your `.env` file:

```bash
# QuickBooks Payments
QUICKBOOKS_CLIENT_ID=your_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_client_secret_here
QUICKBOOKS_ENVIRONMENT=sandbox  # Change to 'production' when ready
QUICKBOOKS_REDIRECT_URI=https://fedevent.com/quickbooks/callback
```

## Step 3: Install QuickBooks SDK

```bash
npm install intuit-oauth node-quickbooks
```

## Step 4: Payment Flow Options

### Option A: QuickBooks Payment Form (Recommended)
**Pros**: 
- Fully integrated with your QuickBooks account
- Automatic transaction recording
- PCI compliant (QuickBooks handles card data)

**Cons**: 
- Requires OAuth flow (one-time setup per user)
- More complex initial setup

### Option B: QuickBooks Invoice (Simpler)
**Pros**:
- Very simple implementation
- Automatic invoice creation in QuickBooks
- Can send invoice email to customer

**Flow**:
1. User completes registration form
2. System creates $49.99 invoice in QuickBooks
3. Invoice sent to user's email
4. User pays via QuickBooks payment link
5. Webhook notifies your system when paid
6. Account activated automatically

### Option C: Manual Entry (Simplest - Recommended for Start)
**Pros**:
- No API integration needed initially
- You manually charge via QuickBooks dashboard
- Fastest to implement

**Flow**:
1. User completes registration (account created as "pending")
2. Email sent to you with registration details
3. You manually charge $49.99 via QuickBooks
4. You mark account as "active" in dashboard
5. User receives activation email

## Recommended Implementation: Option C → Option B → Option A

Start with **Option C** (manual) to get launched quickly, then upgrade to **Option B** (automated invoices) for efficiency.

## Step 5: Database Schema

Add payment tracking:

```sql
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  amount DECIMAL(10,2) NOT NULL DEFAULT 49.99,
  status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT 'quickbooks',
  quickbooks_invoice_id TEXT,
  quickbooks_payment_id TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Add account status to users
ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'pending';
ALTER TABLE users ADD COLUMN setup_fee_paid BOOLEAN DEFAULT 0;
```

## Step 6: Quick Start - Manual Processing

### Frontend Message:
```
"A $49.99 one-time setup fee is required. After registration, 
you'll receive payment instructions via email. Your account 
will be activated within 24 hours of payment receipt."
```

### Backend:
1. Create user account with `account_status = 'pending'`
2. Create payment record with `status = 'pending'`
3. Send email to hotel with payment instructions
4. Send email to YOU with hotel details + QuickBooks charge reminder
5. You charge via QuickBooks dashboard
6. You mark as paid in admin panel → triggers activation email

## Step 7: Email Templates

### To Hotel (After Registration):
```
Subject: Complete Your FEDEVENT Registration - $49.99 Setup Fee

Thank you for registering! To activate your account:

1. Setup Fee: $49.99 (one-time)
2. Payment Options:
   - Call us: (305) 850-7848 with card details
   - Email: billing@fedevent.com for invoice
   
Your account will be activated within 24 hours of payment.

Account Details:
- Email: {email}
- Hotel: {hotelName}
- Account #: {accountNumber}
```

### To You (Admin Notification):
```
Subject: New Hotel Registration - Pending Payment

Hotel: {hotelName}
Contact: {contactName}
Email: {email}
Phone: {phone}

ACTION REQUIRED:
1. Contact hotel to collect $49.99 setup fee
2. Process payment via QuickBooks
3. Mark as paid in admin dashboard

[Link to Admin Panel]
```

## Step 8: Admin Dashboard Update

Add simple interface to mark accounts as paid:

```
Pending Registrations:
- Hotel ABC | Contact: John Doe | Email: john@hotel.com | Phone: 555-1234
  [Mark as Paid] [Contact] [Delete]
```

## Testing

**Test Mode**: 
- Use sandbox credentials
- Create test account
- Verify emails are sent
- Test manual payment flow

**Production**:
- Switch to production credentials
- Update email templates with real contact info
- Train staff on payment collection process

## Cost Comparison

| Method | Setup Time | Monthly Cost | Per Transaction |
|--------|-----------|--------------|-----------------|
| Manual | 1 hour | $0 | Your existing QB rate |
| Invoice API | 4 hours | $0 | Your existing QB rate |
| Full Integration | 8-16 hours | $0 | Your existing QB rate |

## Recommendation

**Phase 1 (This Week)**: Implement manual processing
- Add setup fee message to signup page
- Create pending account status
- Send payment instruction emails
- Process payments manually via QB dashboard

**Phase 2 (Next Month)**: Add automated invoicing
- Integrate QuickBooks API
- Auto-create invoices
- Webhook for payment confirmation
- Auto-activate accounts

**Phase 3 (Later)**: Full automation
- Direct card entry on signup page
- Instant account activation
- Seamless user experience

## Need Help?

- QuickBooks API Docs: https://developer.intuit.com/app/developer/qbpayments/docs/get-started
- QB Support: 1-800-488-7330
- Integration questions: Email me at your contact

