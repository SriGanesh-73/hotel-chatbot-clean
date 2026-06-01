import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { validateEmail, validateGuestName, validatePhone } from "../utils/validations";
import "../styles/AdminDashboard.css";

const AdminSignup = () => {
  const { signup } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    hotelName: "",
    phone: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const navigate = useNavigate();

  const validateForm = () => {
    const errors = {};
    
    // Validate first name
    const firstNameValidation = validateGuestName(formData.firstName);
    if (!firstNameValidation.isValid) {
      errors.firstName = firstNameValidation.message;
    }
    
    // Validate last name
    const lastNameValidation = validateGuestName(formData.lastName);
    if (!lastNameValidation.isValid) {
      errors.lastName = lastNameValidation.message;
    }
    
    // Validate hotel name
    if (!formData.hotelName.trim()) {
      errors.hotelName = "Hotel name is required";
    }
    
    // Validate email
    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.isValid) {
      errors.email = emailValidation.message;
    }
    
    // Validate phone
    const phoneValidation = validatePhone(formData.phone);
    if (!phoneValidation.isValid) {
      errors.phone = phoneValidation.message;
    }
    
    // Validate password
    if (!formData.password.trim()) {
      errors.password = "Password is required";
    } else if (formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }
    
    // Validate confirm password
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setValidationErrors({});
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);

    try {
      await signup(formData.email, formData.password);
      // Note: In a real app, you'd also save the additional user data to Firestore
      navigate("/admin");
    } catch (err) {
      let errorMessage = "Failed to create account";
      
      // Handle specific Firebase errors
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "Email is already registered";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "Password is too weak";
      }
      
      setError(errorMessage);
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
          <h1 className="admin-title">Create Admin Account</h1>
          <p className="admin-subtitle">Set up your hotel chatbot admin access</p>

          <form
            className="admin-form"
            onSubmit={handleSubmit}
          >
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input
              type="text"
              name="firstName"
              placeholder="Enter your first name"
              value={formData.firstName}
              onChange={handleChange}
              className={validationErrors.firstName ? 'error' : ''}
              required
            />
            {validationErrors.firstName && (
              <small className="error-message">{validationErrors.firstName}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input
              type="text"
              name="lastName"
              placeholder="Enter your last name"
              value={formData.lastName}
              onChange={handleChange}
              className={validationErrors.lastName ? 'error' : ''}
              required
            />
            {validationErrors.lastName && (
              <small className="error-message">{validationErrors.lastName}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Hotel Name</label>
            <input
              type="text"
              name="hotelName"
              placeholder="Enter your hotel name"
              value={formData.hotelName}
              onChange={handleChange}
              className={validationErrors.hotelName ? 'error' : ''}
              required
            />
            {validationErrors.hotelName && (
              <small className="error-message">{validationErrors.hotelName}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              className={validationErrors.email ? 'error' : ''}
              required
            />
            {validationErrors.email && (
              <small className="error-message">{validationErrors.email}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              type="tel"
              name="phone"
              placeholder="Enter your phone number"
              value={formData.phone}
              onChange={handleChange}
              className={validationErrors.phone ? 'error' : ''}
              required
            />
            {validationErrors.phone && (
              <small className="error-message">{validationErrors.phone}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              name="password"
              placeholder="Create a password (min 6 characters)"
              value={formData.password}
              onChange={handleChange}
              className={validationErrors.password ? 'error' : ''}
              required
            />
            {validationErrors.password && (
              <small className="error-message">{validationErrors.password}</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={validationErrors.confirmPassword ? 'error' : ''}
              required
            />
            {validationErrors.confirmPassword && (
              <small className="error-message">{validationErrors.confirmPassword}</small>
            )}
          </div>

          {error && (
            <div className="status-msg error">
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} className="submit-button">
            {loading ? "Creating Account..." : "Create Account"}
          </button>

          {/* Social sign-up removed per request */}
          </form>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
              Already have an account?{" "}
              <Link to="/admin-login" style={{ color: '#667eea', fontWeight: '600', textDecoration: 'none' }}>
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        {/* Back to Chatbot link removed to keep auth card compact per request */}
      </div>
    </div>
  );
};

export default AdminSignup;
