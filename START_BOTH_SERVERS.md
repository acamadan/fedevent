# 🚀 Running Both FEDEVENT Servers

## Two Separate Servers

FEDEVENT now runs on **two separate servers**:

1. **Prelaunch Landing Page** → Port **7777**
2. **Main FEDEVENT Site** → Port **7070**

---

## 🎯 Quick Start

### Option 1: Start Prelaunch Only (Port 7777)

```bash
./start-server.sh
```

Or:

```bash
node prelaunch-server.js
```

**Then visit:** http://localhost:7777/prelaunch.html

---

### Option 2: Start Main Site Only (Port 7070)

```bash
node server.js
```

**Then visit:** http://localhost:7070/

---

### Option 3: Start Both Servers

**Terminal 1:**
```bash
node prelaunch-server.js
```

**Terminal 2:**
```bash
node server.js
```

**Access:**
- Prelaunch: http://localhost:7777/prelaunch.html
- Main Site: http://localhost:7070/

---

## 📊 Server Comparison

| Feature | Prelaunch (7777) | Main Site (7070) |
|---------|------------------|------------------|
| **Purpose** | Collect waitlist leads | Full platform |
| **Database** | Shared (`hotel_leads` table) | Shared (all tables) |
| **Login** | No login needed | Full authentication |
| **Features** | Form + Email notifications | Complete platform |
| **File** | `prelaunch-server.js` | `server.js` |

---

## 🗄️ Shared Database

Both servers use the same database: `data/creata.db`

- Prelaunch saves to: `hotel_leads` table
- Main site uses: `hotels`, `users`, and all other tables
- User codes link them: `FEV-XXXXX`

---

## 💡 Why Two Servers?

**Benefits:**
✅ Complete separation of concerns
✅ Can deploy prelaunch independently
✅ Main site development doesn't affect prelaunch
✅ Different domains possible (prelaunch.fedevent.com, fedevent.com)
✅ Independent scaling and monitoring

---

## 🌐 Production Deployment

### Deploy Prelaunch First

```bash
# Prelaunch server on subdomain
prelaunch.fedevent.com → runs prelaunch-server.js on port 7777
```

### Deploy Main Site Later

```bash
# Main site on primary domain
fedevent.com → runs server.js on port 7070
```

---

## 📝 Environment Variables

Both servers share the same `.env` file:

```bash
# Email (used by both)
SMTP_HOST=smtpout.secureserver.net
SMTP_USER=noreply@fedevent.com
NOTIFY_TO=admin@creata.com

# No need to set PORT - servers have their own defaults
# Prelaunch: 7777 (hardcoded)
# Main: 7070 (default in server.js)
```

---

## 🧪 Testing

### Test Prelaunch Server
```bash
# Start prelaunch server
node prelaunch-server.js

# Test API
curl -X POST http://localhost:7777/api/leads \
  -H "Content-Type: application/json" \
  -d '{"hotelName":"Test","city":"NYC","state":"NY","contactName":"John","title":"Manager","email":"test@test.com","interests":"lodging"}'

# Test email
curl -X POST http://localhost:7777/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"to":"your@email.com"}'
```

### Test Main Server
```bash
# Start main server
node server.js

# Visit main site
open http://localhost:7070/
```

---

## 🔄 Development Workflow

### Working on Prelaunch
```bash
# Only run prelaunch server
node prelaunch-server.js

# Make changes to:
# - public/prelaunch.html
# - prelaunch-server.js

# Restart to see changes
```

### Working on Main Site
```bash
# Only run main server
node server.js

# Make changes to:
# - server.js
# - public/*.html (except prelaunch.html)

# Restart to see changes
```

---

## 📦 Files Structure

```
fedevent/
├── prelaunch-server.js      ← Prelaunch server (7777)
├── server.js                 ← Main server (7070)
├── start-server.sh          ← Quick start prelaunch
├── data/
│   └── creata.db            ← Shared database
└── public/
    ├── prelaunch.html       ← Prelaunch page
    ├── index.html           ← Main site homepage
    └── ...                  ← Other pages
```

---

## 🎯 Summary

**For Prelaunch Only:**
```bash
./start-server.sh
# or
node prelaunch-server.js
```
→ http://localhost:7777/prelaunch.html

**For Main Site Only:**
```bash
node server.js
```
→ http://localhost:7070/

**Both Together:**
Run in separate terminals!

---

*Last Updated: October 10, 2025*

