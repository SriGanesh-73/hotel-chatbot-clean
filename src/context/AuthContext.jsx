// src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../services/firebaseconfig";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";

// Create context
const AuthContext = createContext();

// Custom hook for using AuthContext
export const useAuth = () => {
  return useContext(AuthContext);
};

// AuthProvider component
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Track authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
      
      // Store session in sessionStorage
      if (user) {
        sessionStorage.setItem('adminSession', JSON.stringify({
          uid: user.uid,
          email: user.email,
          timestamp: Date.now()
        }));
      } else {
        sessionStorage.removeItem('adminSession');
      }
    });
    return unsubscribe;
  }, []);

  // Login with email & password
  const login = async (email, password) => {
    try {
      // default: use session persistence (sessionStorage style)
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Login error:", error.message);
      throw error;
    }
  };

  // Set persistence: 'local' or 'session'
  const setAuthPersistence = async (mode = 'session') => {
    try {
      if (mode === 'local') {
        await setPersistence(auth, browserLocalPersistence);
      } else {
        await setPersistence(auth, browserSessionPersistence);
      }
      // remember the chosen persistence so we can apply it on app load
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('authPersistence', mode);
        }
      } catch (e) {
        // ignore storage errors
      }
    } catch (error) {
      console.error('Set persistence error:', error);
      throw error;
    }
  };

  // On mount, apply previously selected persistence mode (if any) so it's set before any sign-in
  useEffect(() => {
    (async () => {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return;
        const stored = window.localStorage.getItem('authPersistence');
        if (!stored) return;
        if (stored === 'local') {
          await setPersistence(auth, browserLocalPersistence);
        } else {
          await setPersistence(auth, browserSessionPersistence);
        }
      } catch (err) {
        console.warn('Failed to apply stored auth persistence:', err);
      }
    })();
  }, []);

  // Sign up with email & password
  const signup = async (email, password) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Signup error:", error.message);
      throw error;
    }
  };

  // Logout
  const logout = async () => {
    try {
      await signOut(auth);
      sessionStorage.removeItem('adminSession');
    } catch (error) {
      console.error("Logout error:", error.message);
      throw error;
    }
  };

  // Reset password
  const resetPassword = async (email) => {
    try {
      // Prefer sending a link that opens inside the app on /reset-password
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const actionCodeSettings = {
        url: `${origin}/reset-password`,
        handleCodeInApp: true,
      };
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  };

  // Check session validity
  const checkSession = () => {
    try {
      const sessionData = sessionStorage.getItem('adminSession');
      if (!sessionData) return false;
      
      const session = JSON.parse(sessionData);
      const now = Date.now();
      const sessionAge = now - session.timestamp;
      
      // Session expires after 24 hours (86400000 ms)
      if (sessionAge > 86400000) {
        sessionStorage.removeItem('adminSession');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error("Session check error:", error);
      sessionStorage.removeItem('adminSession');
      return false;
    }
  };

  // Validate session on app load
  useEffect(() => {
    if (!checkSession() && currentUser) {
      logout();
    }
  }, []);

  const value = {
    currentUser,
    login,
    signup,
    logout,
    setAuthPersistence,
    resetPassword,
    checkSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};