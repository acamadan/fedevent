# 🚀 FEDEVENT.com Production Deployment Guide

## Deploy to fedevent.com (Main Domain)

### Step 1: Push to GitHub
```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent
git add .
git commit -m "Production deployment ready for fedevent.com"
git push origin main
```

### Step 2: Deploy to Render.com

1. **Go to https://render.com**
2. **Sign up/Login** with your GitHub account
3. **Click "New +" → "Web Service"**
4. **Connect Repository:** `acamadan/fedevent`
5. **Configure Service:**

```
Name: fedevent-main
Region: Oregon (US West)
Branch: main
Root Directory: (leave blank)
Runtime: Node
Build Command: npm install
Start Command: node server.js
Instance Type: Starter ($7/month) - recommended for production
```

6. **Environment Variables:**
```
NODE_ENV=production
PORT=10000
BASE_URL=https://fedevent.com
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=[your-sendgrid-api-key]
NOTIFY_FROM=noreply@fedevent.com
NOTIFY_TO=admin@fedevent.com
ADMIN_EMAIL=admin@fedevent.com
ADMIN_PASSWORD=[secure-password]
```

7. **Click "Create Web Service"**

### Step 3: Connect to fedevent.com Domain

1. **In Render Dashboard:**
   - Go to your service → Settings → Custom Domain
   - Add: `fedevent.com`
   - Add: `www.fedevent.com`

2. **In GoDaddy DNS:**
   - Go to DNS Management for `fedevent.com`
   - Add A record:
   ```
   Type: A
   Name: @
   Value: [Render IP address]
   TTL: 600
   ```
   - Add CNAME record:
   ```
   Type: CNAME
   Name: www
   Value: fedevent-main.onrender.com
   TTL: 600
   ```

3. **Wait 10-30 minutes** for DNS propagation

### Step 4: Your Live URLs

- **Main Site:** https://fedevent.com
- **Prelaunch Page:** https://fedevent.com/prelaunch.html
- **Admin Dashboard:** https://fedevent.com/admin-dashboard.html
- **Hotel Portal:** https://fedevent.com/hotel-login.html

### Step 5: Email Links Configuration

All email templates are already configured to use:
- `process.env.BASE_URL` which is set to `https://fedevent.com`
- This means all email links will point to the correct domain

### Step 6: Local Development (Unchanged)

Your localhost setup remains exactly the same:
- **Local Server:** http://localhost:7070
- **Local Prelaunch:** http://localhost:7070/prelaunch.html
- **Local Admin:** http://localhost:7070/admin-dashboard.html

The .env file has `BASE_URL=https://fedevent.com` for production emails, but localhost will still work with localhost URLs.

### Step 7: Test Production

1. **Visit:** https://fedevent.com/prelaunch.html
2. **Test form submission**
3. **Check email notifications**
4. **Verify all links work**

### Step 8: Email Campaign

Once deployed, you can:
1. **Import your 13,140 hotel contacts**
2. **Send bulk prelaunch emails**
3. **All links will point to https://fedevent.com/prelaunch.html**

---

## ✅ Production Checklist

- [ ] Code pushed to GitHub
- [ ] Render service created
- [ ] Environment variables set
- [ ] Domain connected (fedevent.com)
- [ ] DNS propagated
- [ ] SSL certificate active
- [ ] Site loads on https://fedevent.com
- [ ] Prelaunch page works
- [ ] Form submissions work
- [ ] Email notifications work
- [ ] All links point to correct domain

---

## 🔧 Troubleshooting

**Issue: Domain not connecting**
- Wait 30 minutes for DNS propagation
- Check DNS records are correct
- Verify SSL certificate is active

**Issue: Emails not sending**
- Check SMTP credentials in Render
- Test with small batch first
- Verify SendGrid API key

**Issue: Localhost not working**
- Your localhost setup is unchanged
- Still runs on port 7070
- Uses localhost URLs for local development

---

**Ready to deploy to fedevent.com!** 🎉

Your prelaunch site will be live at https://fedevent.com/prelaunch.html with all your updates including the flag video!
