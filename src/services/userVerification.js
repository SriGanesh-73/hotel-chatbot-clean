import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import emailjs from '@emailjs/nodejs';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

// Create Basic Auth header for Twilio API
const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

// Twilio Verify API endpoints
const VERIFY_BASE_URL = 'https://verify.twilio.com/v2';

// Email verification storage (in production, use Redis or database)
const emailVerificationTokens = new Map();

// EmailJS configuration
const EMAILJS_CONFIG = {
  serviceId: process.env.EMAILJS_SERVICE_ID,
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY,
  verificationTemplateId: process.env.EMAILJS_VERIFICATION_TEMPLATE_ID,
  welcomeTemplateId: process.env.EMAILJS_WELCOME_TEMPLATE_ID
};
// Helper function to generate verification token
const generateVerificationToken = () => {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
};

// Send OTP using Twilio Verify REST API
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  try {
    console.log('Sending OTP to:', phone);
    console.log('Using Verify Service:', verifyServiceSid);
    console.log('Auth header:', `Basic ${auth.substring(0, 20)}...`);

    // Direct REST API call to Twilio Verify
    const response = await fetch(`${VERIFY_BASE_URL}/Services/${verifyServiceSid}/Verifications`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'To': phone,
        'Channel': 'sms'
      })
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const data = await response.json();
    console.log('Response data:', data);
    
    if (!response.ok) {
      console.error('Twilio API Error:', data);
      throw new Error(data.message || `HTTP ${response.status}: ${data.code || 'Unknown error'}`);
    }

    console.log('Verification Response:', data);
    res.json({ 
      success: true, 
      sid: data.sid,
      status: data.status,
      to: data.to,
      channel: data.channel
    });
  } catch (err) {
    console.error('Twilio Verify Error:', err);
    res.status(500).json({ 
      error: 'Failed to send OTP', 
      details: err.message,
      stack: err.stack
    });
  }
});

// Send chatbot link via SMS (separate endpoint)
app.post('/send-chatbot-link-sms', async (req, res) => {
  const { phone, guestName, chatUrl } = req.body;
  
  if (!phone || !chatUrl) {
    return res.status(400).json({ error: 'Phone and chat URL required' });
  }

  try {
    console.log('Sending chatbot link via SMS to:', phone);
    
    // Send SMS using Twilio API directly (not Verify service)
    const message = `Hello ${guestName || 'Guest'}! Your hotel chatbot is ready. Access it here: ${chatUrl}`;
    
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'To': phone,
        'From': '+919498451105', // Replace with your Twilio phone number
        'Body': message
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Twilio SMS Error:', data);
      throw new Error(data.message || `HTTP ${response.status}: ${data.code || 'Unknown error'}`);
    }

    console.log('Chatbot link SMS sent successfully to:', phone);
    console.log('Twilio SMS result:', data);
    
    res.json({ 
      success: true, 
      message: 'Chatbot link sent successfully via SMS',
      sid: data.sid,
      to: data.to,
      status: data.status
    });
    
  } catch (error) {
    console.error('Send chatbot link SMS error:', error);
    res.status(500).json({ 
      error: 'Failed to send chatbot link via SMS',
      details: error.message 
    });
  }
});

// Verify OTP using Twilio Verify REST API
app.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  
  if (!phone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP required' });
  }

  try {
    console.log('Verifying OTP for:', phone, 'with code:', otp);

    // Direct REST API call to Twilio Verify Check
    const response = await fetch(`${VERIFY_BASE_URL}/Services/${verifyServiceSid}/VerificationCheck`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'To': phone,
        'Code': otp
      })
    });

    console.log('Verify Check Response status:', response.status);

    const data = await response.json();
    console.log('Verify Check Response data:', data);
    
    if (!response.ok) {
      console.error('Twilio Verify Check API Error:', data);
      throw new Error(data.message || `HTTP ${response.status}: ${data.code || 'Unknown error'}`);
    }
    
    if (data.status === 'approved') {
      res.json({ 
        success: true, 
        status: data.status,
        sid: data.sid,
        to: data.to,
        valid: data.valid
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: 'Invalid or expired OTP',
        status: data.status,
        valid: data.valid
      });
    }
  } catch (err) {
    console.error('Twilio Verify Check Error:', err);
    res.status(500).json({ 
      error: 'Failed to verify OTP', 
      details: err.message,
      stack: err.stack
    });
  }
});

