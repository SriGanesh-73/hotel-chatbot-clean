import React from "react";
import { FiHome, FiPhone, FiMoreHorizontal } from 'react-icons/fi';
import "../styles/Header.css";

const Header = () => {
  return (
    <div className="chatbot-header">
      <div className="header-avatar" aria-hidden>
        <FiHome size={20} />
      </div>
      <div className="header-info">
        <h2>Hotel Assistant</h2>
        <p>Online • Responds quickly</p>
      </div>
      <div className="header-actions">
        <button className="header-button" aria-label="Call hotel">
          <FiPhone size={16} />
        </button>
        <button className="header-button" aria-label="More options">
          <FiMoreHorizontal size={16} />
        </button>
      </div>
    </div>
  );
};

export default Header;