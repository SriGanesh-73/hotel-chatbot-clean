import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import '../styles/AdminDashboard.css'; // Reusing admin styles

const EmailVerification = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verifying email...');
  const [isVerified, setIsVerified] = useState(false);
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('❌ No verification token found');
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await axios.post('http://localhost:5001/verify-email', { token });
        if (response.data.success) {
          setIsVerified(true);
          setStatus('✅ Email verified successfully!');
          
          // Redirect to admin dashboard after 3 seconds
          setTimeout(() => {
            navigate('/admin');
          }, 3000);
        } else {
          setStatus('❌ Email verification failed');
        }
      } catch (error) {
        console.error('Email verification error:', error);
        setStatus(`❌ Verification failed: ${error.response?.data?.error || error.message}`);
      }
    };

    verifyEmail();
  }, [token, navigate]);

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h1 className="admin-title">📧 Email Verification</h1>
        <div className="form-group">
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px',
            fontSize: '1.1rem',
            color: isVerified ? '#10b981' : status.includes('❌') ? '#ef4444' : '#4f46e5'
          }}>
            {status}
          </div>
          
          {isVerified && (
            <div style={{ 
              textAlign: 'center', 
              marginTop: '20px',
              color: '#64748b',
              fontSize: '0.9rem'
            }}>
              Redirecting to admin dashboard...
            </div>
          )}
          
          {!isVerified && !status.includes('Verifying') && (
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button 
                onClick={() => navigate('/admin')}
                style={{
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Back to Admin Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;
