import React, { useState, useEffect } from 'react';
import {
  Building2, Pill, Shield, Lock, Search, X, AlertTriangle,
  CheckCircle, Eye, RefreshCw, FileText, ArrowRight, ShieldAlert, Clock
} from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function PrescriptionsByOrgWidget({ user, refreshTrigger }) {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Justification Modal State
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [submittingJustification, setSubmittingJustification] = useState(false);

  // Unlocked Prescriptions Modal State
  const [unlockedData, setUnlockedData] = useState(null);
  const [prescriptionSearchQuery, setPrescriptionSearchQuery] = useState('');

  // Fetch aggregated prescription counts (Zero PII)
  const fetchPrescriptionCounts = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await safeFetch('/api/admin/organizations/prescription-counts');
      if (data.organizations) {
        setOrganizations(data.organizations);
      }
    } catch (err) {
      console.error('Error fetching organization prescription counts:', err);
      setError(err.message || 'Failed to load organization prescription statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrescriptionCounts();
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
    if (!trimmed || trimmed.length < 10) {
      setReasonError('Operational justification reason must be at least 10 characters long.');
      return;
    }

    setSubmittingJustification(true);
    setReasonError('');

    try {
      const data = await safeFetch(`/api/admin/organizations/${selectedOrg.id}/prescriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: trimmed })
      });

      // Save unlocked data and open prescription oversight directory
      setUnlockedData(data);
      handleCloseJustification();
    } catch (err) {
      console.error('Failed to authorize prescription drill-down:', err);
      setReasonError(err.message || 'Failed to authorize access to prescription directory.');
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

  // Filter revealed prescriptions by medication / patient / doctor
  const filteredPrescriptions = (unlockedData?.prescriptions || []).filter(p => {
    if (!prescriptionSearchQuery.trim()) return true;
    const q = prescriptionSearchQuery.toLowerCase().trim();
    const matchesMed = (p.items || []).some(item => (item.medicationName || '').toLowerCase().includes(q));
    return (
      (p.patientName || '').toLowerCase().includes(q) ||
      (p.doctorName || '').toLowerCase().includes(q) ||
      (p.qrToken || '').toLowerCase().includes(q) ||
      matchesMed
    );
  });

  return (
    <div className="glass-card" style={{ marginBottom: '28px', border: '1px solid rgba(15, 118, 110, 0.35)' }}>
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-primary)' }}>
            <Pill size={22} /> Prescriptions by Organization
            <span style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 600 }}>
              🛡️ Privacy-by-Design Access Controls
            </span>
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Aggregated prescription issuance & fulfillment statistics. Unrestricted browsing is disabled; oversight drill-down requires justification & audit logging.
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
            onClick={fetchPrescriptionCounts}
            disabled={loading}
            style={{ height: '36px', padding: '0 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Refresh prescription counts"
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
          <strong style={{ color: 'var(--text-primary)' }}>Break-Glass Oversight Policy:</strong> Clinical prescription details and patient posology are protected by default. Clicking <em>"Inspect Prescriptions"</em> requires an operational investigation reason (minimum 10 characters) and immutably records an entry in <code style={{ color: '#818cf8' }}>audit_logs</code> (<code style={{ color: '#34d399' }}>admin_prescription_view</code>).
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
              <th>Status</th>
              <th>Total Issued</th>
              <th>Active / Pending</th>
              <th>Fulfilled</th>
              <th>Expired / Cancelled</th>
              <th style={{ textAlign: 'right' }}>Audited Oversight</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  <RefreshCw size={20} className="spinning" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                  Loading organization prescription statistics...
                </td>
              </tr>
            ) : filteredOrgs.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  {searchQuery ? `No healthcare facilities found matching "${searchQuery}".` : 'No registered healthcare facilities.'}
                </td>
              </tr>
            ) : (
              filteredOrgs.map(org => {
                const statusColor = org.status === 'active' ? '#10b981' : org.status === 'trial' ? '#3b82f6' : '#ef4444';
                return (
                  <tr key={org.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={16} color="var(--color-primary)" />
                        <div>
                          <strong style={{ display: 'block', color: 'var(--text-primary)' }}>{org.name}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ID: {org.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: `${statusColor}20`,
                        color: statusColor,
                        textTransform: 'uppercase'
                      }}>
                        {org.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {org.totalPrescriptions || 0}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                        {org.issuedCount || 0} issued
                      </span>
                      {org.partiallyFilledCount > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#f59e0b', marginLeft: '6px' }}>
                          ({org.partiallyFilledCount} partial)
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ color: '#34d399', fontWeight: 600 }}>
                        {org.filledCount || 0} filled
                      </span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {(org.expiredCount || 0) + (org.cancelledCount || 0)}
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
                          border: '1px solid rgba(15, 118, 110, 0.4)'
                        }}
                      >
                        <Shield size={13} color="var(--color-primary)" />
                        <span>Inspect Prescriptions</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
          MODAL 1: MANDATORY JUSTIFICATION PROMPT
          ========================================================================= */}
      {selectedOrg && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{ maxWidth: '520px', width: '100%', padding: '24px', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '8px', borderRadius: '8px', color: '#f87171' }}>
                  <ShieldAlert size={20} />
                </div>
                <h3 style={{ fontSize: '1.15rem', margin: 0 }}>Super Admin Prescription Oversight</h3>
              </div>
              <button
                type="button"
                onClick={handleCloseJustification}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '14px' }}>
              You are requesting justified access to inspect clinical prescriptions issued under <strong>{selectedOrg.name}</strong>.
            </p>

            <div style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '0.78rem',
              color: '#fcd34d'
            }}>
              <strong>⚠️ Privacy-by-Design Compliance:</strong> An immutable audit record will be logged under <code style={{ color: '#fff' }}>audit_logs</code> with event type <code style={{ color: '#fff' }}>admin_prescription_view</code>. A valid operational reason (minimum 10 characters) is legally required.
            </div>

            {reasonError && (
              <div style={{ padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '6px', color: '#fca5a5', fontSize: '0.8rem', marginBottom: '14px' }}>
                {reasonError}
              </div>
            )}

            <form onSubmit={handleSubmitJustification}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Operational Access Justification Reason (min 10 characters):
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="e.g. Investigating reported medication dispensation discrepancy pursuant to Incident Ticket #4082."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  style={{ width: '100%', fontSize: '0.82rem', padding: '10px', borderRadius: '8px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>Must be specific and verifiable for audit review.</span>
                  <span style={{ color: reason.trim().length >= 10 ? '#34d399' : '#f87171' }}>
                    {reason.trim().length}/10 min chars
                  </span>
                </div>
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
                  disabled={submittingJustification || reason.trim().length < 10}
                  style={{ background: '#0F766E', borderColor: '#0F766E' }}
                >
                  {submittingJustification ? 'Logging Audit & Authorizing...' : 'Authorize Oversight Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: UNLOCKED AUDITED PRESCRIPTION DIRECTORY
          ========================================================================= */}
      {unlockedData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{ maxWidth: '960px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px', border: '1px solid var(--color-primary)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Pill size={22} color="var(--color-primary)" />
                  <h3 style={{ fontSize: '1.25rem', margin: 0 }}>
                    Prescription Oversight: {unlockedData.organization.name}
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '0.78rem' }}>
                  <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                    <CheckCircle size={14} /> Audit Event Recorded: {unlockedData.eventType}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>&bull;</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Total: {unlockedData.prescriptionCount} Prescriptions
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>&bull;</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Timestamp: {new Date(unlockedData.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setUnlockedData(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.3rem', padding: '4px' }}
                title="Close Directory"
              >
                ✕
              </button>
            </div>

            {/* Filter Input */}
            <div style={{ marginBottom: '14px', position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Filter unlocked prescriptions by medication, patient name, doctor, or QR token..."
                value={prescriptionSearchQuery}
                onChange={(e) => setPrescriptionSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px', fontSize: '0.82rem', height: '36px', borderRadius: '8px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>

            {/* Unlocked Table */}
            <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
              <table className="custom-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Date Issued</th>
                    <th>Patient</th>
                    <th>Prescribing Doctor</th>
                    <th>Medications</th>
                    <th>Status</th>
                    <th>QR Token</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrescriptions.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        No prescriptions found matching "{prescriptionSearchQuery}".
                      </td>
                    </tr>
                  ) : (
                    filteredPrescriptions.map(p => {
                      const st = p.status;
                      const badgeColor = st === 'FILLED' ? '#10b981' : st === 'PARTIALLY_FILLED' ? '#f59e0b' : st === 'ISSUED' ? '#38bdf8' : '#ef4444';
                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{new Date(p.createdAt).toLocaleDateString()}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Exp: {new Date(p.expiresAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td>
                            <strong style={{ color: 'var(--text-primary)' }}>{p.patientName}</strong>
                          </td>
                          <td>
                            <span>Dr. {p.doctorName}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {(p.items || []).map((item, idx) => (
                                <div key={idx} style={{ fontSize: '0.78rem' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.medicationName}</span>
                                  <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>
                                    ({item.dosage}, qty: {item.quantityDispensed}/{item.quantityPrescribed})
                                  </span>
                                </div>
                              ))}
                              {(!p.items || p.items.length === 0) && (
                                <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No item details</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              backgroundColor: `${badgeColor}20`,
                              color: badgeColor
                            }}>
                              {st}
                            </span>
                          </td>
                          <td>
                            <code style={{ fontSize: '0.72rem', color: '#818cf8' }}>
                              {p.qrToken ? `${p.qrToken.slice(0, 10)}...` : 'N/A'}
                            </code>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Viewing authorized snapshot. To re-audit, submit a new operational justification.
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUnlockedData(null)}
              >
                Close Audit View
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
