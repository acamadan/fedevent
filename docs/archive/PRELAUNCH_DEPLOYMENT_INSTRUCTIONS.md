# 🚀 FEDEVENT Prelaunch Site - Complete Deployment Instructions

## Step-by-Step Guide for GitHub & Render Deployment

---

## 📋 Prerequisites

Before you begin, make sure you have:

- [ ] GitHub account created
- [ ] Git installed on your computer
- [ ] Render.com account (sign up at https://render.com)
- [ ] GoDaddy email credentials for SMTP
- [ ] All code files ready in your project folder

---

## PART 1: DEPLOY TO GITHUB

### Step 1: Check Your Git Status

Open Terminal and navigate to your project:

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent
```

Check what files have changed:

```bash
git status
```

### Step 2: Stage Your Changes

Add all the changes to be committed:

```bash
git add .
```

This adds:
- `prelaunch-server.js` (your prelaunch backend)
- `public/prelaunch.html` (your prelaunch page)
- `render.yaml` (Render configuration)
- Any other modified files

### Step 3: Commit Your Changes

Create a commit with a descriptive message:

```bash
git commit -m "Add FEDEVENT prelaunch site with hotel waitlist"
```

### Step 4: Push to GitHub

Push your changes to GitHub:

```bash
git push origin main
```

If you get an error about upstream being gone, first run:

```bash
git branch --unset-upstream
git push -u origin main
```

### Step 5: Verify on GitHub

1. Go to https://github.com
2. Navigate to your repository: `fedevent`
3. Verify you can see:
   - `prelaunch-server.js` file
   - `public/prelaunch.html` file
   - `render.yaml` file

✅ **GitHub deployment complete!**

---

## PART 2: DEPLOY TO RENDER.COM

### Step 1: Sign Up / Log In to Render

1. Go to https://render.com
2. Click **"Get Started"** or **"Sign In"**
3. Choose **"Sign in with GitHub"** (recommended)
4. Authorize Render to access your GitHub repositories

### Step 2: Create New Web Service

1. From Render Dashboard, click **"New +"** button (top right)
2. Select **"Web Service"**

### Step 3: Connect Your Repository

1. You'll see a list of your GitHub repositories
2. Find **"fedevent"** repository
3. Click **"Connect"**

*If you don't see your repository:*
- Click "Configure account" 
- Grant Render access to your repositories
- Refresh the page

### Step 4: Configure Your Web Service

Fill in the configuration form with these EXACT values:

**Basic Settings:**
```
Name: fedevent-prelaunch
Region: Oregon (US West) or closest to your location
Branch: main
Root Directory: (leave blank)
```

**Build & Deploy:**
```
Runtime: Node
Build Command: npm install
Start Command: node prelaunch-server.js
```

**Instance Type:**
- Select **"Free"** for testing
- Or select **"Starter ($7/month)"** for production (recommended)

### Step 5: Add Environment Variables

Scroll down to **"Environment Variables"** section.

Click **"Add Environment Variable"** and add these ONE BY ONE:

#### Variable 1:
```
Key: NODE_ENV
Value: production
```

#### Variable 2:
```
Key: SMTP_HOST
Value: smtpout.secureserver.net
```

#### Variable 3:
```
Key: SMTP_PORT
Value: 465
```

#### Variable 4:
```
Key: SMTP_SECURE
Value: true
```

#### Variable 5:
```
Key: SMTP_USER
Value: noreply@fedevent.com
```
*(or your actual GoDaddy email)*

#### Variable 6:
```
Key: SMTP_PASS
Value: [YOUR_GODADDY_EMAIL_PASSWORD]
```
*(Replace with your actual password - keep it secret!)*

#### Variable 7:
```
Key: NOTIFY_TO
Value: admin@creata.com
```
*(or your email where you want notifications)*

#### Variable 8:
```
Key: NOTIFY_FROM
Value: noreply@fedevent.com
```

### Step 6: Create Web Service

1. Scroll to the bottom
2. Click **"Create Web Service"**
3. Wait for deployment (this takes 2-5 minutes)

You'll see:
- "Building..." (installing dependencies)
- "Deploying..." (starting your server)
- "Live" (your site is ready!)

### Step 7: Get Your URL

Once deployment succeeds, you'll see your URL:

```
https://fedevent-prelaunch.onrender.com
```

✅ **Render deployment complete!**

---

## PART 3: TEST YOUR DEPLOYMENT

### Test 1: Check Server Health

Open this URL in your browser:

```
https://fedevent-prelaunch.onrender.com/api/health
```

You should see:
```json
{
  "ok": true,
  "success": true,
  "status": "healthy",
  "server": "prelaunch",
  "port": 7777,
  "timestamp": "2025-10-10T..."
}
```

### Test 2: View Your Prelaunch Page

Open this URL:

```
https://fedevent-prelaunch.onrender.com/prelaunch.html
```

You should see:
- 🇺🇸 🇺🇳 flags in the header
- "FEDEVENT" logo with red and blue colors
- "Connect Your Hotel to Governmental Contract Opportunities" headline
- Join the Waitlist form

### Test 3: Submit a Test Lead

1. Fill out the form with test data
2. Click "Join the Waitlist"
3. You should see:
   - Success message with green checkmark
   - Your unique user code (FEV-XXXXX)
   - Confirmation message

### Test 4: Check Your Email

Within 1-2 minutes, check:

1. **Your admin email** (NOTIFY_TO address)
   - Subject: "🎯 New FEDEVENT Hotel Waitlist Signup"
   - Contains hotel information and user code

2. **Test contact email** (the email you entered in form)
   - Subject: "✅ Welcome to FEDEVENT - You're on the Waitlist!"
   - Contains user code and welcome message

✅ **If all tests pass, your prelaunch site is LIVE!**

---

## PART 4: CUSTOM DOMAIN (OPTIONAL)

If you want to use a custom domain like `prelaunch.fedevent.com`:

### Step 1: Add Custom Domain in Render

1. In Render Dashboard, go to your service
2. Click **"Settings"** tab
3. Scroll to **"Custom Domain"**
4. Click **"Add Custom Domain"**
5. Enter: `prelaunch.fedevent.com`
6. Click **"Save"**

Render will show you DNS records to add.

### Step 2: Update DNS in GoDaddy

1. Log in to GoDaddy
2. Go to **"My Products"** → **"Domains"**
3. Click **"DNS"** next to `fedevent.com`
4. Click **"Add"** to add a new record

**Add CNAME Record:**
```
Type: CNAME
Name: prelaunch
Value: fedevent-prelaunch.onrender.com
TTL: 600 seconds
```

5. Click **"Save"**

### Step 3: Wait for DNS Propagation

- DNS changes take 10-30 minutes to propagate
- Render will automatically provision SSL certificate (HTTPS)
- Check status in Render dashboard

### Step 4: Test Custom Domain

After 30 minutes, visit:

```
https://prelaunch.fedevent.com/prelaunch.html
```

✅ **Custom domain setup complete!**

---

## PART 5: CONTINUOUS DEPLOYMENT

Great news! Render is now set up for **automatic deployments**.

### How It Works:

Every time you push changes to GitHub:

```bash
# Make changes to your files
git add .
git commit -m "Update prelaunch page"
git push origin main
```

Render automatically:
1. Detects the GitHub push
2. Pulls the latest code
3. Runs `npm install`
4. Restarts your server
5. Deploys the update

### Monitor Deployments:

1. Go to Render Dashboard
2. Click on your service
3. Click **"Events"** tab to see deployment history

---

## 📊 PART 6: VIEW YOUR LEADS

### Option 1: Via Email Notifications

Every time someone signs up, you receive an email with their details at your NOTIFY_TO address.

### Option 2: Via Render Shell (Advanced)

1. Go to Render Dashboard
2. Click on your service
3. Click **"Shell"** tab (top right)
4. Wait for shell to load
5. Run these commands:

**View all leads:**
```bash
sqlite3 data/creata.db "SELECT * FROM hotel_leads ORDER BY created_at DESC LIMIT 10;"
```

**Count total leads:**
```bash
sqlite3 data/creata.db "SELECT COUNT(*) as total FROM hotel_leads;"
```

**View by state:**
```bash
sqlite3 data/creata.db "SELECT state, COUNT(*) as count FROM hotel_leads GROUP BY state ORDER BY count DESC;"
```

### Option 3: Create Admin Dashboard (Optional)

You can add an admin page later to view all leads in a nice interface.

---

## 🔧 TROUBLESHOOTING

### Issue: Site Not Loading

**Symptoms:** URL shows error or doesn't load

**Solutions:**
1. Check Render Dashboard → Logs tab for errors
2. Verify all environment variables are set correctly
3. Try manual redeploy: Dashboard → "Manual Deploy" → "Deploy latest commit"

### Issue: Emails Not Sending

**Symptoms:** Form submits but no emails received

**Solutions:**
1. Verify SMTP environment variables in Render
2. Check SMTP_USER and SMTP_PASS are correct
3. Check GoDaddy email account is active
4. Check spam folder
5. Test locally first: `http://localhost:7777/prelaunch.html`

### Issue: Form Submission Fails

**Symptoms:** Error message after clicking "Join the Waitlist"

**Solutions:**
1. Open browser console (F12 → Console tab)
2. Look for error messages
3. Verify all required fields are filled
4. Check Render logs for backend errors

### Issue: Database Not Persisting

**Symptoms:** Leads disappear after server restart

**Solutions:**
1. Free tier on Render restarts periodically
2. Upgrade to Starter plan ($7/month) for persistent disk
3. Or export leads regularly via email notifications

### Issue: Slow First Load

**Symptoms:** First visit takes 30-60 seconds to load

**Solutions:**
- This is normal for Free tier (server spins down after inactivity)
- Upgrade to Starter plan for always-on service
- Or accept the delay (subsequent visits are fast)

---

## 📈 PART 7: ANALYTICS

Your prelaunch page already has Google Analytics installed!

### View Analytics:

1. Go to https://analytics.google.com
2. Log in with your Google account
3. Select property: **G-WHNVHXGPHG**

### Track These Metrics:

- **Page views:** How many people visit
- **Form submissions:** Track as "generate_lead" events
- **User behavior:** Scroll depth, time on page
- **Traffic sources:** Where visitors come from

---

## 💰 COST BREAKDOWN

### Free Tier:
- **Cost:** $0/month
- **Good for:** Testing, low traffic
- **Limitations:** 
  - Spins down after 15 minutes of inactivity
  - Slow first load (30-60 seconds)
  - No persistent disk (database resets on restart)

### Starter Tier (Recommended):
- **Cost:** $7/month
- **Good for:** Production, real traffic
- **Benefits:**
  - Always running (no spin down)
  - Fast load times
  - Persistent disk (database never resets)
  - Better performance

### How to Upgrade:
1. Go to Render Dashboard
2. Click on your service
3. Click **"Settings"** tab
4. Scroll to **"Instance Type"**
5. Select **"Starter"**
6. Click **"Save"**

---

## ✅ FINAL CHECKLIST

Before going live with marketing:

- [ ] Site deployed to Render successfully
- [ ] Health check endpoint returns "healthy"
- [ ] Prelaunch page loads correctly
- [ ] Test lead submission works
- [ ] Admin notification email received
- [ ] User confirmation email received
- [ ] User code generation works
- [ ] All flags and colors display correctly
- [ ] Mobile responsive (test on phone)
- [ ] Google Analytics tracking works
- [ ] SSL certificate active (HTTPS)
- [ ] Custom domain configured (if applicable)
- [ ] Upgraded to Starter plan (if needed)

---

## 🎯 QUICK REFERENCE

### Your URLs:

**Render URL:**
```
https://fedevent-prelaunch.onrender.com/prelaunch.html
```

**Custom Domain (after setup):**
```
https://prelaunch.fedevent.com/prelaunch.html
```

**Health Check:**
```
https://fedevent-prelaunch.onrender.com/api/health
```

### Quick Deploy Commands:

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent
git add .
git commit -m "Update prelaunch site"
git push origin main
# Render auto-deploys in 2-3 minutes
```

### Support Resources:

- **Render Docs:** https://render.com/docs
- **Render Status:** https://status.render.com
- **GitHub Docs:** https://docs.github.com
- **Your Analytics:** https://analytics.google.com (G-WHNVHXGPHG)

---

## 🎉 YOU'RE DONE!

Your FEDEVENT prelaunch site is now live and ready to collect hotel leads!

### What to Do Next:

1. **Share your link** on social media
2. **Email hotel contacts** with the waitlist link
3. **Add link to your email signature**
4. **Monitor analytics** daily
5. **Check email notifications** for new leads
6. **Export leads** weekly for your CRM

### Marketing Message:

```
🏨 Hotels: Join the FEDEVENT waitlist!

🇺🇸 U.S. Government contracts
🇺🇳 United Nations opportunities  
💰 Guaranteed NET30 payments
📋 Zero direct billing paperwork

Be among the first 1,000 hotels:
https://prelaunch.fedevent.com/prelaunch.html

#FEDEVENT #GovernmentContracts #HotelManagement
```

---

**Need Help?**

- Email: info@Fedevent.com
- Check Render logs for errors
- Review this guide again
- Check TROUBLESHOOTING section above

---

*Last Updated: October 10, 2025*  
*Version: 1.0*  
*CREATA Global Event Agency LLC*

**🚀 Happy Launching!**

