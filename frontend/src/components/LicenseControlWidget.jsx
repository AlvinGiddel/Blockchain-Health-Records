import React, { useEffect, useState } from 'react';
import { Shield, Server, RefreshCw, AlertTriangle, CheckCircle, Clock, Lock, Key } from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function LicenseControlWidget({ user }) {
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const fetchLicenseStatus = async () => {
    try {
      setError('');
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/license/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (data.license) {
        setLicenseInfo(data.license);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch license authority status.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualPing = async () => {
    setRefreshing(true);
    setStatusMessage('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/license/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (data.license) {
        setLicenseInfo(data.license);
        setStatusMessage('✓ Authority ping completed. Status is up-to-date.');
      }
    } catch (err) {
      setError(err.message || 'Failed to ping license authority.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchLicenseStatus();
    }
  }, [user]);

  if (user?.role !== 'super_admin') {
    return null;
  }

  const isActive = licenseInfo?.status === 'active';
  const failureCount = licenseInfo?.consecutiveFailures || 0;

  return (
    <div className="glass-card" style={{ marginBottom: '24px', border: '1px solid rgba(99, 102, 241, 0.3)', background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.3) 0%, rgba(15, 23, 42, 0.4) 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
            <Key size={20} color="var(--color-primary)" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Remote Licensing & Kill-Switch Authority
              <span className="badge" style={{ fontSize: '0.7rem', backgroundColor: 'rgba(99, 102, 241, 0.2)', color: 'var(--color-primary)', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
                SUPER ADMIN ONLY
              </span>
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Central Supabase Edge Function License Guard & Fail-Closed Protection
            </p>
          </div>
        </div>

        <button
          className="btn btn-secondary"
          onClick={handleManualPing}
          disabled={refreshing || loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px' }}
        >
          <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
          {refreshing ? 'Pinging Authority...' : 'Ping Authority Now'}
        </button>
      </div>

      {statusMessage && (
        <div style={{ padding: '8px 14px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.85rem', marginBottom: '16px' }}>
          {statusMessage}
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 14px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.85rem', marginBottom: '16px' }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading license authority status...
        </div>
      ) : (
        <div className="grid-3" style={{ gap: '16px' }}>
          {/* Status Metric */}
          <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Instance License State
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isActive ? (
                <>
                  <CheckCircle size={20} color="#10b981" />
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>ACTIVE & LICENSED</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={20} color="#ef4444" />
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ef4444' }}>RESTRICTED / DISABLED</span>
                </>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              {isActive ? 'All hospital doctors, patients & admins have full operational access.' : 'Kill-switch triggered: Non-Super Admin traffic is blocked.'}
            </div>
          </div>

          {/* Fail-Closed Network Health */}
          <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Fail-Closed Security Counter
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={20} color={failureCount === 0 ? 'var(--color-primary)' : '#f59e0b'} />
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {failureCount} / 3 Failures
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              {failureCount === 0 ? '✓ Network ping healthy (0 connection drops).' : 'Consecutive failed attempts before auto-locking.'}
            </div>
          </div>

          {/* Last Verification Timestamp */}
          <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
              Last Verified Timestamp
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={20} color="var(--color-accent)" />
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {licenseInfo?.lastChecked ? new Date(licenseInfo.lastChecked).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'On Server Boot'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Autonomous 6-hour recurring verification interval.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
