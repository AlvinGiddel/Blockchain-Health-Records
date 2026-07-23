import React, { useState } from 'react';
import { Shield, KeyRound, Check, AlertTriangle } from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function Settings({ user }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
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
      
      setSuccess(data.message || 'Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Account Settings</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage your password, account credentials, and system settings</p>
      </div>

      <div className="glass-card" style={{ padding: '32px' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
          <Shield size={22} /> Update Security Password
        </h3>
        
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          It is recommended to update your security password regularly to ensure the integrity of your medical record credentials.
        </p>

        {error && (
          <div className="badge-error" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="badge-success" style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <Check size={16} />
            <span>{success}</span>
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
            style={{ width: '100%', padding: '12px', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}
            disabled={loading}
          >
            <KeyRound size={16} />
            {loading ? 'Changing Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
