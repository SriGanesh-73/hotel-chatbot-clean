// Test script for the complete verification backend
import axios from 'axios';

const BASE_URL = 'http://localhost:5001';
const TEST_EMAIL = 'test@example.com';
const TEST_PHONE = '+919600021821'; // Your verified phone number

async function testCompleteFlow() {
  console.log('🧪 Testing Complete Verification Flow\n');

  try {
    // Test 1: Send OTP
    console.log('1. Testing Phone OTP...');
    const otpResponse = await axios.post(`${BASE_URL}/send-otp`, {
      phone: TEST_PHONE
    });
    console.log('✅ OTP Sent:', otpResponse.data);
    
    // Test 2: Send Email Verification
    console.log('\n2. Testing Email Verification...');
    const emailResponse = await axios.post(`${BASE_URL}/send-email-verification`, {
      email: TEST_EMAIL,
      guestName: 'Test Guest'
    });
    console.log('✅ Email Verification Sent:', emailResponse.data);
    
    const emailToken = emailResponse.data.token;
    
    // Test 3: Check Email Verification Status
    console.log('\n3. Testing Email Status Check...');
    const statusResponse = await axios.post(`${BASE_URL}/check-email-verification`, {
      token: emailToken
    });
    console.log('✅ Email Status:', statusResponse.data);
    
    // Test 4: Send Welcome Email
    console.log('\n4. Testing Welcome Email...');
    const welcomeResponse = await axios.post(`${BASE_URL}/send-chatbot-welcome`, {
      email: TEST_EMAIL,
      guestName: 'Test Guest',
      chatUrl: 'http://localhost:5173/?token=test123'
    });
    console.log('✅ Welcome Email Sent:', welcomeResponse.data);
    
    console.log('\n🎉 All tests passed! Backend is working correctly.');
    console.log('\n📧 Email verification link:', `http://localhost:5173/verify-email?token=${emailToken}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run tests
testCompleteFlow();
