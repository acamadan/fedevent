# 🚀 FEDEVENT Prelaunch Landing Page - Complete Guide

## 📋 Overview

This guide covers the complete FEDEVENT prelaunch landing page implementation, designed to collect hotel leads before the official platform launch in December 2025.

---

## 🎨 Page Features

### **Live URL**
- **Prelaunch Page:** `http://localhost:7070/prelaunch.html`
- **Main Site:** `http://localhost:7070/`

### **Design Elements**
- ✅ Apple-inspired design with smooth animations
- ✅ TailwindCSS for responsive styling
- ✅ Alpine.js for form interactivity
- ✅ Gradient color scheme (Blue #0071e3 → Purple #8e44ad)
- ✅ Mobile-responsive layout

### **Page Sections**

1. **Hero Section**
   - Main headline: "Connect Your Hotel to U.S. Government Contract Opportunities"
   - Trust badge with CREATA credentials (UEI & CAGE codes)
   - Primary CTA button with animated glow effect
   - FEDEVENT logo with gradient styling

2. **About Section**
   - Platform description
   - 3 key highlights:
     - 🏛️ Government Contracts Simplified
     - 💸 Guaranteed Payments (NET30)
     - 🏨 More Bookings

3. **Benefits Section**
   - 4 benefit cards with icons:
     - Direct Access to Government Buyers
     - No Direct Billing Paperwork
     - Priority Listing
     - Free Early Access
   - Special offer banner: "First 1,000 hotels get free featured placement"

4. **Lead Capture Form**
   - Fields:
     - Hotel Name (required)
     - City (required)
     - State (required, dropdown)
     - Contact Name (required)
     - Title/Department (required)
     - Email Address (required)
     - Phone Number (optional)
     - Interest checkboxes (lodging, conference, BPA)
   - Real-time validation
   - Success message with animation
   - Smooth scroll to confirmation

5. **Visual Section**
   - Gradient background with pattern overlay
   - U.S. flag emoji and "Nationwide Network" messaging

6. **Launch Countdown**
   - "Official Launch: December 2025"
   - Rocket emoji and call to action

7. **Footer**
   - Company information
   - Contact email: info@Fedevent.com
   - Social media links (LinkedIn, Instagram)
   - Legal notice

---

## 🔧 Technical Implementation

### **Backend (server.js)**

#### Database Table: `hotel_leads`
```sql
CREATE TABLE IF NOT EXISTS hotel_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hotel_name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  title TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  interests TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notified INTEGER DEFAULT 0
)
```

#### API Endpoint: `/api/leads`

**Method:** POST  
**Content-Type:** application/json

**Request Body:**
```json
{
  "hotelName": "Grand Plaza Hotel",
  "city": "Washington",
  "state": "DC",
  "contactName": "John Smith",
  "title": "General Manager",
  "email": "john.smith@hotel.com",
  "phone": "555-123-4567",
  "interests": "lodging, conference, bpa"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Thank you for joining the waitlist!",
  "leadId": 1
}
```

**Response (Error):**
```json
{
  "error": true,
  "message": "Required fields missing"
}
```

**Validation:**
- All fields except `phone` are required
- Email must be valid format
- At least one interest must be selected

---

## 📧 Email Notifications

### **1. Admin Notification Email**

When a hotel submits the form, you receive a notification at the email configured in `NOTIFY_TO` environment variable.

**Subject:** "🎯 New FEDEVENT Hotel Waitlist Signup"

**Includes:**
- Hotel name and location
- Contact information
- Interest areas
- Lead ID and timestamp
- Professional email template with branding

### **2. Confirmation Email to Hotel**

Automatically sent to the hotel contact after submission.

**Subject:** "✅ Welcome to FEDEVENT - You're on the Waitlist!"

**Includes:**
- Personalized greeting
- Registration confirmation
- "What Happens Next" section
- Registration details summary
- Contact information
- Follow us section with social links

---

## ⚙️ Environment Configuration

### **Required Environment Variables**

Add these to your `.env` file:

```bash
# SMTP Configuration (for email notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Notification recipient (where admin notifications are sent)
NOTIFY_TO=admin@creata.com
NOTIFY_FROM=noreply@fedevent.com

# Server port (optional, defaults to 7070)
PORT=7070

# Base URL (for email links)
BASE_URL=https://fedevent.com
```

### **SMTP Setup Options**

**For Gmail:**
1. Enable 2-factor authentication
2. Generate an "App Password" in Google Account settings
3. Use the app password in `SMTP_PASS`

**For GoDaddy:**
```bash
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-password
```

**For SendGrid:**
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

---

## 🧪 Testing

### **1. Manual Testing**

Open your browser and navigate to:
```
http://localhost:7070/prelaunch.html
```

Fill out the form and submit. You should:
- See a success message
- Receive an admin notification email (if SMTP configured)
- Hotel contact receives confirmation email

### **2. API Testing with cURL**

```bash
curl -X POST http://localhost:7070/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "hotelName": "Test Hotel",
    "city": "Boston",
    "state": "MA",
    "contactName": "Jane Doe",
    "title": "Director of Sales",
    "email": "jane@testhotel.com",
    "phone": "555-987-6543",
    "interests": "lodging, conference"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Thank you for joining the waitlist!",
  "leadId": 1
}
```

### **3. Database Verification**

Check if the lead was saved:

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent
sqlite3 data/creata.db "SELECT * FROM hotel_leads ORDER BY id DESC LIMIT 1;"
```

Or use the included `check_db.js` script:

```javascript
// check_leads.js
import Database from 'better-sqlite3';
const db = new Database('./data/creata.db');
const leads = db.prepare('SELECT * FROM hotel_leads ORDER BY created_at DESC LIMIT 10').all();
console.table(leads);
```

Run it:
```bash
node check_leads.js
```

---

## 📊 Viewing Leads

### **Option 1: SQLite Command Line**

```bash
# View all leads
sqlite3 data/creata.db "SELECT id, hotel_name, city, state, contact_name, email, created_at FROM hotel_leads ORDER BY created_at DESC;"

# Count total leads
sqlite3 data/creata.db "SELECT COUNT(*) as total FROM hotel_leads;"

# View leads by state
sqlite3 data/creata.db "SELECT state, COUNT(*) as count FROM hotel_leads GROUP BY state ORDER BY count DESC;"

# Export to CSV
sqlite3 data/creata.db -header -csv "SELECT * FROM hotel_leads;" > hotel_leads.csv
```

### **Option 2: Create Admin Dashboard**

You can add a simple admin endpoint to view leads:

```javascript
// Add to server.js
app.get('/api/admin/leads', requireAdmin, (req, res) => {
  try {
    const leads = db.prepare(`
      SELECT * FROM hotel_leads 
      ORDER BY created_at DESC
    `).all();
    return ok(res, { leads });
  } catch (error) {
    return fail(res, 500, 'Failed to fetch leads');
  }
});
```

Then create `admin-leads.html` to display the data.

---

## 🚀 Deployment

### **1. Local Development**

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent
npm install
node server.js
```

Navigate to: `http://localhost:7070/prelaunch.html`

### **2. Production Deployment**

**Update environment variables:**
```bash
NODE_ENV=production
BASE_URL=https://fedevent.com
```

**For Render.com:**
1. Push to GitHub
2. Connect repository in Render dashboard
3. Set environment variables in Render settings
4. Deploy

**For other platforms:**
- Ensure Node.js 18+ is available
- Install dependencies: `npm install`
- Set environment variables
- Start server: `node server.js`
- Set up reverse proxy (nginx) if needed

---

## 📱 Marketing Integration

### **Google Analytics**

Add to `prelaunch.html` before `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### **Facebook Pixel**

```html
<!-- Facebook Pixel -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'YOUR_PIXEL_ID');
  fbq('track', 'PageView');
