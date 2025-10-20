#!/usr/bin/env node
/**
 * FEDEVENT Prelaunch Landing Page - Standalone Server
 * Runs on port 7777 (separate from main site on 7070)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7777;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const DB_PATH = path.join(__dirname, 'data', 'creata.db');
const db = new Database(DB_PATH);

// Ensure hotel_leads table exists with all fields
try {
  db.exec(`CREATE TABLE IF NOT EXISTS hotel_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_code TEXT UNIQUE NOT NULL,
    hotel_name TEXT NOT NULL,
    hotel_address TEXT,
    hotel_phone TEXT,
    hotel_place_id TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    title TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    interests TEXT,
    currently_operating TEXT,
    accept_net30 TEXT,
    accept_direct_bill TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notified INTEGER DEFAULT 0
  )`);
  console.log('✅ Hotel leads table ready');
} catch (e) {
  console.log('Hotel leads table already exists');
}

// Add new columns if they don't exist (migrations)
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN user_code TEXT UNIQUE`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN hotel_address TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN hotel_phone TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN hotel_place_id TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN currently_operating TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN accept_net30 TEXT`); } catch (e) {}
try { db.exec(`ALTER TABLE hotel_leads ADD COLUMN accept_direct_bill TEXT`); } catch (e) {}

// Helper functions
function ok(res, data = {}) {
  return res.json({ ok: true, success: true, ...data });
}

function fail(res, code = 400, error = 'Bad request', extra = {}) {
  return res.status(code).json({ ok: false, error, ...extra });
}

// Email sending function
async function sendMail({ to, subject, html, replyTo, from }) {
  try {
    if (!process.env.SMTP_HOST || !to) {
      console.warn('Email skipped: Missing SMTP_HOST or recipient');
      return { skipped: true, reason: 'Missing configuration' };
    }

    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const secure = (String(process.env.SMTP_SECURE || '').toLowerCase() === 'true') || smtpPort === 465;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure,
      requireTLS: !secure,
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    });

    const mailOptions = {
      from: from || process.env.NOTIFY_FROM || 'noreply@fedevent.com',
      to,
      subject,
      html
    };

    if (replyTo) {
      mailOptions.replyTo = replyTo;
    }

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email error:', error.message);
    throw error;
  }
}

// ---------- PRELAUNCH API ENDPOINT ----------
app.post('/api/leads', async (req, res) => {
  try {
    console.log('📥 Received request body:', JSON.stringify(req.body, null, 2));
    
    const {
      hotelName, hotelAddress, hotelPhone, hotelPlaceId,
      city, state, contactName, title, email, phone, interests,
      currentlyOperating, acceptNet30, acceptDirectBill
    } = req.body;

    // Validate required fields
    if (!hotelName || !city || !state || !contactName || !title || !email) {
      return fail(res, 400, 'Required fields missing');
    }
    
    // Validate eligibility questions
    if (!currentlyOperating || !acceptNet30 || !acceptDirectBill) {
      return fail(res, 400, 'Please answer all eligibility questions');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return fail(res, 400, 'Invalid email address');
    }

    // Generate unique user code (FEV-XXXXX format)
    let userCode = '';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      userCode = `FEV-${randomNum}`;

      const existing = db.prepare(`SELECT id FROM hotel_leads WHERE user_code = ?`).get(userCode);
      if (!existing) break;

      attempts++;
    }

    if (attempts >= maxAttempts) {
      return fail(res, 500, 'Failed to generate unique user code');
    }

    // Insert into database with all new fields
    const result = db.prepare(`
      INSERT INTO hotel_leads (
        user_code, hotel_name, hotel_address, hotel_phone, hotel_place_id,
        city, state, contact_name, title, email, phone, interests,
        currently_operating, accept_net30, accept_direct_bill
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userCode, hotelName, hotelAddress || '', hotelPhone || '', hotelPlaceId || '',
      city, state, contactName, title, email, phone || '', interests || '',
      currentlyOperating, acceptNet30, acceptDirectBill
    );

    const leadId = Number(result.lastInsertRowid);

    console.log(`✅ New lead: ${userCode} - ${hotelName} (${city}, ${state})`);

    // Send notification email if configured
    if (process.env.NOTIFY_TO && process.env.SMTP_HOST) {
      const subject = '🎯 New FEDEVENT Hotel Waitlist Signup';

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #0071e3 0%, #8e44ad 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800;">FEDEVENT</h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px;">New Waitlist Registration</p>
          </div>
          
          <div style="padding: 30px; background: #f8f9fa;">
            <div style="background: #ffffff; padding: 25px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
              <h2 style="color: #1a1a1a; margin: 0 0 20px 0; font-size: 22px;">Hotel Information</h2>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563; width: 40%;">Hotel Name:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${hotelName}</td>
                </tr>
                ${hotelAddress ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Address:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${hotelAddress}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Location:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${city}, ${state}</td>
                </tr>
                ${hotelPhone ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Hotel Phone:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${hotelPhone}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Contact Name:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${contactName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Title:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${title}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Email:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">
                    <a href="mailto:${email}" style="color: #0071e3; text-decoration: none;">${email}</a>
                  </td>
                </tr>
                ${phone ? `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Phone:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">
                    <a href="tel:${phone}" style="color: #0071e3; text-decoration: none;">${phone}</a>
                  </td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563; vertical-align: top;">Interests:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${interests || 'Not specified'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Currently Operating:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${currentlyOperating === 'yes' ? '✅ Yes' : '❌ No'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #4b5563;">Accepts NET30:</td>
                  <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1a1a1a;">${acceptNet30 === 'yes' ? '✅ Yes' : '❌ No'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; font-weight: 600; color: #4b5563;">Accepts Direct Bill:</td>
                  <td style="padding: 12px 0; color: #1a1a1a;">${acceptDirectBill === 'yes' ? '✅ Yes' : '❌ No'}</td>
                </tr>
              </table>
            </div>
            
            <div style="margin-top: 20px; padding: 20px; background: #f0f9ff; border-left: 4px solid #0071e3; border-radius: 8px;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">
                <strong>User Code:</strong> <span style="font-size: 18px; font-weight: 700; color: #0071e3;">${userCode}</span><br>
                <strong>Lead ID:</strong> #${leadId}<br>
                <strong>Submitted:</strong> ${new Date().toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZoneName: 'short'
                })}
              </p>
            </div>
          </div>
          
          <div style="padding: 20px; text-align: center; background: #f8f9fa; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              CREATA Global Event Agency LLC
            </p>
          </div>
        </div>
      `;

      try {
        await sendMail({
          to: process.env.NOTIFY_TO,
          subject,
          html,
          replyTo: email
        });

        db.prepare(`UPDATE hotel_leads SET notified = 1 WHERE id = ?`).run(leadId);
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
      }
    }

    // Send confirmation email to the hotel contact
    if (process.env.SMTP_HOST) {
      const confirmationHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #0071e3 0%, #8e44ad 100%); padding: 40px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 800;">FEDEVENT</h1>
            <p style="color: #ffffff; margin: 15px 0 0 0; font-size: 16px; opacity: 0.95;">Government Contracts Simplified</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <div style="text-align: center; font-size: 60px; margin-bottom: 20px;">✅</div>
            
            <h2 style="color: #1a1a1a; margin: 0 0 15px 0; font-size: 28px; text-align: center;">Welcome to the Waitlist!</h2>
            
            <div style="background: linear-gradient(135deg, #0071e3 0%, #8e44ad 100%); padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
              <p style="color: #ffffff; margin: 0 0 8px 0; font-size: 14px; opacity: 0.9;">Your Unique User Code</p>
              <p style="color: #ffffff; margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 2px;">${userCode}</p>
              <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 12px; opacity: 0.8;">Save this code for future reference</p>
            </div>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              Dear ${contactName},
            </p>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              Thank you for joining the FEDEVENT waitlist! <strong>${hotelName}</strong> will be among the first hotels invited when our platform launches in <strong>2026</strong>.
            </p>
            
            <div style="background: linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%); padding: 25px; border-radius: 12px; margin: 30px 0;">
              <h3 style="color: #1a1a1a; margin: 0 0 15px 0; font-size: 18px;">What Happens Next?</h3>
              <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>You'll receive priority access when FEDEVENT launches</li>
                <li>Free featured placement as one of the first 1,000 hotels</li>
                <li>Early invitations to exclusive RFPs from U.S. Government agencies</li>
                <li>Dedicated onboarding support from our team</li>
              </ul>
            </div>
            
            <div style="background: #ffffff; padding: 20px; border: 2px solid #e5e7eb; border-radius: 12px; margin: 30px 0;">
              <h3 style="color: #1a1a1a; margin: 0 0 12px 0; font-size: 18px;">Your Registration Details</h3>
              <p style="color: #6b7280; margin: 0; line-height: 1.6;">
                <strong>User Code:</strong> <span style="color: #0071e3; font-weight: 700; font-size: 16px;">${userCode}</span><br>
                <strong>Hotel:</strong> ${hotelName}<br>
                <strong>Location:</strong> ${city}, ${state}<br>
                <strong>Contact:</strong> ${contactName} (${title})<br>
                <strong>Email:</strong> ${email}
                ${phone ? `<br><strong>Phone:</strong> ${phone}` : ''}
              </p>
            </div>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
              If you have any questions in the meantime, please don't hesitate to reach out to us at 
              <a href="mailto:info@Fedevent.com" style="color: #0071e3; text-decoration: none;">info@Fedevent.com</a>.
            </p>
            
          </div>
          
          <div style="padding: 30px; text-align: center; background: #f8f9fa; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              © 2025 CREATA Global Event Agency LLC. All rights reserved.
            </p>
          </div>
        </div>
      `;

      try {
        await sendMail({
          to: email,
          subject: '✅ Welcome to FEDEVENT - You\'re on the Waitlist!',
          html: confirmationHtml
        });
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
    }

    return ok(res, {
      success: true,
      message: 'Thank you for joining the waitlist!',
      leadId,
      userCode
    });

  } catch (error) {
    console.error('Lead submission error:', error);
    return fail(res, 500, 'Failed to submit waitlist registration');
  }
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
  try {
    const to = req.body?.to || process.env.NOTIFY_TO;
    if (!to) return fail(res, 400, 'Missing recipient');
    if (!process.env.SMTP_HOST) return fail(res, 400, 'SMTP not configured');

    await sendMail({
      to,
      subject: 'FEDEVENT Prelaunch Email Test',
      html: `<div style="font-family:system-ui,sans-serif;padding:20px">
              <h2 style="color:#0071e3">Email Test Successful!</h2>
              <p>If you received this, SMTP is working for the prelaunch server.</p>
            </div>`
    });

    return ok(res, { message: 'Test email sent successfully' });
  } catch (e) {
    return fail(res, 500, 'Test email failed', { detail: String(e.message || e) });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  return ok(res, {
    status: 'healthy',
    server: 'prelaunch',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 FEDEVENT PRELAUNCH SERVER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Prelaunch page: http://localhost:${PORT}/prelaunch.html`);
  console.log(`🌐 Server running on port ${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('💡 Main FEDEVENT site runs separately on port 7070');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing prelaunch server...');
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, closing prelaunch server...');
  db.close();
  process.exit(0);
});

// Deployment trigger - Mon Oct 13 12:46:33 EDT 2025
