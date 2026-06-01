import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import AdminDashboard from "./pages/AdminDashboard";
import ChatPage from "./pages/ChatPage";
import ExpiredPage from "./pages/ExpiredPage";
import AdminLogin from "./pages/AdminLogin";
import AdminSignup from "./pages/AdminSignup";
import PasswordReset from "./pages/PasswordReset";
import ResetNewPassword from "./pages/ResetNewPassword";

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin-signup" element={<AdminSignup />} />
            <Route path="/password-reset" element={<PasswordReset />} />
            <Route path="/reset-password" element={<ResetNewPassword />} />
            {/* email verification route removed per client request */}
            <Route path="/expired" element={<ExpiredPage />} />
          </Routes>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;