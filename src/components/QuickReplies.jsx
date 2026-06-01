import React from "react";
import "../styles/QuickReplies.css";

const QuickReplies = ({ options, onSelect }) => {
  // Format options to be more readable
  const formattedOptions = options.map(option => 
    option.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ')
  );

  return (
    <div className="quick-replies">
      <p className="quick-replies-title">Quick options:</p>
      <div className="quick-replies-grid">
        {formattedOptions.map((option, index) => (
          <button
            key={index}
            className="quick-reply-button"
            onClick={() => onSelect(options[index])}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickReplies;