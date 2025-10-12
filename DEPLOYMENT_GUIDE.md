# 🚀 FEDEVENT Prelaunch Deployment Guide

## Deploy to GitHub & Render.com

---

## 📦 Step 1: Push to GitHub

### Option A: Create New Repository for Prelaunch Only

```bash
# Navigate to project
cd /Users/atakancamadan/Documents/GitHub/fedevent

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "FEDEVENT Prelaunch Site - Patriotic Design with USG & UN Support"

# Create new repository on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/fedevent-prelaunch.git
git branch -M main
git push -u origin main
```

### Option B: Use Existing Repository

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent

# Check status
git status

# Add changes
git add .

# Commit
git commit -m "Add prelaunch page with patriotic design"

# Push
git push origin main
```

---

## 🌐 Step 2: Deploy to Render.com

### Create Render Account
1. Go to https://render.com
2. Sign up with GitHub
3. Authorize Render to access your repositories

### Deploy Prelaunch Server

1. **Click "New +" → "Web Service"**

2. **Connect Repository:**
   - Select your GitHub repository: `fedevent` or `fedevent-prelaunch`
   - Click "Connect"

3. **Configure Service:**
   ```
   Name: fedevent-prelaunch
   Region: Oregon (US West) or closest to you
   Branch: main
   Root Directory: (leave blank)
   Runtime: Node
   Build Command: npm install
   Start Command: node prelaunch-server.js
   ```

4. **Set Instance Type:**
   - Free tier is fine for prelaunch
   - Or choose Starter ($7/month) for better performance

5. **Environment Variables:**
   Click "Add Environment Variable" and add:
   
   ```
   SMTP_HOST=smtpout.secureserver.net
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=noreply@fedevent.com
   SMTP_PASS=[your-godaddy-email-password]
   NOTIFY_TO=admin@creata.com
   NOTIFY_FROM=noreply@fedevent.com
   NODE_ENV=production
   ```

6. **Click "Create Web Service"**

### Deployment Process
- Render will automatically:
  - Clone your repository
  - Run `npm install`
  - Start `node prelaunch-server.js`
  - Assign a URL like: `https://fedevent-prelaunch.onrender.com`

---

## 🔗 Step 3: Custom Domain Setup

### Connect Your Domain (prelaunch.fedevent.com)

1. **In Render Dashboard:**
   - Go to your service
   - Click "Settings" → "Custom Domain"
   - Add: `prelaunch.fedevent.com`
   - Render will show DNS records to add

2. **In GoDaddy (or your domain provider):**
   - Go to DNS Management for `fedevent.com`
   - Add CNAME record:
     ```
     Type: CNAME
     Name: prelaunch
     Value: fedevent-prelaunch.onrender.com
     TTL: 600 (10 minutes)
     ```

3. **Wait 10-30 minutes** for DNS propagation

4. **Render automatically provisions SSL certificate** (HTTPS)

---

## ✅ Step 4: Verify Deployment

### Test Your Live Site

Visit your URLs:
- **Render URL:** https://fedevent-prelaunch.onrender.com/prelaunch.html
- **Custom Domain:** https://prelaunch.fedevent.com/prelaunch.html

### Test Functionality:
1. ✅ Page loads with flags and patriotic colors
2. ✅ Form submission works
3. ✅ Email notifications sent
4. ✅ Google Analytics tracking
5. ✅ Mobile responsive

### Check Health:
```bash
curl https://fedevent-prelaunch.onrender.com/api/health
```

Should return:
```json
{
  "ok": true,
  "status": "healthy",
  "server": "prelaunch",
  "port": 7777,
  "timestamp": "2025-10-10T..."
}
```

---

## 📝 Step 5: Update Marketing Materials

Update all your links to:
```
https://prelaunch.fedevent.com/prelaunch.html
```

### Social Media Posts:
```
🏨 Hotels: Join the FEDEVENT waitlist!

🇺🇸 U.S. Government contracts
🇺🇳 United Nations opportunities
💰 Guaranteed NET30 payments
📋 Zero direct billing paperwork

Be among the first 1,000 hotels → https://prelaunch.fedevent.com/prelaunch.html

#FEDEVENT #GovernmentContracts #HotelManagement
```

### Email Signature:
```
Join FEDEVENT Waitlist: https://prelaunch.fedevent.com/prelaunch.html
```

---

## 🔄 Step 6: Continuous Deployment

### Automatic Updates

Every time you push to GitHub, Render automatically:
1. Detects the change
2. Rebuilds the service
3. Deploys the update
4. Zero downtime!

### Manual Redeployment

If needed, in Render dashboard:
- Click "Manual Deploy" → "Deploy latest commit"

---

## 🗄️ Step 7: Database Management

### Your database is local to the Render instance

**View Leads:**

Option 1 - Add an admin endpoint (recommended):

```javascript
// Add to prelaunch-server.js
app.get('/api/admin/leads', (req, res) => {
  // Add basic auth here
  const leads = db.prepare('SELECT * FROM hotel_leads ORDER BY created_at DESC').all();
  return ok(res, { leads });
});
```