</script>
```

Track form submissions:
```javascript
// Add to form submission success handler
fbq('track', 'Lead');
```

### **LinkedIn Insight Tag**

```html
<script type="text/javascript">
_linkedin_partner_id = "YOUR_PARTNER_ID";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
```

---

## 🎯 Lead Follow-Up Strategy

### **Immediate (Day 0)**
- ✅ Automated confirmation email sent
- ✅ Lead stored in database
- ✅ Admin notification sent

### **Week 1**
- Send "Getting Ready for Launch" email
- Share platform preview screenshots
- Highlight key features

### **Month 1**
- Monthly newsletter with updates
- Share success stories from other hotels
- Announce partnership opportunities

### **Pre-Launch (November 2025)**
- Send early access invitations
- Provide onboarding materials
- Schedule training webinars

### **Launch (December 2025)**
- Grant full platform access
- Activate featured placements
- Send first RFP opportunities

---

## 🔐 Security Considerations

1. **Input Validation**
   - ✅ Email format validation
   - ✅ Required field checks
   - ✅ SQL injection prevention (prepared statements)

2. **Rate Limiting** (Optional Enhancement)
   ```javascript
   // Add to server.js
   import rateLimit from 'express-rate-limit';
   
   const leadLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 5, // 5 submissions per IP
     message: 'Too many submissions, please try again later.'
   });
   
   app.post('/api/leads', leadLimiter, async (req, res) => {
     // ... existing code
   });
   ```

3. **Email Spam Prevention**
   - Consider adding reCAPTCHA for production
   - Monitor submission patterns

---

## 📈 Analytics & Metrics

Track these key metrics:

### **Page Performance**
- Page views
- Bounce rate
- Time on page
- Scroll depth

### **Form Metrics**
- Form starts
- Form submissions
- Submission rate
- Field drop-off points

### **Lead Quality**
- Leads by state
- Leads by interest category
- Email open rates (for follow-ups)
- Lead-to-customer conversion

---

## 🐛 Troubleshooting

### **Form doesn't submit**
- Check browser console for JavaScript errors
- Verify server is running: `lsof -ti:7070`
- Check network tab in browser dev tools
- Ensure all required fields are filled

### **Emails not sending**
- Verify SMTP configuration in `.env`
- Check `NOTIFY_TO` and `SMTP_HOST` are set
- Test email with: `http://localhost:7070/api/test-email`
- Check server logs for email errors

