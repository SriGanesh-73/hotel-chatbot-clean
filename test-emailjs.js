// Test EmailJS Node.js integration
import 'dotenv/config';
import emailjs from '@emailjs/nodejs';

const EMAILJS_CONFIG = {
  serviceId: process.env.EMAILJS_SERVICE_ID,
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  verificationTemplateId: process.env.EMAILJS_VERIFICATION_TEMPLATE_ID,
  welcomeTemplateId: process.env.EMAILJS_WELCOME_TEMPLATE_ID
};

async function testEmailJS() {
  try {
    console.log('🧪 Testing EmailJS Node.js integration...');
    
    // Test verification email
    const emailParams = {
      to_email: 'test@example.com',
      guest_name: 'Test Guest',
      verification_link: 'http://localhost:5173/verify-email?token=test123'
    };

    const result = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.verificationTemplateId,
      emailParams,
      EMAILJS_CONFIG.publicKey
    );
    
    console.log('✅ EmailJS Node.js test successful!');
    console.log('Result:', result);
    
  } catch (error) {
    console.error('❌ EmailJS Node.js test failed:', error);
  }
}

testEmailJS();
