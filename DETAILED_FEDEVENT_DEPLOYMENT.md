# 🚀 DETAILED FEDEVENT.COM DEPLOYMENT GUIDE

## STEP-BY-STEP DEPLOYMENT TO FEDEVENT.COM

### STEP 1: PREPARE YOUR CODE (ALREADY DONE ✅)

Your code is already ready with:
- ✅ Flag video on prelaunch page
- ✅ Email links pointing to fedevent.com
- ✅ All recent updates
- ✅ BASE_URL configured for production

### STEP 2: CREATE RENDER.COM ACCOUNT

1. **Go to https://render.com**
2. **Click "Get Started for Free"**
3. **Sign up with GitHub** (recommended)
   - Click "Sign up with GitHub"
   - Authorize Render to access your repositories
4. **Verify your email** if prompted

### STEP 3: CREATE NEW WEB SERVICE

1. **In Render Dashboard:**
   - Click the **"New +"** button (top right)
   - Select **"Web Service"**

2. **Connect Your Repository:**
   - Click **"Connect GitHub"** (if not already connected)
   - Find and select **"acamadan/fedevent"**
   - Click **"Connect"**

3. **Configure the Service:**
   ```
   Name: fedevent-main
   Environment: Web Service
   Region: Oregon (US West) - closest to you
   Branch: main
   Root Directory: (leave blank)
   Runtime: Node
   Build Command: npm install
   Start Command: node server.js
   ```

4. **Click "Create Web Service"**

### STEP 4: CONFIGURE ENVIRONMENT VARIABLES

1. **In your new service dashboard:**
   - Click **"Environment"** tab
   - Click **"Add Environment Variable"** for each:

2. **Add These Variables One by One:**

   **Required Variables:**
   ```
   NODE_ENV = production
   PORT = 10000
   BASE_URL = https://fedevent.com
   ```

   **SMTP Configuration (for emails):**
   ```
   SMTP_HOST = smtp.sendgrid.net
   SMTP_PORT = 587
   SMTP_SECURE = false
   SMTP_USER = apikey
   SMTP_PASS = [YOUR_SENDGRID_API_KEY]
   ```

   **Email Configuration:**
   ```
   NOTIFY_FROM = noreply@fedevent.com
   NOTIFY_TO = admin@fedevent.com
   ADMIN_EMAIL = admin@fedevent.com
   ADMIN_PASSWORD = [SECURE_PASSWORD]
   ```

   **API Keys (optional for now):**
   ```
   SAM_API_KEY = [YOUR_SAM_API_KEY]
   GSA_API_KEY = [YOUR_GSA_API_KEY]
   ANTHROPIC_API_KEY = [YOUR_ANTHROPIC_API_KEY]
   GOOGLE_PLACES_API_KEY = [YOUR_GOOGLE_PLACES_API_KEY]
   ```

3. **Click "Save Changes"**

### STEP 5: CONFIGURE INSTANCE TYPE

1. **In your service dashboard:**
   - Click **"Settings"** tab
   - Scroll to **"Instance Type"**
   - Select **"Starter ($7/month)"** (recommended for production)
   - Click **"Save Changes"**

### STEP 6: CONNECT FEDEVENT.COM DOMAIN

1. **In your service dashboard:**
   - Click **"Settings"** tab
   - Scroll to **"Custom Domains"**
   - Click **"Add Custom Domain"**

2. **Add Main Domain:**
   - Enter: `fedevent.com`
   - Click **"Add"**

3. **Add WWW Domain (optional):**
   - Click **"Add Custom Domain"** again
   - Enter: `www.fedevent.com`
   - Click **"Add"**

4. **Wait for DNS Instructions:**
   - Render will show you DNS records to add
   - **COPY THESE INSTRUCTIONS** - you'll need them for GoDaddy

### STEP 7: CONFIGURE GODADDY DNS

1. **Login to GoDaddy:**
   - Go to https://godaddy.com
   - Login to your account
   - Go to **"My Products"**

2. **Access DNS Management:**
   - Find **"fedevent.com"** in your domains
   - Click **"DNS"** or **"Manage DNS"**

3. **Add/Update DNS Records:**
   
   **For fedevent.com (main domain):**
   - Find existing A record for `@` (root)
   - **Edit it** to point to Render's IP address
   - OR **Delete it** and create new A record:
     ```
     Type: A
     Name: @
     Value: [RENDER_IP_ADDRESS]
     TTL: 600
     ```

   **For www.fedevent.com:**
   - Add CNAME record:
     ```
     Type: CNAME
     Name: www
     Value: fedevent-main.onrender.com
     TTL: 600
     ```

4. **Save Changes**

### STEP 8: WAIT FOR DEPLOYMENT

1. **Render will automatically:**
   - Build your application
   - Deploy it
   - Provision SSL certificate
   - Connect your domain

2. **This takes 5-15 minutes**

3. **You'll see status updates in Render dashboard**

### STEP 9: TEST YOUR LIVE SITE

