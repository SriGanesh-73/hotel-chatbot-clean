// Hotel Chatbot Logic - Rule-based responses
export const chatbotRules = {
  "room service": "Our room service is available 24/7. You can order from our extensive menu by calling extension 1234. Delivery typically takes 15-30 minutes. The menu includes continental breakfast, lunch, dinner, and late-night snacks.",
  
  "wifi details": "Free WiFi is available throughout the hotel. Network: 'Hotel_Guest_WiFi', Password: 'Welcome2024'. The WiFi supports high-speed internet for all your devices. If you need assistance connecting, please contact our front desk.",
  
  "check-out time": "Standard check-out time is 11:00 AM. Late check-out until 2:00 PM may be available for an additional fee of $50, subject to availability. Please contact the front desk to arrange late check-out.",
  
  "restaurant info": "Our on-site restaurant 'The Garden Terrace' is open from 6:00 AM to 10:00 PM. We serve breakfast (6-11 AM), lunch (12-3 PM), and dinner (6-10 PM). Reservations are recommended and can be made by calling extension 1235.",
  
  "spa services": "Our luxury spa offers a full range of treatments including massages, facials, and wellness therapies. Open daily 8:00 AM to 10:00 PM. Bookings can be made by calling extension 1236 or visiting the spa reception on the 3rd floor.",
  
  "pool hours": "Our outdoor pool is open from 6:00 AM to 11:00 PM daily. The heated indoor pool and jacuzzi are available 24/7. Pool towels and refreshments are available at the poolside bar.",
  
  "fitness center": "Our fitness center is open 24/7 and features state-of-the-art equipment, yoga studio, and personal training services. Access is complimentary for all guests. Personal training sessions can be booked at the front desk.",
  
  "concierge services": "Our concierge team is available 24/7 to assist with restaurant reservations, tour bookings, transportation, and local recommendations. Contact them at extension 1237 or visit the concierge desk in the lobby.",
  
  "parking": "Valet parking is available for $35/night. Self-parking in our secure garage is $25/night. Electric vehicle charging stations are available on levels 2 and 3. Contact valet services at extension 1238.",
  
  "laundry service": "Same-day laundry service is available with pickup before 9:00 AM and delivery by 6:00 PM. Dry cleaning service is available with 24-hour turnaround. Contact housekeeping at extension 1239 to arrange pickup.",
  
  "business center": "Our business center is open 24/7 and features computers, printers, fax services, and private meeting rooms. High-speed internet and video conferencing facilities are available. Contact extension 1240 for assistance.",
  
  "pet policy": "We are pet-friendly! Up to 2 pets per room are welcome for an additional fee of $50/night. Pet amenities include beds, bowls, and treats. Please keep pets leashed in public areas. Contact front desk for pet services.",
  
  "accessibility": "Our hotel is fully accessible with ADA-compliant rooms, elevators, and facilities. Wheelchair-accessible rooms are available with roll-in showers and lowered amenities. Please inform us of any special needs when booking.",
  
  "emergency": "In case of emergency, please call extension 911 from your room phone or 911 from any other phone. Our security team is available 24/7 at extension 1241. Emergency exits and fire safety information are posted in each room.",
  
  "luggage storage": "Complimentary luggage storage is available at the front desk for early arrivals and late departures. Secure storage for valuable items is available at the concierge desk. Please keep your claim ticket for retrieval."
};

// Function to get response for a given question
export const getChatbotResponse = (question) => {
  const normalizedQuestion = question.toLowerCase().trim();
  return chatbotRules[normalizedQuestion] || "I'm sorry, I don't have information about that topic. Please contact our front desk at extension 1000 for assistance with other inquiries.";
};

// Function to get all available topics
export const getAvailableTopics = () => {
  return Object.keys(chatbotRules).map(topic => 
    topic.charAt(0).toUpperCase() + topic.slice(1)
  );
};
