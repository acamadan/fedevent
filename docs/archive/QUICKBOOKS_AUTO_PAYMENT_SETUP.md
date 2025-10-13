# QuickBooks Automated Payment via Email - Setup Guide

## Overview
Set up automated invoice creation and email payment links when hotels register.

## What This Does:
1. Hotel registers → System creates QuickBooks invoice automatically
2. QuickBooks emails invoice to hotel with "Pay Now" button
3. Hotel clicks button → Pays $49.99 online
4. QuickBooks notifies your system → Account activates automatically
5. Hotel gets confirmation email

## Step 1: QuickBooks Setup

### 1.1 Enable QuickBooks Payments
1. Log into QuickBooks Online
2. Go to **Settings (⚙️) → Account and Settings**
3. Click **Payments** tab
4. Click **Connect** under "Accept online payments"
5. Follow prompts to enable QuickBooks Payments
   - They'll verify your bank account
   - Set up merchant account (if not already done)

### 1.2 Set Up Payment Options
1. Go to **Settings → Payments**
2. Enable:
   - ✅ Credit/Debit Cards
   - ✅ Bank Transfer (ACH)
3. Customize invoice payment message (optional)

### 1.3 Get Your API Credentials
1. Go to https://developer.intuit.com/
2. Sign in with your QuickBooks account
3. Click **My Apps** → **Create an app**
4. Select **QuickBooks Online and Payments API**
5. Name it: "FEDEVENT Payment System"
6. Get your:
   - Client ID
   - Client Secret
   - Company ID (Realm ID)

## Step 2: Install Required Packages

```bash
npm install intuit-oauth node-quickbooks
```

## Step 3: Environment Variables

Add to your `.env` file:

```bash
# QuickBooks API Credentials
QB_CLIENT_ID=your_client_id_here
QB_CLIENT_SECRET=your_client_secret_here
QB_REALM_ID=your_company_id_here
QB_ENVIRONMENT=sandbox  # Change to 'production' when ready
QB_REDIRECT_URI=https://fedevent.com/api/quickbooks/callback

# QuickBooks Webhook Secret (for payment notifications)
QB_WEBHOOK_TOKEN=your_webhook_verifier_token_here
```

## Step 4: OAuth Setup (One-Time)

You need to authorize the app to access your QuickBooks:

### Create OAuth Route in server.js:

```javascript
import OAuthClient from 'intuit-oauth';

// QuickBooks OAuth setup
const oauthClient = new OAuthClient({
  clientId: process.env.QB_CLIENT_ID,
  clientSecret: process.env.QB_CLIENT_SECRET,
  environment: process.env.QB_ENVIRONMENT || 'sandbox',
  redirectUri: process.env.QB_REDIRECT_URI,
});

// Step 1: Initiate OAuth
app.get('/quickbooks/auth', (req, res) => {
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.Payment],
    state: 'testState',
  });
  res.redirect(authUri);
});

// Step 2: OAuth Callback
app.get('/api/quickbooks/callback', async (req, res) => {
  try {
    const authResponse = await oauthClient.createToken(req.url);
    const token = authResponse.getJson();
    
    // Save these tokens securely (database or file)
    // You'll need them for API calls
    console.log('Access Token:', token.access_token);
    console.log('Refresh Token:', token.refresh_token);
    
    // Store in database or config
    // For now, save to environment or secure file
    
    res.send('QuickBooks connected successfully! You can close this window.');
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send('Failed to connect to QuickBooks');
  }
});
```

### Run OAuth Flow (One-Time):
1. Start your server
2. Go to: `https://fedevent.com/quickbooks/auth`
3. Sign in to QuickBooks and authorize
4. Tokens will be logged to console
5. Save tokens securely

## Step 5: Automated Invoice Creation

Add this to your registration endpoint in server.js:

```javascript
import QuickBooks from 'node-quickbooks';

// After user registration succeeds, create invoice
async function createQuickBooksInvoice(userEmail, userName, amount, accountNumber) {
  try {
    const qbo = new QuickBooks(
      process.env.QB_CLIENT_ID,
      process.env.QB_CLIENT_SECRET,
      oauthClient.token.access_token,
      false, // no token secret for OAuth 2.0
      process.env.QB_REALM_ID,
      process.env.QB_ENVIRONMENT === 'sandbox',
      true, // use minor version
      null, // no oauth version
      '2.0' // oauth 2.0
    );

    // Create customer first
    const customer = {
      DisplayName: userName,
      PrimaryEmailAddr: { Address: userEmail },
      Notes: `FEDEVENT Account: ${accountNumber}`,
    };

    const createdCustomer = await new Promise((resolve, reject) => {
      qbo.createCustomer(customer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Create invoice
    const invoice = {
      CustomerRef: { value: createdCustomer.Id },
      Line: [{
        Amount: amount,
        DetailType: 'SalesItemLineDetail',
        Description: 'FEDEVENT Hotel Registration Setup Fee',
        SalesItemLineDetail: {
          ItemRef: { value: '1' }, // Use your QuickBooks item ID
          UnitPrice: amount,
          Qty: 1,
        },
      }],
      BillEmail: { Address: userEmail },
      EmailStatus: 'NeedToSend',
      TxnDate: new Date().toISOString().split('T')[0],
      DueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days
    };

    const createdInvoice = await new Promise((resolve, reject) => {
      qbo.createInvoice(invoice, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    // Send invoice email via QuickBooks
    await new Promise((resolve, reject) => {
      qbo.sendInvoicePdf(createdInvoice.Id, userEmail, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    console.log(`✅ QuickBooks invoice created: ${createdInvoice.Id}`);
    return createdInvoice.Id;
    
  } catch (error) {
    console.error('QuickBooks invoice creation failed:', error);
    throw error;
  }
}
```

