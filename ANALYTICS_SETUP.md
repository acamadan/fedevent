# 📊 FEDEVENT Analytics Setup Guide

## Google Analytics Configuration

**Tracking ID:** `G-WHNVHXGPHG`

---

## ✅ What's Tracked

### Prelaunch Page (Port 7777)

✅ **Page Views**
- Automatic tracking when page loads
- Page title: "FEDEVENT Prelaunch"

✅ **CTA Clicks**
- "Join the Waitlist" button clicks
- Scroll-to-form interactions

✅ **Form Events**
- Form submissions (success)
- Lead generation events
- Conversion tracking

✅ **Scroll Depth**
- 25%, 50%, 75%, 100% scroll tracking
- Engagement measurement

✅ **Time on Page**
- Session duration tracking

### Main Site (Port 7070)

✅ **Available Tracking Functions:**
- Page views
- Form submissions
- User registrations
- Logins
- Search queries
- File downloads
- External link clicks
- Video interactions

---

## 🎯 Tracked Events

### Prelaunch Page Events

| Event Name | Category | Label | When Fired |
|------------|----------|-------|------------|
| `page_view` | - | - | Page load |
| `click` | engagement | cta_hero_join_waitlist | CTA button clicked |
| `generate_lead` | engagement | hotel_waitlist_signup | Form submitted successfully |
| `conversion` | prelaunch | waitlist_signup | Form submitted successfully |
| `scroll` | engagement | 25%_scroll | User scrolls 25% |
| `scroll` | engagement | 50%_scroll | User scrolls 50% |
| `scroll` | engagement | 75%_scroll | User scrolls 75% |
| `scroll` | engagement | 100%_scroll | User scrolls to bottom |
| `timing_complete` | engagement | time_on_page | User leaves page |

---

## 📈 View Your Analytics

### Access Google Analytics

1. Go to https://analytics.google.com
2. Select FEDEVENT property (G-WHNVHXGPHG)
3. View real-time data or reports

### Key Reports to Check

**Real-Time Reports:**
- See live visitors on prelaunch page
- Active form submissions
- Current user locations

**Acquisition Reports:**
- Where visitors are coming from
- Social media traffic
- Direct vs referral traffic

**Engagement Reports:**
- Page views and sessions
- Scroll depth analysis
- Time on page metrics

**Conversion Reports:**
- Form submission rate
- Lead generation count
- Conversion funnel

---

## 🔧 Adding Tracking to New Pages

### For Main Site Pages

Add to `<head>` section:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WHNVHXGPHG"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-WHNVHXGPHG');
</script>

<!-- Analytics Helper Functions -->
<script src="/ga-tracking.js"></script>
```

### Track Custom Events

Use the helper functions from `ga-tracking.js`:

```javascript
// Track button clicks
trackButtonClick('register_hotel', 'engagement');

// Track form submissions
trackFormSubmission('hotel_registration', true);

// Track conversions
trackConversion('hotel_signup', 1);

// Track user registration
trackRegistration('hotel');

// Track login
trackLogin('hotel');

// Track search
trackSearch('hotels in DC', 15);

// Track downloads
trackDownload('hotel_agreement.pdf', 'pdf');

// Track external links
trackExternalLink('https://google.com', 'Google Link');
```

---

## 📊 Custom Event Examples

### Track Hotel Registration

```javascript
// In your registration form handler
fetch('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify(formData)
})
.then(response => response.json())
.then(result => {
  if (result.success) {
    // Track successful registration
    trackRegistration('hotel');
    trackConversion('hotel_signup', 1);
  } else {
    // Track failed registration
    trackFormSubmission('hotel_registration', false);
  }
});
```

### Track Login Events

```javascript
// In your login form handler
fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({email, password})
})
.then(response => response.json())
.then(result => {
  if (result.success) {
    // Track successful login
    trackLogin('hotel');
  }
});
```

### Track Search Queries

```javascript
// In your search functionality
fetch('/api/search?q=' + searchTerm)
.then(response => response.json())
.then(result => {
  // Track search
  trackSearch(searchTerm, result.results.length);
});
```

### Track File Downloads

```html
<!-- On download buttons -->
<a href="/documents/agreement.pdf" 
   onclick="trackDownload('hotel_agreement.pdf', 'pdf')">
  Download Agreement
