// Validation utility functions with regex patterns

// Guest name validation - only alphabets and spaces
export const validateGuestName = (name) => {
  const nameRegex = /^[a-zA-Z\s]+$/;
  return {
    isValid: nameRegex.test(name.trim()),
    message: "Guest name should only contain letters and spaces"
  };
};

// Room number validation - alphanumeric with optional special characters
export const validateRoomNumber = (roomNo) => {
  const roomRegex = /^[a-zA-Z0-9\-\/]+$/;
  return {
    isValid: roomRegex.test(roomNo.trim()),
    message: "Room number should only contain letters, numbers, hyphens, and forward slashes"
  };
};

// Email validation
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return {
    isValid: emailRegex.test(email.trim()),
    message: "Please enter a valid email address"
  };
};

// Phone number validation - supports various formats
export const validatePhone = (phone) => {
  // Remove all non-digit characters for validation
  const digits = phone.replace(/\D/g, '');
  
  // Check if it's a valid length (10-15 digits)
  const isValidLength = digits.length >= 10 && digits.length <= 15;
  
  // Check if it contains only valid characters (digits, +, -, spaces, parentheses)
  const phoneRegex = /^[\+]?[\d\s\-\(\)]+$/;
  const hasValidCharacters = phoneRegex.test(phone);
  
  return {
    isValid: isValidLength && hasValidCharacters,
    message: "Please enter a valid phone number (10-15 digits)"
  };
};

// Combined validation function
export const validateGuestForm = (formData) => {
  const errors = {};
  
  // Validate guest name
  const nameValidation = validateGuestName(formData.guestName);
  if (!nameValidation.isValid) {
    errors.guestName = nameValidation.message;
  }
  
  // Validate room number
  const roomValidation = validateRoomNumber(formData.roomNo);
  if (!roomValidation.isValid) {
    errors.roomNo = roomValidation.message;
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
  
  // Validate expiry date
  if (!formData.expiry) {
    errors.expiry = "Please select an expiry date and time";
  } else {
    const expiryDate = new Date(formData.expiry);
    const now = new Date();
    if (expiryDate <= now) {
      errors.expiry = "Expiry date must be in the future";
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};
