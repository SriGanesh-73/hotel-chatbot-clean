import React from 'react';
import { FiCopy } from 'react-icons/fi';
import { useToast } from '../context/ToastContext';

const ChatLinkContainer = ({ chatUrl, title = '🤖 Chatbot Link Generated', onCopy, onDismiss }) => {
  const { addToast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chatUrl);
      addToast({ message: 'Chatbot link copied to clipboard! 📋', type: 'success', variant: 'floating', duration: 3000 });
      if (typeof onCopy === 'function') onCopy(chatUrl);
    } catch (err) {
      console.error('Failed to copy link:', err);
      addToast({ message: 'Failed to copy link. Please copy manually.', type: 'error', variant: 'static' });
      if (typeof onCopy === 'function') onCopy(chatUrl);
    }
  };

  return (
    <div className="chatbot-link-container">
      <h3 className="link-title">{title}</h3>
      <div className="link-display">
        <input
          type="text"
          value={chatUrl}
          readOnly
          className="link-input"
          onFocus={(e) => e.target.select()}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleCopy} className="copy-button" aria-label="Copy chatbot link">
            <FiCopy size={16} style={{ marginRight: 8 }} /> Copy Link
          </button>
          {onDismiss && (
            <button className="dismiss-link-button" onClick={() => onDismiss()} aria-label="Dismiss chatbot link">
              Dismiss
            </button>
          )}
        </div>
      </div>
      <p className="link-description">Share this link with your guest to access the chatbot</p>
    </div>
  );
};

export default ChatLinkContainer;
