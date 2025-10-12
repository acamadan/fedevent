# 🚀 FEDEVENT Prelaunch Page - Quick Start Guide

## ✅ What's Been Created

Your FEDEVENT prelaunch landing page is complete and ready to use!

### Files Created/Modified:

1. **`public/prelaunch.html`** - The beautiful Apple-inspired landing page
2. **`server.js`** - Updated with API endpoint and database table
3. **`PRELAUNCH_GUIDE.md`** - Comprehensive documentation
4. **`test-prelaunch.js`** - API testing script

---

## 🎯 Quick Start (3 Steps)

### Step 1: Start the Server

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent
node server.js
```

You should see:
```
🚀 FEDEVENT server running on port 7777
📍 Admin login: http://localhost:7777/admin-login.html
🏨 Hotel portal: http://localhost:7777/hotel-login.html
🌐 Main site: http://localhost:7777
```

### Step 2: Open the Prelaunch Page

Open your browser and go to:
```
http://localhost:7777/prelaunch.html
```

### Step 3: Test the Form

Fill out the form and click "Join the Waitlist"

✅ You should see a success message  
✅ Data will be saved to the database  
✅ Emails will be sent (if SMTP is configured)

---

## 📧 Email Setup (Optional but Recommended)

To receive email notifications when hotels sign up:

### Create `.env` file:

```bash
# In the project root directory
cd /Users/atakancamadan/Documents/GitHub/fedevent

# Create .env file
cat > .env << 'EOF'
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Where to send notifications
NOTIFY_TO=admin@creata.com
NOTIFY_FROM=noreply@fedevent.com

# Server Configuration
PORT=7777
BASE_URL=http://localhost:7777
EOF
```

### For Gmail:
1. Enable 2-factor authentication
2. Go to: https://myaccount.google.com/apppasswords
3. Create an "App Password" for "Mail"
4. Use that password in `SMTP_PASS`

---

## 🧪 Testing the API

### Option 1: Use the Test Script

```bash
node test-prelaunch.js
```

### Option 2: Use cURL

```bash
curl -X POST http://localhost:7070/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "hotelName": "Test Hotel",
    "city": "Boston",
    "state": "MA",
    "contactName": "Jane Doe",
    "title": "Director of Sales",
    "email": "jane@test.com",
    "phone": "555-123-4567",
    "interests": "lodging, conference"
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Thank you for joining the waitlist!",
  "leadId": 1
}
```

---

## 📊 View Submitted Leads

### Option 1: SQLite Command Line

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent

# View all leads
sqlite3 data/creata.db "SELECT * FROM hotel_leads ORDER BY created_at DESC;"

# Count leads
sqlite3 data/creata.db "SELECT COUNT(*) FROM hotel_leads;"

# Export to CSV
sqlite3 data/creata.db -header -csv "SELECT * FROM hotel_leads;" > hotel_leads.csv
```

### Option 2: Create a Quick View Script

```bash
# Create view-leads.js
cat > view-leads.js << 'EOF'
import Database from 'better-sqlite3';
const db = new Database('./data/creata.db');
const leads = db.prepare('SELECT * FROM hotel_leads ORDER BY created_at DESC').all();
console.table(leads);
console.log(`\nTotal leads: ${leads.length}`);
EOF

# Run it
node view-leads.js
```

---

## 🎨 Page Features

✅ **Apple-inspired Design**
- Clean white background
- Smooth animations
- Blue-to-purple gradients
- Professional typography (Inter font)

✅ **Fully Responsive**
- Works on desktop, tablet, and mobile
- Touch-friendly buttons
- Adaptive layouts

✅ **Form Features**
- Real-time validation
- Required field checking
- Email format validation
- Success message with animation
- Smooth scrolling

✅ **Backend Features**
- SQLite database storage
- Email notifications (admin + confirmation)
- Error handling
- Secure input validation

---

## 🌐 Accessing the Page

### Local Development:
```
http://localhost:7070/prelaunch.html
```

### Production (after deployment):
```
https://fedevent.com/prelaunch.html
```

---

## 🚀 Deployment to Production

### Quick Deploy Checklist:

1. **Update Environment Variables**
   ```bash
   NODE_ENV=production
   BASE_URL=https://fedevent.com
   SMTP_HOST=your-smtp-server
   SMTP_USER=your-email
   SMTP_PASS=your-password
   NOTIFY_TO=admin@creata.com
   ```

