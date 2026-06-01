// src/services/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ✅ Validate that environment variables are set
const missingVars = Object.entries(firebaseConfig)
  .filter(([key, value]) => !value)
  .map(([key]) => key.replace(/([A-Z])/g, ' $1').toUpperCase());

if (missingVars.length > 0) {
  console.error('❌ Missing Firebase environment variables:', missingVars);
  console.log('💡 Please check your .env file and ensure all VITE_FIREBASE_* variables are set');
}

console.log('Firebase Config:', {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? '✅ Set' : '❌ Missing',
  projectId: firebaseConfig.projectId || '❌ Missing'
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);