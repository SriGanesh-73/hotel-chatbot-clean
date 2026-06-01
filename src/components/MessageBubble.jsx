import React from "react";
import "../styles/MessageBubble.css";

const TypingIndicator = ({ sender, isLoading = false }) => (
  <div className={`message ${sender === 'guest' ? 'guest-message' : 'bot-message'}`}>
    <div className="message-content">
      <div className={`typing-dots ${isLoading ? 'static' : ''}`} aria-hidden>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  </div>
);

const MessageBubble = ({ text, sender, timestamp, isTyping, isLoading, onClose, msgType }) => {
  if (isTyping || isLoading) {
    return <TypingIndicator sender={sender} isLoading={!!isLoading && !isTyping} />;
  }

  return (
    <div className={`message ${sender === "guest" ? "guest-message" : "bot-message"}`}>
      <div className="message-content">
        {/* optional badge for message type (success/info/warning/error) */}
        {msgType ? <span className={`msg-badge ${msgType}`} aria-hidden>{msgType}</span> : null}

        <p>{text}</p>

        <span className="timestamp">{timestamp}</span>

        {/* optional close button; render only when onClose provided */}
        {onClose ? (
          <button type="button" className="close-btn" onClick={onClose} aria-label="Dismiss message">×</button>
        ) : null}
      </div>
    </div>
  );
};

export default MessageBubble;