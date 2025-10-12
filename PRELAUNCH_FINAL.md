# 🎉 FEDEVENT PRELAUNCH - FINAL VERSION

## ✅ ALL COMPLETE - SINGLE SERVER ON PORT 7070

### Both Sites Run Together:
- **Main FEDEVENT site:** http://localhost:7070/
- **Prelaunch page:** http://localhost:7070/prelaunch.html

**One server, one command, port 7070!**

---

## 🚀 START THE SERVER

```bash
cd /Users/atakancamadan/Documents/GitHub/fedevent
node server.js
```

**Then visit:**
```
http://localhost:7070/prelaunch.html
```

---

## ✅ FINAL DESIGN

### Header (Fixed at Top)
```
┌─────────────────────┐
│      FEDEVENT       │
│   (FED=red, EVENT=blue)
└─────────────────────┘
```

### Colors
- Red: #B22234 (USA Red)
- Blue: #3C3B6E (USA Blue)
- White: #FFFFFF
- Black: #000000

### Removed
- ❌ Flag emojis from header
- ❌ CREATA badge
- ❌ UEI/CAGE codes
- ❌ "Follow Us" links
- ❌ Large FEDEVENT logo section

---

## 📝 FORM FEATURES

### 1. Google Places Autocomplete
- Type hotel name → Select from suggestions
- Auto-fills: Address, City, State, Hotel Phone
- Shows info box with full details

### 2. Personal Information
- Your Name
- Your Title (dropdown - 12 options)
- Your Email  
- Your Phone (personal)

### 3. Interests (checkboxes)
- Lodging Contracts
- Conference & Meeting Space
- Long-Term BPA Opportunities

### 4. Payment & Compliance (matches signup page)
- **Accepts NET30?** (Yes/No)
- **Government Backed PO** (Acceptable/Unacceptable)
- Info box explaining PO policy

---

## 📊 DATA COLLECTED

Each signup captures:
- Hotel name (Google Places)
- Full hotel address
- Hotel phone number
- Google Place ID
- City & State
- Contact person name
- Contact person title
- Contact person email
- Contact person phone
- Interests
- NET30 acceptance
- Government PO acceptance
- User code (FEV-XXXXX)
- Timestamp

---

## 📧 EMAILS SENT

### Admin Notification:
- To: NOTIFY_TO
- Shows all hotel details
- Includes eligibility responses
- User code highlighted

### Hotel Confirmation:
- To: Hotel contact
- Shows user code
- Launch year: 2026
- What happens next

---

## 🌐 DEPLOYMENT

### GitHub:
```bash
git add .
git commit -m "Complete FEDEVENT prelaunch - patriotic design, Google Places, eligibility"
git push origin main
```

### Render.com:
- Build: `npm install`
- Start: `node server.js`
- Port: Uses environment PORT or 7070

**Full instructions:** `DEPLOYMENT_GUIDE.md`

---

## 🧪 TEST LOCALLY

```bash
# Start server
node server.js

# Visit prelaunch
open http://localhost:7070/prelaunch.html

# Visit main site
open http://localhost:7070/
```

---

## 📋 QUICK REFERENCE

| Item | Value |
|------|-------|
| **Server Command** | `node server.js` |
| **Port** | 7070 |
| **Prelaunch URL** | http://localhost:7070/prelaunch.html |
| **Main Site URL** | http://localhost:7070/ |
| **Launch Year** | 2026 |
| **Email** | noreply@fedevent.com |
| **Analytics** | G-WHNVHXGPHG |

---

## 🎯 FEATURES CHECKLIST

✅ Patriotic colors (red, white, blue, black)  
✅ Fixed header (FEDEVENT logo)  
✅ No flag emojis in header  
✅ Google Places autocomplete  
✅ Full address capture  
✅ Hotel phone vs personal phone  
✅ Title dropdown (12 options)  
✅ NET30 & PO eligibility (matches signup page)  
✅ User code system (FEV-XXXXX)  
✅ Launch year: 2026  
✅ Removed CREATA/UEI/CAGE  
✅ Removed Follow Us links  
✅ Email notifications  
✅ Google Analytics  
✅ Mobile responsive  
✅ Single server (port 7070)  

---

## 💡 VIEW COLLECTED LEADS

```bash
# View all leads
node view-leads.js

# Export to CSV  
node export-leads.js
```

---

## 🎉 READY!

**Your FEDEVENT prelaunch page is complete and running on the main server!**

Just run:
```bash
node server.js
```

Visit: http://localhost:7070/prelaunch.html

---

*Last Updated: October 10, 2025*  
*All features complete - Single server on port 7070*

