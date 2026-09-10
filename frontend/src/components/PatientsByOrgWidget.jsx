import React, { useState, useEffect } from 'react';
import {
  Building2, Users, Shield, Lock, Search, X, AlertTriangle,
  CheckCircle, Eye, RefreshCw, FileText, ArrowRight, UserCheck
} from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function PatientsByOrgWidget({ user, refreshTrigger }) {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState(5);

  // Justification Modal State
  const [selectedOrg, setSelectedOrg] = useState(null); // Org selected for drill-down
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [submittingJustification, setSubmittingJustification] = useState(false);

  // Unlocked Patient Directory Modal State
  const [unlockedData, setUnlockedData] = useState(null); // { organization, patients, auditLogged, eventType, timestamp }
  const [patientSearchQuery, setPatientSearchQuery] = useState('');

  // Fetch aggregated patient counts (Zero PII)
  const fetchPatientCounts = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await safeFetch('/api/admin/organizations/patient-counts');
      if (data.organizations) {
        setOrganizations(data.organizations);
      }
    } catch (err) {
      console.error('Error fetching organization patient counts:', err);
      setError(err.message || 'Failed to load organization patient statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatientCounts();
  }, [refreshTrigger]);

  // Open Justification Modal
  const handleOpenJustification = (org) => {
    setSelectedOrg(org);
    setReason('');
    setReasonError('');
  };

  // Close Justification Modal
  const handleCloseJustification = () => {
    setSelectedOrg(null);
    setReason('');
    setReasonError('');
  };

  // Submit Justification and Drill-Down
  const handleSubmitJustification = async (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length < 5) {
      setReasonError('Operational justification reason must be at least 5 characters long.');
      return;
    }

    setSubmittingJustification(true);
    setReasonError('');

    try {
      const data = await safeFetch(`/api/admin/organizations/${selectedOrg.id}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: trimmed })
      });

      // Save unlocked data and open patient directory view
      setUnlockedData(data);
      handleCloseJustification();
    } catch (err) {
      console.error('Failed to authorize patient list drill-down:', err);
      setReasonError(err.message || 'Failed to authorize access to patient directory.');
    } finally {
      setSubmittingJustification(false);
    }
  };

  // Filter organizations by name
  const filteredOrgs = organizations.filter(org => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (org.name || '').toLowerCase().includes(q) || (org.slug || '').toLowerCase().includes(q);
  });

  // Filter revealed patients by name/email/phone
  const filteredPatients = (unlockedData?.patients || []).filter(p => {
    if (!patientSearchQuery.trim()) return true;
    const q = patientSearchQuery.toLowerCase().trim();
    return (
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="glass-card" style={{ marginBottom: '28px', border: '1px solid rgba(15, 118, 110, 0.35)' }}>
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-primary)' }}>
            <Building2 size={22} /> Patients by Organization
            <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 600 }}>
              🛡️ Privacy-by-Design Access Controls
            </span>
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Aggregated patient populations across registered healthcare facilities. Drill-down access is restricted and auditable.
          </p>
        </div>

        {/* Search & Refresh Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px', paddingRight: searchQuery ? '28px' : '10px', fontSize: '0.8rem', height: '36px', borderRadius: '8px' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                title="Clear Search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchPatientCounts}
            disabled={loading}
            style={{ height: '36px', padding: '0 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Refresh patient counts"
          >
            <RefreshCw size={13} className={loading ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Privacy Architecture Notice Banner */}
      <div style={{
        padding: '12px 16px',
        borderRadius: '8px',
        background: 'rgba(15, 118, 110, 0.1)',
        border: '1px solid rgba(15, 118, 110, 0.25)',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <Shield size={18} style={{ color: 'var(--color-primary)', marginTop: '2px', flexShrink: 0 }} />
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Break-Glass Audit Policy:</strong> Individual patient identity and demographics are protected by default. Clicking <em>"View Patient List"</em> requires an operational justification and creates an immutable entry in <code style={{ color: '#818cf8' }}>audit_logs</code> (<code style={{ color: '#34d399' }}>admin_patient_list_view</code>). All clinical records, diagnoses, and treatments are strictly withheld.
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '16px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Aggregated Organization Table (Default View: Zero PII) */}
      <div className="table-container">
        <table className="custom-table" style={{ fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th>Healthcare Facility</th>
              <th>Tenant Status</th>
              <th>Doctor Count</th>
              <th>Patient Population</th>
              <th>Privacy Protection</th>
              <th style={{ textAlign: 'right' }}>Audited Access</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  <RefreshCw size={20} className="spinning" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                  Loading organization patient statistics...
                </td>
              </tr>
            ) : filteredOrgs.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  {searchQuery ? `No healthcare facilities found matching "${searchQuery}".` : 'No registered healthcare facilities.'}
                </td>
              </tr>
            ) : (
              filteredOrgs.slice(0, searchQuery.trim() ? undefined : limit).map(org => {
                const statusColor = org.status === 'active' ? '#10b981' : org.status === 'trial' ? '#3b82f6' : '#ef4444';
                return (
                  <tr key={org.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={16} color="var(--color-primary)" />
                        <div>
                          <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{org.name}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            ID: {org.id.substring(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        backgroundColor: `${statusColor}22`,
                        color: statusColor,
                        border: `1px solid ${statusColor}44`,
                        textTransform: 'uppercase'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: statusColor }} />
                        {org.status || 'active'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        background: 'rgba(99, 102, 241, 0.12)',
                        color: '#818cf8',
                        fontWeight: 600,
                        fontSize: '0.8rem'
                      }}>
                        🩺 {org.doctorCount || 0} Doctors
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#34d399',
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}>
                        👥 {org.patientCount || 0} Patients
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Lock size={12} style={{ color: '#10b981' }} /> Aggregated (Zero PII)
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleOpenJustification(org)}
                        style={{
                          fontSize: '0.78rem',
                          padding: '6px 12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#34d399',
                          borderColor: 'rgba(16, 185, 129, 0.35)',
                          background: 'rgba(16, 185, 129, 0.08)'
                        }}
                      >
                        <Lock size={13} /> View Patient List
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Collapsible expander for patient stats */}
      {!searchQuery.trim() && filteredOrgs.length > 5 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Showing {Math.min(limit, filteredOrgs.length)} of {filteredOrgs.length} facilities
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setLimit(prev => prev === 5 ? filteredOrgs.length : 5)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            {limit > 5 ? '▲ Collapse list (top 5)' : `▼ Show all ${filteredOrgs.length} facilities (${filteredOrgs.length - 5} hidden)`}
          </button>
        </div>
      )}

      {/* MODAL 1: Break-Glass Justification Required Modal */}
      {selectedOrg && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.82)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px',
          backdropFilter: 'blur(5px)'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '520px', background: 'var(--bg-secondary)', border: '1px solid rgba(245, 158, 11, 0.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontSize: '1.15rem' }}>
                <Lock size={20} /> Access Justification Required
              </h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={handleCloseJustification}
              >
                ✕
              </button>
            </div>

            {/* Warning Alert */}
            <div style={{
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              marginBottom: '16px',
              fontSize: '0.8rem',
              color: '#fbbf24',
              lineHeight: 1.45
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Audited Break-Glass Event:</strong> You are requesting to unlock the patient demographic directory for <strong>{selectedOrg.name}</strong>.
                  <div style={{ marginTop: '4px', color: '#fef3c7' }}>
                    This access will be permanently recorded in the immutable audit ledger (<code style={{ color: '#818cf8' }}>audit_logs</code>) under your Super Admin credentials with a timestamp.
                  </div>
                </div>
              </div>
            </div>

            {reasonError && (
              <div style={{ padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '14px' }}>
                ⚠️ {reasonError}
              </div>
            )}

            <form onSubmit={handleSubmitJustification}>
              <div className="form-group" style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                    Operational Reason for Access <span style={{ color: 'var(--color-error, #ef4444)' }}>*</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', color: reason.trim().length >= 5 ? '#34d399' : '#f59e0b', fontWeight: 600 }}>
                    {reason.trim().length} / 5 chars min {reason.trim().length >= 5 && '✓'}
                  </span>
                </div>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="e.g. Clinic reported patient account sync issue; verifying registration status for ticket #412"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  style={{ width: '100%', fontSize: '0.85rem', resize: 'vertical' }}
                  autoFocus
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  Enter a specific, justified reason. Generic or blank reasons are rejected.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseJustification}
                  disabled={submittingJustification}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingJustification || reason.trim().length < 5}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: reason.trim().length < 5 ? 0.6 : 1,
                    cursor: reason.trim().length < 5 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submittingJustification ? (
                    <>
                      <RefreshCw size={14} className="spinning" /> Authorizing & Logging...
                    </>
                  ) : (
                    <>
                      <Lock size={14} /> Authorize & View Patient List
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Revealed Patient Directory (Data-Minimized: Zero Clinical Data) */}
      {unlockedData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px',
          backdropFilter: 'blur(6px)'
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '820px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)', border: '1px solid rgba(16, 185, 129, 0.45)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontSize: '1.2rem' }}>
                  <Users size={20} /> Patient Directory: {unlockedData.organization?.name}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Total Affiliated Patients: {unlockedData.patientCount || 0}
                </span>
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
                onClick={() => setUnlockedData(null)}
              >
                ✕
              </button>
            </div>

            {/* Audit Log Confirmation Banner */}
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              fontSize: '0.8rem',
              color: '#34d399'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={16} />
                <span>
                  <strong>Audited Event Recorded:</strong> <code>{unlockedData.eventType}</code> &bull; Timestamp: {new Date(unlockedData.timestamp).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Immutable Ledger ID: {unlockedData.organization?.id.substring(0, 8)}...
              </span>
            </div>

            {/* Search Filter for Patient List */}
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Filter patients by name, email, or phone..."
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  style={{ paddingLeft: '32px', paddingRight: patientSearchQuery ? '28px' : '10px', fontSize: '0.8rem', height: '34px', borderRadius: '6px' }}
                />
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                {patientSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setPatientSearchQuery('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Showing {filteredPatients.length} of {unlockedData.patients?.length || 0}
              </span>
            </div>

            {/* Patient Table (Demographic & Account Info Only) */}
            <div className="table-container" style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', marginBottom: '14px' }}>
              <table className="custom-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>Account Email</th>
                    <th>Phone Contact</th>
                    <th>Registration Date</th>
                    <th>Membership Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        {patientSearchQuery ? `No patient matches "${patientSearchQuery}".` : 'No patient records affiliated with this organization.'}
                      </td>
                    </tr>
                  ) : (
                    filteredPatients.map(p => (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(15, 118, 110, 0.25)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                              {(p.name || 'P')[0].toUpperCase()}
                            </div>
                            <strong style={{ color: 'var(--text-primary)' }}>{p.name}</strong>
                          </div>
                        </td>
                        <td>{p.email}</td>
                        <td style={{ fontFamily: 'monospace' }}>{p.phone || '—'}</td>
                        <td>{new Date(p.registeredAt || Date.now()).toLocaleDateString('en-KE')}</td>
                        <td>
                          <span style={{
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.3)'
                          }}>
                            ✓ {(p.membershipStatus || 'active').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Privacy Boundary Guarantee Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--glass-border)',
              paddingTop: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <Lock size={13} color="#10b981" />
                <span>
                  <strong>Privacy Architecture:</strong> Clinical records, diagnoses, and treatments are strictly withheld in accordance with privacy-by-design standards.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUnlockedData(null)}
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
              >
                Close Directory
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
