import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import "../styles/AdminDashboard.css";

const PasswordReset = () => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    try {
      await resetPassword(email);
      setMessage("Password reset email sent. Check your inbox.");
    } catch (err) {
      setError(err?.message || "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-container auth-container">
      <div className="admin-card auth-card">
        <div className="auth-brand">
          <div className="brand-circle">HC</div>
        </div>

        <div className="auth-card-inner">
          <h1 className="admin-title">Reset Password</h1>
          <p className="admin-subtitle">Enter your account email and we'll send a reset link.</p>

          <form className="admin-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {message && <div className="status-msg success">{message}</div>}
            {error && <div className="status-msg error">{error}</div>}

            <button className="submit-button" type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send reset email"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: "18px" }}>
            <Link to="/admin-login" style={{ color: '#667eea', fontWeight: '600', textDecoration: 'none' }}>
              Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordReset;
