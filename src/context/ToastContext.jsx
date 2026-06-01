import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import '../styles/Toasts.css';

const ToastContext = createContext(null);

let idCounter = 1;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ message, type = 'info', variant = 'static', duration = 0 }) => {
    const id = idCounter++;
    const toast = { id, message, type, variant, duration };
    setToasts((s) => [...s, toast]);
    // auto-remove for floating toasts or when duration > 0
    if (variant === 'floating' && duration !== 0) {
      setTimeout(() => {
        setToasts((s) => s.filter(t => t.id !== id));
      }, duration || 3200);
    } else if (variant === 'floating' && duration === 0) {
      // default floating timeout
      setTimeout(() => setToasts((s) => s.filter(t => t.id !== id)), 3200);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((s) => s.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, toasts }}>
      {children}
      <div className="toasts-root" aria-live="polite" aria-atomic="true">
        {/* floating toasts stack */}
        <div className="toasts-floating">
          {toasts.filter(t => t.variant === 'floating').map(t => (
            <div key={t.id} className={`toast toast-floating ${t.type}`}>
              <div className="toast-dot" aria-hidden />
              <div className="toast-body">{t.message}</div>
            </div>
          ))}
        </div>

        {/* static toasts stack */}
        <div className="toasts-static">
          {toasts.filter(t => t.variant === 'static').map(t => (
            <div key={t.id} className={`toast toast-static ${t.type}`}>
              <div className="toast-dot" aria-hidden />
              <button className="toast-close" onClick={() => removeToast(t.id)} aria-label="Close">×</button>
              <div className="toast-body">{t.message}</div>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export default ToastContext;
