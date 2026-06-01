import React, { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { auth } from '../services/firebaseconfig'
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth'
import '../styles/AdminDashboard.css'

const ResetNewPassword = () => {
  const [searchParams] = useSearchParams()
  const oobCode = searchParams.get('oobCode')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState('idle') // idle|verifying|ready|submitting|success|error
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!oobCode) return setStatus('error')
    setStatus('verifying')
    verifyPasswordResetCode(auth, oobCode)
      .then((emailFromCode) => {
        setEmail(emailFromCode)
        setStatus('ready')
      })
      .catch((err) => {
        console.error('verify error', err)
        setMessage('Invalid or expired reset link.');
        setStatus('error')
      })
  }, [oobCode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    if (password.length < 6) return setMessage('Password must be at least 6 characters')
    if (password !== confirmPassword) return setMessage('Passwords do not match')
    setStatus('submitting')
    try {
      await confirmPasswordReset(auth, oobCode, password)
      setStatus('success')
      setMessage('Your password has been updated. You may now sign in.')
    } catch (err) {
      console.error('confirm error', err)
      setStatus('error')
      setMessage(err?.message || 'Failed to set new password')
    }
  }

  return (
    <div className="admin-container auth-container">
      <div className="admin-card auth-card">
        <div className="auth-brand">
          <div className="brand-circle">HC</div>
        </div>

        <div className="auth-card-inner">
          <h1 className="admin-title">Set a new password</h1>
          <p className="admin-subtitle">{email ? `Resetting password for ${email}` : 'Follow the instructions to set a new password'}</p>

          {status === 'verifying' && <div className="status-msg">Verifying link...</div>}
          {status === 'error' && <div className="status-msg error">{message || 'Invalid reset link'}</div>}

          {(status === 'ready' || status === 'submitting') && (
            <form className="admin-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter a new password" required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" required />
              </div>

              {message && <div className="status-msg error">{message}</div>}

              <button className="submit-button" type="submit">Set new password</button>
            </form>
          )}

          {status === 'success' && (
            <div>
              <div className="status-msg success">{message}</div>
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Link to="/admin-login" style={{ color: '#667eea', fontWeight: '600', textDecoration: 'none' }}>Back to Sign in</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ResetNewPassword
