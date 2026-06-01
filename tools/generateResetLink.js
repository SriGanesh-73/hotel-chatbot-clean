/*
  Small helper to generate a Firebase password reset link using the Admin SDK.
  Usage: node tools/generateResetLink.js <email>

  Note: This script uses the service account JSON that's already in the repo
  (hotel-chatbot-1ae67-firebase-adminsdk-fbsvc-a21ec05157.json). Running it
  locally will produce a password reset link you can open in the browser to
  confirm the reset flow without relying on email delivery.
*/

import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const svcPath = path.join(__dirname, '..', 'hotel-chatbot-1ae67-firebase-adminsdk-fbsvc-a21ec05157.json');

try {
  const raw = await readFile(svcPath, 'utf8');
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (err) {
  console.error('Failed to initialize admin SDK. Ensure the service account JSON exists and path is correct.');
  console.error(err.message);
  process.exit(1);
}

const auth = admin.auth();

async function generate(email, redirectUrl) {
  if (!email) {
    console.error('Usage: node tools/generateResetLink.js <email> [redirectUrl]');
    process.exit(1);
  }
  try {
    const actionCodeSettings = redirectUrl
      ? { url: redirectUrl, handleCodeInApp: true }
      : { handleCodeInApp: true };

    const link = await auth.generatePasswordResetLink(email, actionCodeSettings);
    console.log('Password reset link:');
    console.log(link);
  } catch (err) {
    console.error('Failed to generate link:', err.message);
  }
}

// Usage: node tools/generateResetLink.js user@example.com http://localhost:5173/reset-password
generate(process.argv[2], process.argv[3]);