## Step 6: Update Registration Endpoint

Modify your `/api/auth/register` endpoint:

```javascript
// After creating payment record (around line 3910)
const paymentResult = db.prepare(`
  INSERT INTO payments (user_id, amount, status, payment_method)
  VALUES (?, 49.99, 'pending', 'quickbooks')
`).run(userResult.lastInsertRowid);

// NEW: Create QuickBooks invoice and send email
try {
  const qbInvoiceId = await createQuickBooksInvoice(
    email,
    displayName,
    49.99,
    fedeventAccountNumber
  );
  
  // Update payment record with invoice ID
  db.prepare(`
    UPDATE payments 
    SET quickbooks_invoice_id = ? 
    WHERE id = ?
  `).run(qbInvoiceId, paymentResult.lastInsertRowid);
  
  console.log(`✅ QuickBooks invoice sent to ${email}`);
  
} catch (qbError) {
  console.error('QuickBooks invoice failed:', qbError);
  // Continue with manual process - hotel still gets payment instructions
}
```

## Step 7: Webhook for Payment Notifications

QuickBooks will notify you when payment is received:

```javascript
// Webhook endpoint to receive payment notifications
app.post('/api/quickbooks/webhook', express.json(), async (req, res) => {
  try {
    // Verify webhook is from QuickBooks
    const signature = req.headers['intuit-signature'];
    // Verify signature with your webhook token
    
    const events = req.body.eventNotifications;
    
    for (const event of events) {
      if (event.dataChangeEvent.entities) {
        for (const entity of event.dataChangeEvent.entities) {
          if (entity.name === 'Payment') {
            // Payment received!
            const paymentId = entity.id;
            
            // Get payment details from QuickBooks
            // Find corresponding user in database
            // Mark as paid and activate account
            
            const payment = db.prepare(`
              SELECT p.*, u.email, u.first_name 
              FROM payments p
              JOIN users u ON p.user_id = u.id
              WHERE p.quickbooks_invoice_id = ?
              AND p.status = 'pending'
            `).get(/* invoice ID from QB payment */);
            
            if (payment) {
              // Mark as paid
              db.prepare(`
                UPDATE payments
                SET status = 'paid',
                    paid_at = datetime('now'),
                    quickbooks_payment_id = ?
                WHERE id = ?
              `).run(paymentId, payment.id);
              
              // Activate account
              db.prepare(`
                UPDATE users
                SET account_status = 'active',
                    setup_fee_paid = 1
                WHERE id = ?
              `).run(payment.user_id);
              
              // Send activation email
              await sendActivationEmail(payment.email, payment.first_name);
              
              console.log(`✅ Auto-activated account for ${payment.email}`);
            }
          }
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});
```

## Step 8: Configure Webhook in QuickBooks Developer Portal

1. Go to https://developer.intuit.com/
2. Select your app
3. Go to **Webhooks** section
4. Add webhook URL: `https://fedevent.com/api/quickbooks/webhook`
5. Select events to monitor:
   - ✅ Payment
   - ✅ Invoice
6. Save webhook configuration

## Step 9: Testing

### Test in Sandbox Mode:

1. Register a test hotel
2. Check QuickBooks Sandbox for new invoice
3. Use test payment (QuickBooks provides test credit cards)
4. Verify webhook triggers
5. Verify account activates automatically

### Go Live:

1. Change `.env`: `QB_ENVIRONMENT=production`
2. Re-run OAuth flow with production credentials
3. Update webhook URL to production
4. Test with real $0.01 transaction first
5. Then go live with $49.99

## Alternative: Simpler QuickBooks Payments Link

If full API integration is too complex, use **QuickBooks Payment Links**:

### Easier Option:
1. Create a product in QuickBooks: "Hotel Setup Fee - $49.99"
2. Generate shareable payment link
3. Include link in registration email
4. Manual verification when paid

This is less automated but much simpler to set up!

## Email Template with Payment Link

Update your welcome email to include QuickBooks invoice:

```javascript
const welcomeHtml = `
  <div>
    <h2>Complete Your Payment</h2>
    <p>Your invoice has been sent to your email from QuickBooks.</p>
    <p>Didn't receive it? <a href="https://quickbooks.intuit.com/pay/invoice/${qbInvoiceId}">Click here to pay now</a></p>
  </div>
`;
```

## Cost

QuickBooks Payments fees:
- **Credit/Debit Cards**: 2.9% + $0.25 per transaction
- **ACH Bank Transfer**: 1% (max $10)
- **For $49.99**: ~$1.70 per transaction (credit card)

## Support

- QuickBooks API Docs: https://developer.intuit.com/app/developer/qbpayments/docs/get-started
- QuickBooks Support: 1-800-488-7330
- Need help implementing? Let me know!

## Next Steps

1. Enable QuickBooks Payments in your account
2. Get API credentials
3. Run OAuth flow
4. Test in sandbox
5. Go live!

This will fully automate your payment collection! 🚀