2. **Test Locally First**
   ```bash
   node server.js
   # Open http://localhost:7070/prelaunch.html
   # Submit a test form
   ```

3. **Push to Your Hosting Platform**
   - For Render.com: `git push origin main`
   - For other platforms: Follow their deployment guide

4. **Verify in Production**
   - Visit `https://your-domain.com/prelaunch.html`
   - Submit a test lead
   - Check email notifications
   - Verify database entry

---

## 🎯 What Happens When Someone Submits the Form?

1. **User fills out form** on `/prelaunch.html`
2. **JavaScript validates** required fields
3. **POST request sent** to `/api/leads`
4. **Server validates** data
5. **Data saved** to `hotel_leads` table
6. **Two emails sent:**
   - Admin notification (to NOTIFY_TO address)
   - Confirmation email (to hotel contact)
7. **Success message** shown to user

---

## 📧 Email Templates

### Admin Notification:
- Subject: "🎯 New FEDEVENT Hotel Waitlist Signup"
- Includes all hotel information
- Professional formatting with FEDEVENT branding
- Lead ID and timestamp

### Confirmation to Hotel:
- Subject: "✅ Welcome to FEDEVENT - You're on the Waitlist!"
- Personalized greeting
- "What Happens Next" section
- Registration details
- Contact information

---

## 🐛 Troubleshooting

### Server won't start?
```bash
# Check if port 7070 is already in use
lsof -ti:7070

# Kill any existing processes
pkill -f "node server.js"

# Start fresh
node server.js
```

### Form submission fails?
1. Open browser console (F12)
2. Check for JavaScript errors
3. Verify all required fields are filled
4. Check network tab for API response

### Emails not sending?
1. Verify SMTP settings in `.env`
2. Test email endpoint:
   ```bash
   curl -X POST http://localhost:7070/api/test-email \
     -H "Content-Type: application/json" \
     -d '{"to":"your-email@gmail.com"}'
   ```
3. Check server logs for email errors

### Database errors?
```bash
# Check if database exists
ls -la data/creata.db

# Verify table exists
sqlite3 data/creata.db ".tables"

# Should show: hotel_leads
```

---

## 📱 Share Your Landing Page

Once deployed, share these URLs:

**Landing Page:**
```
https://fedevent.com/prelaunch.html
```

**Social Media Copy:**
```
🏨 Hotels: Get early access to U.S. Government contract opportunities!

Join the FEDEVENT waitlist and be among the first 1,000 hotels to receive:
✅ Free featured placement
✅ Priority access to RFPs
✅ Guaranteed NET30 payments
✅ No direct billing paperwork

Sign up now: https://fedevent.com/prelaunch.html

#FEDEVENT #GovernmentContracts #HotelManagement
```

---

## 📚 Next Steps

1. **Set up email notifications** (see Email Setup section above)
2. **Test the complete flow** (submit form, check database, verify emails)
3. **Deploy to production** (push to hosting platform)
4. **Share the link** (LinkedIn, email campaigns, etc.)
5. **Monitor leads** (check database regularly)

---

## 📊 Analytics & Marketing

### Add Google Analytics:
```html
<!-- Add before </head> in prelaunch.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### Track Form Submissions:
```javascript
// Add after successful submission
gtag('event', 'lead', {
  'event_category': 'engagement',
  'event_label': 'hotel_waitlist'
});
```

---

## 🎉 You're Ready to Launch!

Your FEDEVENT prelaunch page is complete and ready to collect hotel leads!

### Quick Commands:

```bash
# Start server
node server.js

# Test API
node test-prelaunch.js

# View leads
node view-leads.js

# Export leads
sqlite3 data/creata.db -header -csv "SELECT * FROM hotel_leads;" > leads.csv
```

### URLs:
- **Prelaunch Page:** http://localhost:7070/prelaunch.html
- **Main Site:** http://localhost:7070/
- **Admin Portal:** http://localhost:7070/admin-login.html

---

**Questions?** Check the comprehensive guide: `PRELAUNCH_GUIDE.md`

**Need help?** Contact: info@Fedevent.com

---

*Last Updated: October 10, 2025*  
*CREATA Global Event Agency LLC*