</a>
```

---

## 🎯 Goals & Conversions Setup

### In Google Analytics:

1. Go to **Admin** → **Events**
2. Mark these as **Conversions:**
   - `generate_lead` (prelaunch signups)
   - `sign_up` (full registrations)
   - `form_submit` (any form submissions)

### Create Custom Goals:

1. **Prelaunch Goal:**
   - Event: `generate_lead`
   - Value: 1 per signup

2. **Registration Goal:**
   - Event: `sign_up`
   - Value: 10 per registration

3. **Engagement Goal:**
   - Event: `scroll` with label `100%_scroll`
   - Users who read entire page

---

## 📱 Enhanced E-commerce (Optional)

If you add paid features later:

```javascript
// Track purchases
gtag('event', 'purchase', {
  transaction_id: 'T12345',
  value: 49.99,
  currency: 'USD',
  items: [{
    item_id: 'setup_fee',
    item_name: 'FEDEVENT Setup Fee',
    price: 49.99,
    quantity: 1
  }]
});
```

---

## 🔍 Debugging Analytics

### Check if Analytics is Working

Open browser console and run:

```javascript
// Check if gtag is loaded
console.log(typeof gtag);  // Should show "function"

// Check dataLayer
console.log(window.dataLayer);  // Should show array with events

// Test tracking
gtag('event', 'test_event', {
  'event_category': 'test',
  'event_label': 'manual_test'
});
```

### View Real-Time Events

1. Go to Google Analytics
2. Click **Reports** → **Realtime** → **Events**
3. Trigger an event on your site
4. Should appear within seconds

---

## 🚀 Performance Optimization

### Async Loading

Analytics is loaded asynchronously:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WHNVHXGPHG"></script>
```

This doesn't block page rendering.

### Event Batching

Events are automatically batched and sent efficiently by Google Analytics.

---

## 🔒 Privacy & GDPR

### Cookie Consent (Optional)

If you need GDPR compliance:

```javascript
// Disable tracking until consent
gtag('consent', 'default', {
  'analytics_storage': 'denied'
});

// Enable after consent
function grantAnalyticsConsent() {
  gtag('consent', 'update', {
    'analytics_storage': 'granted'
  });
}
```

### IP Anonymization

Already enabled by default in GA4 (G-WHNVHXGPHG).

---

## 📊 Key Metrics to Monitor

### Prelaunch Phase

1. **Total Page Views**
   - How many people visited prelaunch page

2. **Conversion Rate**
   - Visitors / Form Submissions
   - Target: 20%+ is excellent

3. **Average Time on Page**
   - Higher = more engaged
   - Target: 2+ minutes

4. **Scroll Depth**
   - % reaching form section
   - Target: 60%+ reach waitlist form

5. **Bounce Rate**
   - % leaving without interaction
   - Target: <50%

### Post-Launch Phase

1. **User Registrations**
2. **Login Frequency**
3. **Search Queries**
4. **Feature Usage**
5. **Conversion Funnel**

---

## 🎨 Custom Dashboards

### Create Prelaunch Dashboard

1. Go to **Explorations** in GA
2. Create new **Blank** exploration
3. Add metrics:
   - Page views
   - Generate_lead events
   - Average engagement time
   - Scroll depth

4. Add dimensions:
   - Date
   - Source/Medium
   - City
   - Device category

---

## 📧 Automated Reports

### Set Up Email Reports

1. Go to **Admin** → **Access and Data Restriction**
2. Add your email
3. Schedule weekly reports:
   - Total leads generated
   - Traffic sources
   - User engagement

---

## 🔗 UTM Parameters for Marketing

Track campaign sources:

```
Prelaunch page links:
- LinkedIn: https://fedevent.com/prelaunch.html?utm_source=linkedin&utm_medium=social&utm_campaign=prelaunch
- Email: https://fedevent.com/prelaunch.html?utm_source=email&utm_medium=email&utm_campaign=prelaunch
- Google Ads: https://fedevent.com/prelaunch.html?utm_source=google&utm_medium=cpc&utm_campaign=prelaunch
```

View in GA: **Reports** → **Acquisition** → **Traffic acquisition**

---

## ✅ Checklist

Before going live:

- [ ] Google Analytics installed on prelaunch page
- [ ] Test tracking in Real-Time reports
- [ ] Form submission events firing correctly
- [ ] Scroll tracking working
- [ ] Time on page tracking enabled
- [ ] Conversion goals configured in GA
- [ ] UTM parameters added to marketing links
- [ ] Email reports scheduled

---

## 📞 Support

**Google Analytics Help:**
- https://support.google.com/analytics

**FEDEVENT Analytics:**
- Tracking ID: G-WHNVHXGPHG
- Helper functions: `/public/ga-tracking.js`

---

**Your analytics are ready!** 🎉

Every visitor, click, and conversion is now being tracked!

---

*Last Updated: October 10, 2025*

