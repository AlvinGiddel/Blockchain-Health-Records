import React, { useState } from 'react';
import { Shield, KeyRound, Check, AlertTriangle, Mail, RefreshCw, Lock } from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function Settings({ user, onUpdateUser }) {
  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Email State
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }

    setPasswordLoading(true);
    try {
      const data = await safeFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id || user._id,
          currentPassword,
          newPassword
        })
      });
      
      setPasswordSuccess(data.message || 'Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleEmailChange = async (e) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');

    const cleanNewEmail = newEmail.toLowerCase().trim();
    if (!cleanNewEmail) {
      setEmailError('Please enter a new email address.');
      return;
    }

    if (cleanNewEmail === (user.email || '').toLowerCase().trim()) {
      setEmailError('New email must be different from your current email address.');
      return;
    }

    setEmailLoading(true);
    try {
      const data = await safeFetch('/api/auth/update-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id || user._id,
          newEmail: cleanNewEmail,
          currentPassword: emailPassword
        })
      });

      setEmailSuccess(data.message || 'Email address updated successfully!');
      setNewEmail('');
      setEmailPassword('');

      // Update session token in storage
      if (data.token) {
        localStorage.setItem('token', data.token);
      }

      // Propagate user state change to entire application
      if (onUpdateUser && data.user) {
        onUpdateUser(data.user);
      }
    } catch (err) {
      setEmailError(err.message || 'Failed to update email address.');
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: 0 }}>Account Settings</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
          Manage your email address, security credentials, and account settings
        </p>
      </div>

      {/* 1. Update Email Address Card */}
      <div className="glass-card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            <Mail size={20} color="var(--color-primary)" />
          </div>
          <h3 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>
            Update Email Address
          </h3>
        </div>
        
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Change the email address used to log into your account and receive cryptographic ledger notifications.
        </p>

        {/* Current Email Indicator */}
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Current Active Email:</span>
          <strong style={{ fontSize: '0.9rem', color: 'var(--color-primary)', fontFamily: 'monospace' }}>{user.email}</strong>
        </div>

        {emailError && (
          <div className="badge-error" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{emailError}</span>
          </div>
        )}
        
        {emailSuccess && (
          <div className="badge-success" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <Check size={16} />
            <span>{emailSuccess}</span>
          </div>
        )}

        <form onSubmit={handleEmailChange}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>New Email Address</label>
            <input
              type="email"
              className="form-control"
              required
              placeholder="e.g. new.email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Current Account Password (for security verification)</label>
            <input
              type="password"
              className="form-control"
              required
              placeholder="Enter your current password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '12px', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', fontWeight: 600 }}
            disabled={emailLoading}
          >
            <Mail size={16} />
            {emailLoading ? 'Updating Email Address...' : 'Update Email Address'}
          </button>
        </form>
      </div>

      {/* 2. Update Security Password Card */}
      <div className="glass-card" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <Lock size={20} color="#10b981" />
          </div>
          <h3 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>
            Update Security Password
          </h3>
        </div>
        
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          It is recommended to update your security password regularly to ensure the integrity of your medical record credentials.
        </p>

        {passwordError && (
          <div className="badge-error" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{passwordError}</span>
          </div>
        )}
        
        {passwordSuccess && (
          <div className="badge-success" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <Check size={16} />
            <span>{passwordSuccess}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Current Password</label>
            <input
              type="password"
              className="form-control"
              required
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>New Password</label>
            <input
              type="password"
              className="form-control"
              required
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Confirm New Password</label>
            <input
              type="password"
              className="form-control"
              required
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '12px', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center', fontWeight: 600 }}
            disabled={passwordLoading}
          >
            <KeyRound size={16} />
            {passwordLoading ? 'Changing Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
