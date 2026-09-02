import React, { useEffect, useState } from 'react';
import { Shield, Server, RefreshCw, AlertTriangle, CheckCircle, Clock, Lock, Key, Plus, Stethoscope, UserCheck, X, Activity, ToggleLeft, ToggleRight, Building2, Ban, Check } from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function LicenseControlWidget({ user }) {
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  // Active Interactive Card Modal State: 'license' | 'security' | 'schedule' | 'kmpdc' | null
  const [activeModal, setActiveModal] = useState(null);

  // Multi-Tenant Organizations State
  const [organizations, setOrganizations] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgActionLoading, setOrgActionLoading] = useState(null);
  const [orgStatusMsg, setOrgStatusMsg] = useState('');
  const [orgErrorMsg, setOrgErrorMsg] = useState('');

  // KMPDC Registry State
  const [practitioners, setPractitioners] = useState([]);
  const [loadingPractitioners, setLoadingPractitioners] = useState(false);
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);

  // Add Doctor Form State
  const [newLicense, setNewLicense] = useState('');
  const [newName, setNewName] = useState('');
  const [newCadre, setNewCadre] = useState('Medical Practitioner');
  const [newSpec, setNewSpec] = useState('General Practice');
  const [newFacility, setNewFacility] = useState('Kenyatta National Hospital');
  const [addDoctorLoading, setAddDoctorLoading] = useState(false);
  const [addDoctorError, setAddDoctorError] = useState('');
  const [addDoctorSuccess, setAddDoctorSuccess] = useState('');

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

  const fetchOrganizations = async () => {
    if (user?.role !== 'super_admin') return;
    setLoadingOrgs(true);
    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/admin/organizations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (data.organizations) {
        setOrganizations(data.organizations);
      }
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const handleToggleOrgStatus = async (orgId, currentStatus) => {
    const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    setOrgActionLoading(orgId);
    setOrgStatusMsg('');
    setOrgErrorMsg('');
    
    // Optimistic UI update: immediately flip the clinic's badge and button
    setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, status: nextStatus } : o));

    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch(`/api/admin/organizations/${orgId}/status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: nextStatus })
      });
      setOrgStatusMsg(data.message || `✓ Clinic status updated to: ${nextStatus.toUpperCase()}`);
      fetchOrganizations();
    } catch (err) {
      // Revert optimistic update on failure
      setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, status: currentStatus } : o));
      setOrgErrorMsg(err.message || 'Failed to update organization status.');
    } finally {
      setOrgActionLoading(null);
    }
  };

  const handleExtendOrg = async (orgId) => {
    setOrgActionLoading(orgId);
    setOrgStatusMsg('');
    setOrgErrorMsg('');
    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch(`/api/admin/organizations/${orgId}/status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'active', extendDays: 30 })
      });
      setOrgStatusMsg(data.message || '✓ License extended by +30 days.');
      fetchOrganizations();
    } catch (err) {
      setOrgErrorMsg(err.message || 'Failed to extend license.');
    } finally {
      setOrgActionLoading(null);
    }
  };

  const fetchPractitioners = async () => {
    try {
      setLoadingPractitioners(true);
      const data = await safeFetch('/api/kmpdc/practitioners');
      if (data.practitioners) {
        setPractitioners(data.practitioners);
      }
    } catch (err) {
      console.error('Error fetching practitioners:', err);
    } finally {
      setLoadingPractitioners(false);
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
        setStatusMessage('✓ Authority ping completed. License state is synchronized.');
      }
    } catch (err) {
      setError(err.message || 'Failed to ping license authority.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSimulateKillswitch = async (targetStatus) => {
    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/license/simulate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetStatus,
          reason: targetStatus === 'disabled' ? 'Simulated Super Admin Kill-Switch Override' : 'Active Subscription'
        })
      });
      if (data.license) {
        setLicenseInfo(data.license);
        setStatusMessage(`✓ Instance state switched to: ${targetStatus.toUpperCase()}`);
      }
    } catch (err) {
      setError(err.message || 'Failed to simulate license state.');
    }
  };

  const handleAddDoctorSubmit = async (e) => {
    e.preventDefault();
    setAddDoctorError('');
    setAddDoctorSuccess('');
    setAddDoctorLoading(true);

    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/kmpdc/practitioners', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          licenseNumber: newLicense,
          fullName: newName,
          cadre: newCadre,
          specialization: newSpec,
          facility: newFacility,
          status: 'active'
        })
      });

      setAddDoctorSuccess(data.message);
      setNewLicense('');
      setNewName('');
      fetchPractitioners();
      setTimeout(() => {
        setShowAddDoctorModal(false);
        setAddDoctorSuccess('');
      }, 1500);
    } catch (err) {
      setAddDoctorError(err.message || 'Failed to add doctor to KMPDC registry.');
    } finally {
      setAddDoctorLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
    fetchPractitioners();
    fetchOrganizations();
  }, []);

  if (user?.role !== 'super_admin') {
    return null;
  }

  const isActive = licenseInfo?.status === 'active';
  const failureCount = licenseInfo?.consecutiveFailures || 0;

  return (
    <div className="glass-card" style={{ marginBottom: '28px', border: '1px solid rgba(99, 102, 241, 0.4)', background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)' }}>
      
      {/* Widget Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
            <Key size={22} color="var(--color-primary)" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Super Admin SaaS & Licensing Control Center
              <span className="badge" style={{ fontSize: '0.7rem', backgroundColor: 'rgba(99, 102, 241, 0.25)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.5)' }}>
                ROOT AUTHORITY
              </span>
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Central Supabase Remote Kill-Switch, Fail-Closed Matrix, & KMPDC Doctor Oracle Manager
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowAddDoctorModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px', background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34d399' }}
          >
            <Plus size={15} /> Add Doctor to KMPDC Oracle
          </button>

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
      </div>

      {statusMessage && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 3 Interactive Clickable Metric Cards */}
      <div className="grid-3" style={{ gap: '16px', marginBottom: '20px' }}>
        
        {/* Card 1: License State (Clickable) */}
        <div
          onClick={() => setActiveModal('license')}
          style={{
            padding: '18px',
            borderRadius: '10px',
            background: 'rgba(0,0,0,0.25)',
            border: isActive ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            position: 'relative'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Instance License State
            </div>
            <span style={{ fontSize: '0.7rem', color: '#818cf8', textDecoration: 'underline' }}>Click to Test / Manage</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isActive ? (
              <>
                <CheckCircle size={22} color="#10b981" />
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10b981' }}>ACTIVE & LICENSED</span>
              </>
            ) : (
              <>
                <AlertTriangle size={22} color="#ef4444" />
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ef4444' }}>RESTRICTED / DISABLED</span>
              </>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            {isActive ? '✓ Full operational access granted to hospital node.' : '⚠️ Kill-switch triggered: Non-Super Admin traffic is blocked.'}
          </div>
        </div>

        {/* Card 2: Fail-Closed Security Counter (Clickable) */}
        <div
          onClick={() => setActiveModal('security')}
          style={{
            padding: '18px',
            borderRadius: '10px',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--glass-border)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Fail-Closed Security Matrix
            </div>
            <span style={{ fontSize: '0.7rem', color: '#818cf8', textDecoration: 'underline' }}>View Policy</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={22} color={failureCount === 0 ? 'var(--color-primary)' : '#f59e0b'} />
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {failureCount} / 3 Failures
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            {failureCount === 0 ? '✓ Network ping healthy (0 connection drops).' : 'Consecutive dropped pings before auto-killswitch.'}
          </div>
        </div>

        {/* Card 3: Verification Schedule (Clickable) */}
        <div
          onClick={() => setActiveModal('schedule')}
          style={{
            padding: '18px',
            borderRadius: '10px',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--glass-border)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.15)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Verification Schedule & Heartbeat
            </div>
            <span style={{ fontSize: '0.7rem', color: '#818cf8', textDecoration: 'underline' }}>View Timing</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={22} color="var(--color-accent)" />
            <span style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {licenseInfo?.lastChecked ? new Date(licenseInfo.lastChecked).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'On Server Boot'}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Autonomous 6-hour recurring verification interval.
          </div>
        </div>

      </div>

      {/* Master KMPDC Practitioners Table Preview */}
      <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Stethoscope size={18} color="var(--color-primary)" />
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              Master KMPDC Doctor Oracle Registry ({practitioners.length} Registered Practitioners)
            </h4>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Official retention register synchronized with Kenyan council standards
          </span>
        </div>

        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px' }}>License #</th>
                <th style={{ padding: '8px 6px' }}>Practitioner Name</th>
                <th style={{ padding: '8px 6px' }}>Cadre & Specialty</th>
                <th style={{ padding: '8px 6px' }}>Hospital Facility</th>
                <th style={{ padding: '8px 6px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {practitioners.map((doc, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: 'var(--color-primary)', fontWeight: 600 }}>{doc.license_number}</td>
                  <td style={{ padding: '8px 6px', fontWeight: 500 }}>{doc.full_name}</td>
                  <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{doc.specialization} ({doc.cadre})</td>
                  <td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>{doc.facility}</td>
                  <td style={{ padding: '8px 6px' }}>
                    <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                      {doc.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Tenant Organizations & Per-Clinic Kill-Switch Control Center (Super Admin Only) */}
      {user?.role === 'super_admin' && (
        <div style={{ padding: '20px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '6px', borderRadius: '8px' }}>
                <Building2 size={20} color="var(--color-primary)" />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Multi-Tenant Hospital Ledgers & Kill-Switch Matrix ({organizations.length} Clinics)
                </h4>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Manage tenant licenses and kill-switch states independently without cross-tenant disruption
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchOrganizations}
              disabled={loadingOrgs}
              style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={loadingOrgs ? 'rotate-spin' : ''} />
              {loadingOrgs ? 'Syncing...' : 'Refresh Matrix'}
            </button>
          </div>

          {orgStatusMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', color: '#34d399', fontSize: '0.84rem', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{orgStatusMsg}</span>
              <button onClick={() => setOrgStatusMsg('')} style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
            </div>
          )}

          {orgErrorMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#f87171', fontSize: '0.84rem', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ {orgErrorMsg}</span>
              <button onClick={() => setOrgErrorMsg('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>Hospital / Clinic</th>
                  <th style={{ padding: '10px 8px' }}>License Status</th>
                  <th style={{ padding: '10px 8px' }}>Expiration Date</th>
                  <th style={{ padding: '10px 8px' }}>Doctors</th>
                  <th style={{ padding: '10px 8px' }}>Patients</th>
                  <th style={{ padding: '10px 8px' }}>Ledger Height</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Kill-Switch Actions</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map(org => {
                  const isOrgSuspended = org.status === 'suspended' || org.status === 'disabled';
                  const isExpired = org.licenseExpiresAt && new Date(org.licenseExpiresAt) < new Date();
                  const isBusy = orgActionLoading === org.id;

                  return (
                    <tr key={org.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{org.name}</span>
                          {org.slug && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>({org.slug})</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          className={`badge ${isOrgSuspended ? 'badge-error' : (org.status === 'trial' ? 'badge-warning' : 'badge-success')}`}
                          style={{ textTransform: 'uppercase', fontSize: '0.72rem', padding: '3px 8px' }}
                        >
                          {isOrgSuspended ? 'SUSPENDED' : (isExpired ? 'EXPIRED' : org.status.toUpperCase())}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', color: isExpired ? 'var(--color-error)' : 'var(--text-secondary)' }}>
                        {org.licenseExpiresAt ? new Date(org.licenseExpiresAt).toLocaleDateString() : 'Perpetual'}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{org.doctorCount || 0}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{org.patientCount || 0}</td>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                        Block #{org.blockHeight || 0}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleExtendOrg(org.id)}
                            disabled={isBusy}
                            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                            title="Extend license by 30 days"
                          >
                            +30 Days
                          </button>
                          
                          {isOrgSuspended ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleToggleOrgStatus(org.id, org.status)}
                              disabled={isBusy}
                              style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#10b981', borderColor: '#10b981' }}
                            >
                              <Check size={12} /> Reactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleToggleOrgStatus(org.id, org.status)}
                              disabled={isBusy}
                              style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                            >
                              <Ban size={12} /> Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Interactive License & Kill-Switch Controller */}
      {activeModal === 'license' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '550px', background: 'var(--bg-secondary)', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <Key size={20} /> Remote Kill-Switch Controller
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
              As Super Admin, you can instantly test and verify how this hospital deployment reacts when the remote subscription expires or when the kill-switch is triggered.
            </p>

            <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Configured Client ID:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>knh-hospital-01</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Current Authority State:</span>
                <span style={{ fontWeight: 700, color: isActive ? '#10b981' : '#ef4444' }}>{isActive ? 'ACTIVE' : 'DISABLED'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Super Admin Bypass:</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Always Granted (Root Access)</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              {isActive ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    handleSimulateKillswitch('disabled');
                    setActiveModal(null);
                  }}
                  style={{ background: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <AlertTriangle size={16} /> Simulate Kill-Switch Lock (Disable)
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    handleSimulateKillswitch('active');
                    setActiveModal(null);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle size={16} /> Restore Active License
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Fail-Closed Security Matrix Modal */}
      {activeModal === 'security' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '520px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <Server size={20} /> Fail-Closed Security Policy
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              To prevent hospitals from unplugging their internet cable to bypass a disabled license, the system implements a strict <strong>Fail-Closed Security Matrix</strong>:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', fontSize: '0.85rem' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <strong>1. Maximum Drop Tolerance:</strong> 3 consecutive network check drops allowed.
              </div>
              <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <strong>2. Auto-Lock Enforcement:</strong> On the 3rd failure, the instance automatically switches to <code>DISABLED</code>.
              </div>
              <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <strong>3. Root Admin Exemption:</strong> The Super Admin account can always log in to troubleshoot or re-license.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Understood</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Verification Schedule Modal */}
      {activeModal === 'schedule' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
                <Clock size={20} /> Verification Heartbeat Timing
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              The backend runs an autonomous timer that pings your central Supabase Edge Function:
            </p>

            <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Polling Interval:</span>
                <span style={{ fontWeight: 600 }}>Every 6 Hours (21,600,000 ms)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Last Ping:</span>
                <span style={{ fontWeight: 600 }}>{licenseInfo?.lastChecked ? new Date(licenseInfo.lastChecked).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'Boot'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Request Timeout:</span>
                <span style={{ fontWeight: 600 }}>8000 ms (Fast Fail)</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-primary" onClick={() => { handleManualPing(); setActiveModal(null); }}>
                Ping License Now
              </button>
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Super Admin Add Doctor to KMPDC Oracle Modal */}
      {showAddDoctorModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '520px', background: 'var(--bg-secondary)', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <Plus size={20} /> Add Doctor to Master KMPDC Oracle
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowAddDoctorModal(false)}>✕</button>
            </div>

            {addDoctorSuccess && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '16px' }}>
                ✓ {addDoctorSuccess}
              </div>
            )}

            {addDoctorError && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '16px' }}>
                ⚠️ {addDoctorError}
              </div>
            )}

            <form onSubmit={handleAddDoctorSubmit}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  KMPDC License Number (e.g. A12345 or B10234)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. A88990"
                  required
                  value={newLicense}
                  onChange={e => setNewLicense(e.target.value.toUpperCase())}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Doctor Full Name (as on Council Certificate)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Dr. Mark Mwangi Mutuku"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="grid-2" style={{ gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Cadre</label>
                  <select className="form-control" value={newCadre} onChange={e => setNewCadre(e.target.value)} style={{ width: '100%' }}>
                    <option value="Medical Practitioner">Medical Practitioner (A)</option>
                    <option value="Dental Practitioner">Dental Practitioner (B)</option>
                    <option value="Specialist Practitioner">Specialist Practitioner (C/T)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Specialization</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Cardiology"
                    value={newSpec}
                    onChange={e => setNewSpec(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Clinical Facility</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Nairobi Hospital"
                  value={newFacility}
                  onChange={e => setNewFacility(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddDoctorModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={addDoctorLoading}>
                  {addDoctorLoading ? 'Registering...' : 'Register Practitioner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
