# GoDaddy Hosting Setup Guide for FEDEVENT

## Overview
This guide explains how to deploy your FEDEVENT application on GoDaddy hosting and configure email functionality.

## Database Storage Options

### Current Setup (SQLite)
Your application currently uses SQLite with the `better-sqlite3` package, storing data in `/data/creata.db`. This is lightweight and perfect for small to medium applications.

**Pros:**
- No additional database server needed
- File-based storage (easy backups)
- Perfect for applications with < 100,000 users
- Zero configuration required

**Cons:**
- Limited concurrent write operations
- Single file can become large over time

### Recommended for GoDaddy Hosting

#### Option 1: Keep SQLite (Recommended for Start)
- **Storage needed:** 10-50 MB initially (grows ~1KB per user registration)
- **GoDaddy Plan:** Economy or Deluxe plan (sufficient for 10,000+ users)
- **Backup:** Include `/data/` folder in your regular backups

#### Option 2: Upgrade to MySQL (For Scale)
If you expect > 10,000 users, consider upgrading:
- GoDaddy provides MySQL databases with most hosting plans
- Better for concurrent users and complex queries
- Requires code changes (replace SQLite queries with MySQL)

## Email Configuration (SMTP)

### GoDaddy Email Setup
To enable welcome emails and notifications, configure these environment variables:

```bash
# GoDaddy SMTP Settings
SMTP_HOST=smtp.godaddy.com
SMTP_PORT=587
SMTP_USER=your-email@yourdomain.com
SMTP_PASS=your-email-password
SMTP_SECURE=false
NOTIFY_FROM=noreply@yourdomain.com
NOTIFY_TO=admin@yourdomain.com
```

### Alternative Email Services (Recommended)
For better email deliverability, consider:

1. **SendGrid** (Free tier: 100 emails/day)
2. **Mailgun** (Free tier: 5,000 emails/month)
3. **Amazon SES** (Very cost-effective)

## Deployment Steps

### 1. Prepare Your Application
```bash
# Install dependencies
npm install

# Create production build (if needed)
npm run build
```

### 2. Upload to GoDaddy
- Use cPanel File Manager or FTP
- Upload all files to your domain's public folder
- Ensure `node_modules` is included or run `npm install` on server

### 3. Configure Environment Variables
Create `.env` file in your root directory:
```bash
NODE_ENV=production
PORT=5050
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=secure-admin-password-here

# SMTP Configuration (choose one)
SMTP_HOST=smtp.godaddy.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-email-password
NOTIFY_FROM=noreply@yourdomain.com
NOTIFY_TO=admin@yourdomain.com

# Optional: SAM.gov API (for government contracts)
SAM_API_KEY=your-sam-api-key
```

### 4. Database Setup
Your SQLite database will be created automatically in `/data/creata.db`. Ensure this directory is writable.

### 5. Start Application
```bash
npm start
```

## Storage Requirements Estimate

| Users | Database Size | Files/Uploads | Total Storage |
|-------|---------------|---------------|---------------|
| 100   | ~100 KB      | ~10 MB        | ~10 MB        |
| 1,000 | ~1 MB        | ~100 MB       | ~100 MB       |
| 10,000| ~10 MB       | ~1 GB         | ~1 GB         |

## Recommended GoDaddy Plans

### For Small Scale (< 1,000 users)
- **Economy Plan**: 100 GB storage, unlimited bandwidth
- **Cost**: ~$7-10/month
- **Perfect for**: Testing and initial launch

### For Medium Scale (1,000-10,000 users)
- **Deluxe Plan**: Unlimited storage, better performance
- **Cost**: ~$12-15/month
- **Perfect for**: Growing business

### For Large Scale (10,000+ users)
- **Ultimate Plan**: Maximum resources
- **Cost**: ~$16-20/month
- **Consider**: Dedicated hosting or VPS

## Security Recommendations

1. **Environment Variables**: Never commit `.env` to version control
2. **Admin Password**: Use strong password for admin account
3. **Database Backups**: Set up automatic backups of `/data/` folder
4. **SSL Certificate**: Enable HTTPS (GoDaddy provides free SSL)
5. **Regular Updates**: Keep dependencies updated

## Monitoring & Maintenance

### Log Files
Monitor application logs for:
- Registration attempts
- Email delivery failures
- Database errors

### Backup Strategy
1. **Database**: Backup `/data/creata.db` daily
2. **Uploads**: Backup `/uploads/` folder weekly
3. **Code**: Keep code in version control (Git)

### Performance Monitoring
- Monitor database file size growth
- Check email delivery rates
- Track user registration success rates

## Troubleshooting

### Email Not Sending
1. Verify SMTP credentials
2. Check GoDaddy email settings
3. Test with `/api/test-email` endpoint
4. Consider alternative email service

### Database Issues
1. Check file permissions on `/data/` folder
2. Monitor disk space usage
3. Consider database optimization if file > 100MB

### Performance Issues
1. Monitor server resources
2. Consider upgrading hosting plan
3. Implement caching if needed

## Support Contacts
- **GoDaddy Support**: Available 24/7
- **Application Issues**: Check logs and error messages
- **Email Delivery**: Contact your email provider

---

**Note**: This setup should handle thousands of users efficiently. Monitor growth and upgrade as needed.


