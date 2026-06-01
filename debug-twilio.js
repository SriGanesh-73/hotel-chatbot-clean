// Direct Twilio API test - bypasses our server
import 'dotenv/config';
import fetch from 'node-fetch';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

// Create Basic Auth header for Twilio API
const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

async function testTwilioDirectly() {
  console.log('=== DIRECT TWILIO API TEST ===');
  console.log('Account SID:', accountSid);
  console.log('Verify Service SID:', verifyServiceSid);
  console.log('Auth header (first 20 chars):', auth.substring(0, 20) + '...');
  
  const phone = '+919600021821'; // Your actual phone number in international format
  
  try {
    console.log('\n--- Testing Twilio Verify API ---');
    console.log('Sending OTP to:', phone);
    
    const response = await fetch(`https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`, {
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

    console.log('Response Status:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    
    const data = await response.text();
    console.log('Response Body:', data);
    
    if (!response.ok) {
      console.error('❌ Twilio API Error!');
      try {
        const errorData = JSON.parse(data);
        console.error('Error Code:', errorData.code);
        console.error('Error Message:', errorData.message);
        console.error('More Info:', errorData.more_info);
      } catch (e) {
        console.error('Could not parse error response');
      }
    } else {
      console.log('✅ Twilio API Success!');
      try {
        const successData = JSON.parse(data);
        console.log('Verification SID:', successData.sid);
        console.log('Status:', successData.status);
      } catch (e) {
        console.error('Could not parse success response');
      }
    }
    
  } catch (error) {
    console.error('❌ Network/Other Error:', error.message);
  }
}

// Run the test
testTwilioDirectly();