Option 2 - Export via API:

```javascript
app.get('/api/admin/export-leads', (req, res) => {
  const leads = db.prepare('SELECT * FROM hotel_leads ORDER BY created_at DESC').all();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
  // Convert to CSV and send
});
```

Option 3 - Use Render Shell:
- In Render dashboard → "Shell"
- Run: `sqlite3 data/creata.db "SELECT * FROM hotel_leads;"`

---

## 💾 Step 8: Backup Strategy

### Regular Backups

**Option 1: Scheduled Backups (Recommended)**

Add to `prelaunch-server.js`:

```javascript
import cron from 'node-cron';

// Backup database daily at 2 AM
cron.schedule('0 2 * * *', () => {
  const backup = db.backup(`data/backup-${Date.now()}.db`);
  console.log('✅ Database backed up');
});
```

**Option 2: External Database**

For production, consider:
- Supabase (PostgreSQL)
- PlanetScale (MySQL)
- MongoDB Atlas

---

## 📊 Step 9: Monitoring

### Set Up Alerts

**In Render Dashboard:**
1. Go to your service
2. Click "Settings" → "Notifications"
3. Add:
   - Deploy success/failure
   - Service health checks
   - Resource usage alerts

### Monitor with Google Analytics

Already configured! View:
- Real-time visitors
- Form submissions
- Traffic sources

---

## 🔒 Step 10: Security Checklist

Before going live:

- [ ] HTTPS enabled (automatic with Render)
- [ ] Environment variables secured
- [ ] Email SMTP credentials not in code
- [ ] `.env` file in `.gitignore`
- [ ] CORS configured properly
- [ ] Rate limiting on form endpoint
- [ ] Google Analytics configured
- [ ] Error logging enabled

---

## 📱 Step 11: Test Everything

### Pre-Launch Checklist

**Functionality:**
- [ ] Page loads on desktop
- [ ] Page loads on mobile
- [ ] Form submission works
- [ ] Emails are received
- [ ] User codes generated
- [ ] Database stores data
- [ ] Analytics tracking works

**Design:**
- [ ] Flags display correctly (🇺🇸 🇺🇳)
- [ ] Colors are patriotic (red, white, blue, black)
- [ ] Font is bold throughout
- [ ] Responsive on all devices
- [ ] No console errors

**Content:**
- [ ] "Governmental Contract Opportunities" text
- [ ] USG and UN mentioned
- [ ] All links work
- [ ] Email address correct
- [ ] Contact information accurate

---

## 🚨 Troubleshooting

### Common Issues

**Issue: Render service won't start**
- Check logs in Render dashboard
- Verify `package.json` has all dependencies
- Ensure `prelaunch-server.js` exists

**Issue: Emails not sending**
- Verify SMTP environment variables
- Check GoDaddy email is active
- Test locally first

**Issue: Database not persisting**
- Render free tier restarts periodically
- Use persistent disk (paid plan)
- Or switch to external database

**Issue: Domain not connecting**
- Wait 30 minutes for DNS
- Verify CNAME record correct
- Check SSL certificate status

---

## 💰 Cost Breakdown

### Render.com Pricing

**Free Tier:**
- ✅ Good for testing
- ⚠️ Spins down after 15 min inactivity
- ⚠️ Database resets on restart

**Starter ($7/month):**
- ✅ Always running
- ✅ Persistent disk
- ✅ Better performance
- ✅ Recommended for production

**Pro ($25/month):**
- ✅ High availability
- ✅ Auto-scaling
- ✅ Priority support

---

## 📞 Support & Resources

**Render.com:**
- Docs: https://render.com/docs
- Status: https://status.render.com
- Support: https://render.com/support

**GitHub:**
- Docs: https://docs.github.com

**Your Project:**
- Prelaunch URL: https://prelaunch.fedevent.com
- Analytics: https://analytics.google.com (G-WHNVHXGPHG)
- Email: noreply@fedevent.com

---

## 🎉 Quick Deploy Commands

### All-in-One Deployment

```bash
# 1. Navigate to project
cd /Users/atakancamadan/Documents/GitHub/fedevent

# 2. Add and commit changes
git add .
git commit -m "Deploy prelaunch site"

# 3. Push to GitHub
git push origin main

# 4. Render will auto-deploy!
# 5. Visit: https://fedevent-prelaunch.onrender.com/prelaunch.html
```

---

## 📝 Post-Deployment Tasks

1. **Share the Link:**
   - LinkedIn post
   - Email to hotel contacts
   - Add to email signature

2. **Monitor Analytics:**
   - Check daily visitors
   - Track form submissions
   - Monitor conversion rate

3. **Collect Feedback:**
   - Test with real users
   - Make improvements
   - Update as needed

4. **Export Leads Weekly:**
   - Download lead data
   - Back up locally
   - Import to CRM

---

**Ready to deploy!** 🚀

Follow these steps and your FEDEVENT prelaunch page will be live for the world to see!

---

*Last Updated: October 10, 2025*  
*CREATA Global Event Agency LLC*