// Send email verification
app.post('/send-email-verification', async (req, res) => {
  const { email, guestName } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    console.log('Sending email verification to:', email);
    
    // Generate verification token
    const token = generateVerificationToken();
    const verificationLink = `http://localhost:5173/verify-email?token=${token}`;
    
    // Store token with expiry (5 minutes)
    emailVerificationTokens.set(token, {
      email,
      guestName: guestName || 'Guest',
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      verified: false
    });

    // Send email using EmailJS
    const emailParams = {
      to_email: email,
      guest_name: guestName || 'Guest',
      verification_link: verificationLink
    };

    const result = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.verificationTemplateId,
      emailParams,
      {
        publicKey: EMAILJS_CONFIG.publicKey,
        privateKey: EMAILJS_CONFIG.privateKey
      }
    );
    
    console.log('Email verification sent successfully to:', email);
    console.log('EmailJS result:', result);
    
    res.json({ 
      success: true, 
      message: 'Verification email sent',
      token: token // For testing purposes
    });
    
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      error: 'Failed to send verification email',
      details: error.message 
    });
  }
});

// Verify email token
app.post('/verify-email', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    console.log('Verifying email token:', token);
    
    const tokenData = emailVerificationTokens.get(token);
    
    if (!tokenData) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or expired token' 
      });
    }

    // Check if token is expired
    if (Date.now() > tokenData.expires) {
      emailVerificationTokens.delete(token);
      return res.status(400).json({ 
        success: false,
        error: 'Token has expired' 
      });
    }

    // Mark as verified
    tokenData.verified = true;
    emailVerificationTokens.set(token, tokenData);
    
    console.log('Email verified successfully for:', tokenData.email);
    res.json({ 
      success: true, 
      message: 'Email verified successfully',
      email: tokenData.email,
      guestName: tokenData.guestName
    });
    
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      error: 'Failed to verify email',
      details: error.message 
    });
  }
});

// Check email verification status
app.post('/check-email-verification', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    const tokenData = emailVerificationTokens.get(token);
    
    if (!tokenData) {
      return res.json({ 
        verified: false,
        error: 'Invalid token' 
      });
    }

    if (Date.now() > tokenData.expires) {
      emailVerificationTokens.delete(token);
      return res.json({ 
        verified: false,
        error: 'Token expired' 
      });
    }

    res.json({ 
      verified: tokenData.verified,
      email: tokenData.email,
      guestName: tokenData.guestName
    });
    
  } catch (error) {
    console.error('Check email verification error:', error);
    res.status(500).json({ 
      error: 'Failed to check verification status',
      details: error.message 
    });
  }
});

// Send chatbot welcome email with chat link
app.post('/send-chatbot-welcome', async (req, res) => {
  const { email, guestName, chatUrl } = req.body;
  
  if (!email || !chatUrl) {
    return res.status(400).json({ error: 'Email and chat URL required' });
  }

  try {
    console.log('Sending chatbot welcome email to:', email);
    
    // Send welcome email using EmailJS
    const emailParams = {
      to_email: email,
      guest_name: guestName || 'Guest',
      chat_url: chatUrl,
      year: new Date().getFullYear()
    };

    const result = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.welcomeTemplateId,
      emailParams,
      {
        publicKey: EMAILJS_CONFIG.publicKey,
        privateKey: EMAILJS_CONFIG.privateKey
      }
    );    
    
    console.log('Chatbot welcome email sent successfully to:', email);
    console.log('EmailJS result:', result);
    
    res.json({ 
      success: true, 
      message: 'Welcome email sent successfully'
    });
    
  } catch (error) {
    console.error('Welcome email error:', error);
    res.status(500).json({ 
      error: 'Failed to send welcome email',
      details: error.message 
    });
  }
});

// Clean up expired tokens (run every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of emailVerificationTokens.entries()) {
    if (now > data.expires) {
      emailVerificationTokens.delete(token);
      console.log('Cleaned up expired token:', token);
    }
  }
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`User Verification backend running on port ${PORT}`));