import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Global handler to catch unhandled promise rejections and log them during development
window.addEventListener('unhandledrejection', function (event) {
  console.error('Unhandled promise rejection:', event.reason);
  // keep default behavior but avoid crashing the app silently
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
