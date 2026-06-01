// src/pages/ChatPage.jsx
import React, { useEffect, useState } from "react";
import ChatbotUI from "../components/ChatbotUI";
import { checkGuestValidity } from "../services/guestService";
import { useNavigate } from "react-router-dom";
import { chatbotRules } from "../services/chatbotLogic";
import "../styles/ChatPage.css";

const ChatPage = () => {
  const navigate = useNavigate();
  const [isValidating, setIsValidating] = useState(true);

  const validateGuest = async () => {
    try {
      const { isValid, reason } = await checkGuestValidity();
      if (!isValid) {
        navigate("/expired");
        console.log("Guest validation failed:", reason);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Validation error:", error);
      navigate("/expired");
      return false;
    }
  };

  useEffect(() => {
    const initialValidation = async () => {
      setIsValidating(true);
      await validateGuest();
      setIsValidating(false);
    };
    
    initialValidation();
    
    // Set up real-time validation every 30 seconds
    const validationInterval = setInterval(async () => {
      const isValid = await validateGuest();
      if (!isValid) {
        clearInterval(validationInterval);
      }
    }, 30000);
    
    return () => clearInterval(validationInterval);
  }, [navigate]);

  if (isValidating) {
    return (
      <div className="chatpage-container">
        <div style={{ 
          textAlign: 'center', 
          padding: '2rem',
          color: 'white',
          fontSize: '1.2rem'
        }}>
          Validating access...
        </div>
      </div>
    );
  }

  return (
    <div className="chatpage-container">
      <ChatbotUI rules={chatbotRules} />
    </div>
  );
};

export default ChatPage;