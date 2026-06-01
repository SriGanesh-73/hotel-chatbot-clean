# Twilio Verify REST API Setup Guide

## 🚀 **Quick Setup Steps**

### 1. **Create Twilio Verify Service**
1. Go to [Twilio Console](https://console.twilio.com/us1/develop/verify/services)
2. Click **"Create new Service"**
3. Give it a name: `Hotel Chatbot Verification`
4. Click **"Create"**
5. Copy the **Service SID** (starts with `VA...`)

### 2. **Update Your Code**
The code now uses **direct REST API calls** to Twilio Verify endpoints:

```javascript
// Your Service SID is already set:
const verifyServiceSid = 'YOUR_VERIFY_SERVICE_SID';

// Direct REST API endpoints used:
// POST https://verify.twilio.com/v2/Services/{ServiceSID}/Verifications
// POST https://verify.twilio.com/v2/Services/{ServiceSID}/VerificationCheck
```

### 3. **Environment Variables (Recommended)**
For better security, use environment variables:

Create a `.env` file in your project root:
```env

```

Then update `otpVerification.js`:
```javascript
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
```

### 4. **Test Your Setup**
1. Start your backend server: `node src/services/otpVerification.js`
2. Test with a real phone number
3. Check console logs for detailed error messages

### 5. **No Twilio SDK Required**
The code now uses direct REST API calls with `fetch()`, so you don't need the Twilio SDK dependency.

## 🔧 **Troubleshooting**

### Common Issues:

1. **"Service not found" error**
   - Make sure you've created the Verify Service in Twilio Console
   - Double-check the Service SID is correct

2. **"Phone number not verified" error**
   - For trial accounts, you can only send to verified phone numbers
   - Add your phone number in [Verified Caller IDs](https://console.twilio.com/us1/phone-numbers/manage/verified)

3. **Rate limiting errors**
   - Twilio has built-in rate limiting for trial accounts
   - Consider upgrading to a paid account for production

### Debug Mode:
Add this to see detailed logs:
```javascript
console.log('Using Verify Service:', verifyServiceSid);
console.log('Account SID:', accountSid);
```

## 📱 **Testing**

### Test with cURL:
```bash
# Send OTP
curl -X POST "http://localhost:5001/send-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890"}'

# Verify OTP
curl -X POST "http://localhost:5001/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890", "otp": "123456"}'
```

## 🎯 **Benefits of Twilio Verify API**

✅ **Better delivery rates** - Optimized for OTP delivery
✅ **Automatic retries** - Handles temporary failures
✅ **Fraud protection** - Built-in security features
✅ **International support** - Works globally
✅ **Rate limiting** - Prevents abuse
✅ **No phone number needed** - Twilio handles the sender ID

## 📞 **Support**

If you still have issues:
1. Check [Twilio Verify Documentation](https://www.twilio.com/docs/verify/api)
2. Verify your account status in Twilio Console
3. Check the Twilio logs for detailed error messages