### **Database errors**
- Ensure `data/` directory exists
- Check file permissions
- Verify SQLite database is accessible
- Run: `sqlite3 data/creata.db ".tables"` to verify tables

### **Styling issues**
- Ensure TailwindCSS CDN is loading
- Check browser compatibility (modern browsers only)
- Clear browser cache
- Test in incognito mode

---

## 🎨 Customization

### **Colors**

Update the gradient colors in `prelaunch.html`:

```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        'brand-blue': '#0071e3',    // Change this
        'brand-purple': '#8e44ad',  // Change this
      }
    }
  }
}
```

### **Launch Date**

Update in the countdown section:

```html
<p class="text-6xl font-black gradient-text mb-4">December 2025</p>
```

### **Contact Email**

Update footer and email templates:

```html
<a href="mailto:info@Fedevent.com">info@Fedevent.com</a>
```

### **Company Information**

Update the trust badge and footer with your credentials:

```html
UEI: CNN2T3673V51 | CAGE: 8D4P1
```

---

## 📞 Support

For questions or issues:
- **Email:** info@Fedevent.com
- **Documentation:** This file
- **Server Logs:** Check `server.log` or console output

---

## ✅ Launch Checklist

Before going live:

- [ ] Update environment variables in production
- [ ] Configure SMTP settings
- [ ] Test form submission
- [ ] Verify emails are sent and received
- [ ] Add Google Analytics tracking
- [ ] Set up Facebook Pixel (if using ads)
- [ ] Test on mobile devices
- [ ] Check page load speed
- [ ] Verify all links work
- [ ] Update social media links in footer
- [ ] Set up SSL certificate (HTTPS)
- [ ] Create 404 error page
- [ ] Set up monitoring/alerts
- [ ] Test email deliverability
- [ ] Create backup plan for database
- [ ] Document admin access credentials

---

## 🎉 Success!

Your FEDEVENT prelaunch landing page is ready to collect leads! The page features:

✅ Beautiful Apple-inspired design  
✅ Responsive mobile layout  
✅ Working form submission  
✅ Database storage  
✅ Email notifications  
✅ Confirmation emails  
✅ Professional branding  
✅ Clear call-to-actions  
✅ Trust elements  
✅ Easy to customize  

Start driving traffic to `http://your-domain.com/prelaunch.html` and watch the leads roll in!

---

**Last Updated:** October 10, 2025  
**Version:** 1.0  
**Author:** CREATA Global Event Agency LLC