1. **Wait 10-30 minutes** for DNS propagation

2. **Test these URLs:**
   - **Main Site:** https://fedevent.com
   - **Prelaunch Page:** https://fedevent.com/prelaunch.html ⭐
   - **Admin Dashboard:** https://fedevent.com/admin-dashboard.html
   - **Hotel Portal:** https://fedevent.com/hotel-login.html

3. **Test the prelaunch form:**
   - Fill out the form
   - Submit it
   - Check if you receive email notifications

---

## 🔄 HOW TO UPDATE YOUR LIVE FEDEVENT.COM SITE

### METHOD 1: AUTOMATIC DEPLOYMENT (RECOMMENDED)

**When you make changes to your code:**

1. **Make your changes locally** (like you're doing now)

2. **Commit and push to GitHub:**
   ```bash
   cd /Users/atakancamadan/Documents/GitHub/fedevent
   git add .
   git commit -m "Update: [describe your changes]"
   git push origin main
   ```

3. **Render automatically detects changes:**
   - Render monitors your GitHub repo
   - When you push to `main` branch, it automatically:
     - Pulls the latest code
     - Rebuilds the application
     - Redeploys to fedevent.com
     - **Zero downtime!**

4. **Your live site updates in 2-5 minutes**

### METHOD 2: MANUAL DEPLOYMENT

**If automatic deployment is disabled:**

1. **In Render Dashboard:**
   - Go to your service
   - Click **"Manual Deploy"**
   - Select **"Deploy latest commit"**
   - Click **"Deploy"**

2. **Wait 2-5 minutes for deployment**

### METHOD 3: ROLLBACK IF NEEDED

**If something goes wrong:**

1. **In Render Dashboard:**
   - Go to your service
   - Click **"Manual Deploy"**
   - Select **"Deploy previous commit"**
   - Click **"Deploy"**

---

## 📧 EMAIL CAMPAIGN SETUP

### STEP 1: IMPORT YOUR 13,140 CONTACTS

**Option A: Use Admin Dashboard**
1. Go to https://fedevent.com/admin-dashboard.html
2. Login with admin credentials
3. Use CSV import feature

**Option B: Direct Database Import**
1. Access Render shell
2. Import contacts via SQL

### STEP 2: SEND BULK EMAILS

**Via Admin Dashboard:**
1. Go to https://fedevent.com/admin-dashboard.html
2. Navigate to email campaign section
3. Select contacts
4. Send bulk emails

**All email links will point to:** https://fedevent.com/prelaunch.html

---

## 🔧 TROUBLESHOOTING

### Issue: Site Not Loading
- **Check:** DNS propagation (wait 30 minutes)
- **Check:** SSL certificate status in Render
- **Check:** Domain configuration in Render

### Issue: Emails Not Sending
- **Check:** SMTP credentials in Render environment variables
- **Check:** SendGrid API key is valid
- **Test:** Send test email first

### Issue: Updates Not Deploying
- **Check:** GitHub webhook is connected
- **Check:** Automatic deployment is enabled
- **Try:** Manual deployment

### Issue: Localhost Not Working
- **Your localhost setup is unchanged**
- **Still runs on port 7070**
- **Uses localhost URLs for development**

---

## 📊 MONITORING YOUR LIVE SITE

### Render Dashboard
- **Logs:** View real-time logs
- **Metrics:** CPU, memory usage
- **Deployments:** Deployment history

### Google Analytics
- **Real-time visitors**
- **Form submissions**
- **Traffic sources**

### Email Tracking
- **Open rates**
- **Click rates**
- **Unsubscribe rates**

---

## ✅ DEPLOYMENT CHECKLIST

**Before Going Live:**
- [ ] Render service created
- [ ] Environment variables configured
- [ ] Domain connected (fedevent.com)
- [ ] DNS records updated
- [ ] SSL certificate active
- [ ] Site loads on https://fedevent.com
- [ ] Prelaunch page works: https://fedevent.com/prelaunch.html
- [ ] Form submissions work
- [ ] Email notifications work
- [ ] Flag video displays correctly

**After Going Live:**
- [ ] Test all functionality
- [ ] Import contact database
- [ ] Send test email campaign
- [ ] Monitor performance
- [ ] Set up monitoring alerts

---

## 🎯 YOUR LIVE URLS

**Production (fedevent.com):**
- **Main Site:** https://fedevent.com
- **Prelaunch:** https://fedevent.com/prelaunch.html ⭐
- **Admin:** https://fedevent.com/admin-dashboard.html
- **Hotel Portal:** https://fedevent.com/hotel-login.html

**Development (localhost):**
- **Main Site:** http://localhost:7070
- **Prelaunch:** http://localhost:7070/prelaunch.html
- **Admin:** http://localhost:7070/admin-dashboard.html

---

**Ready to deploy to fedevent.com!** 🚀

Your prelaunch site will be live at https://fedevent.com/prelaunch.html with all your updates including the flag video!
