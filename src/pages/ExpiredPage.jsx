// src/pages/ExpiredPage.jsx
import React from "react";
import "../styles/ExpiredPage.css";

const ExpiredPage = () => {
  return (
    <div className="expired-container">
      <div className="expired-card">
        <div className="expired-icon">⏰</div>
        <h1>Session Expired</h1>
        <p>Your chatbot access has expired. Please contact our hotel reception for assistance or to renew your access.</p>
        <p className="subtitle">We're here to help you 24/7</p>
        
        <div className="contact-info">
          <h3>📞 Contact Information</h3>
          <p><strong>Front Desk:</strong> Extension 1000</p>
          <p><strong>Reception:</strong> +1 (555) 123-4567</p>
          <p><strong>Email:</strong> reception@hotel.com</p>
          <p><strong>Available:</strong> 24/7</p>
        </div>
        
        <button className="action-button" onClick={() => window.location.href = '/'}>
          Try Again
        </button>
        
        <div className="help-section">
          <h3>Need Help?</h3>
          <p>Our friendly staff is always available to assist you with:</p>
          <p>• Room service and amenities</p>
          <p>• Restaurant reservations</p>
          <p>• Local recommendations</p>
          <p>• Technical support</p>
        </div>
      </div>
    </div>
  );
};

export default ExpiredPage;
