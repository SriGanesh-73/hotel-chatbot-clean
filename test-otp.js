// Simple test script to debug OTP functionality
import fetch from 'node-fetch';

const testPhone = '+1234567890'; // Replace with your test phone number

async function testSendOTP() {
  try {
    console.log('Testing OTP send...');
    const response = await fetch('http://localhost:5001/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: testPhone })
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', data);
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run the test
testSendOTP();
