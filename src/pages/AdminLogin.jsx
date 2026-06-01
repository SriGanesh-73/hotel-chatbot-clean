import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { validateEmail } from "../utils/validations";

const AdminLogin = () => {
  const { login, setAuthPersistence, resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotError, setForgotError] = useState(false);
  const navigate = useNavigate();

  // Initialize staySignedIn from previously stored preference
  React.useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const stored = window.localStorage.getItem('authPersistence');
      if (stored === 'local') setStaySignedIn(true);
      else if (stored === 'session') setStaySignedIn(false);
    } catch (e) {
      // ignore
    }
  }, []);

  const validateForm = () => {
    const errors = {};

    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      errors.email = emailValidation.message;
    }

    if (!password.trim()) {
      errors.password = "Password is required";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setValidationErrors({});

    if (!validateForm()) return;

    setLoading(true);
    try {
      // persistence should already be applied when toggled, but ensure here as a fallback
      try {
        await setAuthPersistence(staySignedIn ? "local" : "session");
      } catch (err) {
        console.warn("Persistence set failed:", err);
      }
      await login(email, password);
      navigate("/admin");
    } catch (err) {
      let errorMessage = "Invalid credentials";
      if (err.code === "auth/user-not-found") errorMessage = "No account found with this email";
      else if (err.code === "auth/wrong-password") errorMessage = "Incorrect password";
      else if (err.code === "auth/invalid-email") errorMessage = "Invalid email address";
      else if (err.code === "auth/too-many-requests") errorMessage = "Too many failed attempts. Please try again later";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReset = async () => {
    setForgotMsg("");
    setForgotError(false);
    try {
      if (!validateEmail(forgotEmail).isValid) {
        setForgotError(true);
        setForgotMsg("Please enter a valid email");
        return;
      }
      await resetPassword(forgotEmail);
      setForgotError(false);
      setForgotMsg("Password reset email sent. Check your inbox.");
    } catch (err) {
      console.error("Reset error:", err);
      setForgotError(true);
      setForgotMsg(err?.message || "Failed to send reset email.");
    }
  };

  return (
    <div className="admin-container auth-container">
      <div className="admin-card auth-card">
        <div className="auth-brand">
          <div className="brand-circle">HC</div>
        </div>

        <div className="auth-card-inner">
          <h1 className="admin-title">Sign in to Admin</h1>
          <p className="admin-subtitle">Access your hotel chatbot dashboard</p>

          <form className="admin-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (validationErrors.email) {
                    const emailValidation = validateEmail(e.target.value);
                    setValidationErrors({ ...validationErrors, email: emailValidation.isValid ? null : emailValidation.message });
                  }
                }}
                className={validationErrors.email ? "error" : ""}
                required
              />
              {validationErrors.email && <small className="error-message">{validationErrors.email}</small>}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationErrors.password) {
                    setValidationErrors({ ...validationErrors, password: e.target.value.length >= 6 ? null : "Password must be at least 6 characters" });
                  }
                }}
                className={validationErrors.password ? "error" : ""}
                required
              />
              {validationErrors.password && <small className="error-message">{validationErrors.password}</small>}
            </div>

            <div className="checkbox-row">
              <label className="checkbox-label toggle-label">
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={staySignedIn}
                  onChange={async () => {
                    const next = !staySignedIn;
                    setStaySignedIn(next);
                    try {
                      await setAuthPersistence(next ? 'local' : 'session');
                    } catch (err) {
                      console.warn('Failed to set persistence on toggle:', err);
                    }
                  }}
                />
                <span className="toggle-ui" />
                <span>Stay signed in</span>
              </label>

              <button type="button" className="forgot-link" onClick={() => { setShowForgot((s) => !s); setForgotMsg(""); }}>
                {showForgot ? "Cancel" : "Forgot password?"}
              </button>
            </div>

            {showForgot && (
              <div className="forgot-form" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label className="form-label">Email for reset</label>
                  <input type="email" placeholder="Enter your email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                </div>

                {forgotMsg && <div className={`status-msg ${forgotError ? "error" : "success"}`} style={{ marginTop: 8 }}>{forgotMsg}</div>}

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="verification-button" type="button" onClick={handleSendReset}>
                    Send reset
                  </button>
                  <button type="button" className="dismiss-link-button" onClick={() => setShowForgot(false)}>
                    Close
                  </button>
                </div>
              </div>
            )}

            {error && <div className="status-msg error">{error}</div>}

            <button type="submit" disabled={loading} className="submit-button">
              {loading ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "24px" }}>
            <p style={{ color: "#64748b", fontSize: "0.95rem" }}>
              Don't have an account? {" "}
              <Link to="/admin-signup" style={{ color: "#667eea", fontWeight: "600", textDecoration: "none" }}>
                Create one here
              </Link>
            </p>
          </div>
        </div>

        {/* Back to Chatbot link removed to keep auth card compact per request */}
      </div>
    </div>
  );
};

export default AdminLogin;
