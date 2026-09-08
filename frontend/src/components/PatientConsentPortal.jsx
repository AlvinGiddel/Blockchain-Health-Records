import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  KeyRound, 
  Plus, 
  User, 
  Building2, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Ban, 
  ExternalLink, 
  FileText, 
  Pill, 
  Stethoscope, 
  Search,
  Copy,
  Info,
  ChevronRight
} from 'lucide-react';
import { safeFetch } from '../utils/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export default function PatientConsentPortal({ user }) {
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('active'); // 'active', 'all', 'revoked'
  const [searchQuery, setSearchQuery] = useState('');

  // Grant Modal States
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedScope, setSelectedScope] = useState('full_record');
  const [selectedDuration, setSelectedDuration] = useState('30'); // '1', '7', '30', '90', 'indefinite'
  const [purpose, setPurpose] = useState('Clinical Consultation & Diagnostic Review');
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const [grantError, setGrantError] = useState('');

  // Revoke Modal States
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedConsentToRevoke, setSelectedConsentToRevoke] = useState(null);
  const [revokeReason, setRevokeReason] = useState('Treatment episode concluded');
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  // Toast / Feedback
  const [feedback, setFeedback] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setFeedback({ show: true, message, type });
    setTimeout(() => {
      setFeedback({ show: false, message: '', type: 'success' });
    }, 4500);
  };

  const fetchConsents = async () => {
    try {
      setLoading(true);
      const res = await safeFetch('/api/consents', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.success) {
        setConsents(res.consents || []);
      }
    } catch (err) {
      console.error('Failed to load consents:', err);
      showToast(err.message || 'Failed to fetch access consent records.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchScopedDoctors = async () => {
    try {
      setLoadingDoctors(true);
      const res = await safeFetch('/api/users/doctors', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (Array.isArray(res)) {
        setDoctors(res);
        if (res.length > 0 && !selectedDoctorId) {
          setSelectedDoctorId(res[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load doctors:', err);
    } finally {
      setLoadingDoctors(false);
    }
  };

  useEffect(() => {
    fetchConsents();
  }, []);

  const handleOpenGrantModal = () => {
    setShowGrantModal(true);
    setGrantError('');
    fetchScopedDoctors();
  };

  const handleGrantConsent = async (e) => {
    e.preventDefault();
    if (!selectedDoctorId) {
      setGrantError('Please select a verified doctor.');
      return;
    }

    try {
      setGrantSubmitting(true);
      setGrantError('');

      const durationDays = selectedDuration === 'indefinite' ? null : parseInt(selectedDuration, 10);

      const res = await safeFetch('/api/consents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          granteeType: 'doctor',
          doctorId: selectedDoctorId,
          scope: selectedScope,
          durationDays,
          purpose: purpose.trim() || 'Clinical Review'
        })
      });

      if (res.success) {
        showToast(res.message || 'Consent granted successfully.');
        setShowGrantModal(false);
        fetchConsents();
      }
    } catch (err) {
      setGrantError(err.message || 'Failed to grant consent.');
    } finally {
      setGrantSubmitting(false);
    }
  };

  const handleOpenRevokeModal = (consent) => {
    setSelectedConsentToRevoke(consent);
    setRevokeReason('Treatment episode concluded');
    setRevokeError('');
    setShowRevokeModal(true);
  };

  const handleConfirmRevocation = async (e) => {
    e.preventDefault();
    if (!selectedConsentToRevoke) return;

    try {
      setRevokeSubmitting(true);
      setRevokeError('');

      const res = await safeFetch(`/api/consents/${selectedConsentToRevoke.id}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          reason: revokeReason.trim() || 'Revoked by patient'
        })
      });

      if (res.success) {
        showToast('Access consent revoked. Clinician privileges have been terminated immediately.');
        setShowRevokeModal(false);
        setSelectedConsentToRevoke(null);
        fetchConsents();
      }
    } catch (err) {
      setRevokeError(err.message || 'Failed to revoke consent.');
    } finally {
      setRevokeSubmitting(false);
    }
  };

  // Filtered Consents
  const filteredConsents = consents.filter(c => {
    const isRevoked = c.status === 'revoked';
    const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
    const isActive = !isRevoked && !isExpired;

    if (activeFilter === 'active' && !isActive) return false;
    if (activeFilter === 'revoked' && !isRevoked && !isExpired) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const docName = (c.doctor_name || '').toLowerCase();
      const orgName = (c.organization_name || '').toLowerCase();
      const purposeText = (c.purpose || '').toLowerCase();
      return docName.includes(q) || orgName.includes(q) || purposeText.includes(q);
    }

    return true;
  });

  const getScopeBadge = (scope) => {
    switch (scope) {
      case 'full_record':
        return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-medium">Full Medical Dossier</Badge>;
      case 'diagnoses_only':
        return <Badge variant="secondary" className="bg-sky-500/10 text-sky-400 border-sky-500/20 font-medium">Diagnoses & Labs Only</Badge>;
      case 'prescriptions_only':
        return <Badge variant="secondary" className="bg-purple-500/10 text-purple-400 border-purple-500/20 font-medium">Prescriptions Only</Badge>;
      default:
        return <Badge variant="secondary">{scope}</Badge>;
    }
  };

  const isConsentActive = (consent) => {
    if (consent.status === 'revoked') return false;
    if (consent.expires_at && new Date(consent.expires_at) < new Date()) return false;
    return true;
  };

  return (
    <div className="space-y-6 animate-fadeIn" style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px' }}>
      {/* Toast Notification */}
      {feedback.show && (
        <div 
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            backgroundColor: feedback.type === 'error' ? '#ef4444' : '#10b981',
            color: '#fff',
            fontWeight: 500,
            fontSize: '0.9rem'
          }}
        >
          {feedback.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div 
        style={{
          background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.18) 0%, rgba(16, 185, 129, 0.08) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '16px',
          padding: '24px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ maxWidth: '650px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ 
              background: 'rgba(16, 185, 129, 0.2)', 
              color: '#34d399', 
              padding: '4px 10px', 
              borderRadius: '20px', 
              fontSize: '0.78rem', 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <ShieldCheck size={14} /> HIPAA & Kenya DPA 2019 Compliant
            </span>
            <span style={{ 
              background: 'rgba(56, 189, 248, 0.15)', 
              color: '#38bdf8', 
              padding: '4px 10px', 
              borderRadius: '20px', 
              fontSize: '0.78rem', 
              fontWeight: 600 
            }}>
              Cryptographic Sovereignty
            </span>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
            Patient Consent & Granular Access Delegation
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
            You maintain full legal and cryptographic authority over who views your medical dossier. 
            Grant time-bounded or granular access to attending physicians at your affiliated healthcare clinics, 
            and revoke permissions anytime with instant effect.
          </p>
        </div>

        <Button 
          onClick={handleOpenGrantModal}
          className="btn btn-primary"
          style={{
            background: '#0F766E',
            borderColor: '#0F766E',
            padding: '12px 22px',
            fontSize: '0.95rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(15, 118, 110, 0.35)'
          }}
        >
          <Plus size={18} /> Grant Doctor Access
        </Button>
      </div>

      {/* Control Bar: Filters & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => setActiveFilter('active')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              background: activeFilter === 'active' ? '#0F766E' : 'transparent',
              color: activeFilter === 'active' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            Active Grants ({consents.filter(isConsentActive).length})
          </button>
          <button
            onClick={() => setActiveFilter('revoked')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              background: activeFilter === 'revoked' ? '#0F766E' : 'transparent',
              color: activeFilter === 'revoked' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            Revoked & Expired ({consents.filter(c => !isConsentActive(c)).length})
          </button>
          <button
            onClick={() => setActiveFilter('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              background: activeFilter === 'all' ? '#0F766E' : 'transparent',
              color: activeFilter === 'all' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            Full Ledger ({consents.length})
          </button>
        </div>

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search by doctor, clinic, purpose..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.2)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Clock size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#0F766E' }} />
          <p>Retrieving cryptographic consent authorizations...</p>
        </div>
      ) : filteredConsents.length === 0 ? (
        <div 
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '16px',
            border: '1px dashed rgba(255,255,255,0.1)'
          }}
        >
          <KeyRound size={40} style={{ margin: '0 auto 14px auto', color: 'var(--text-secondary)', opacity: 0.5 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            No {activeFilter === 'active' ? 'Active' : ''} Consent Authorizations Found
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 18px auto' }}>
            {activeFilter === 'active' 
              ? 'You have not granted access to any external doctors yet. You can grant access to doctors at clinics you are registered with anytime.'
              : 'No matching consent records match your current filter.'}
          </p>
          {activeFilter === 'active' && (
            <Button onClick={handleOpenGrantModal} className="btn btn-primary" style={{ background: '#0F766E', borderColor: '#0F766E' }}>
              <Plus size={16} /> Grant Doctor Access
            </Button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {filteredConsents.map(consent => {
            const active = isConsentActive(consent);
            const isRevoked = consent.status === 'revoked';
            const isExpired = consent.expires_at && new Date(consent.expires_at) < new Date();

            return (
              <div
                key={consent.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: active ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: active ? '0 4px 20px rgba(0,0,0,0.15), 0 0 15px rgba(16, 185, 129, 0.05)' : 'none',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Status indicator bar */}
                <div 
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: active ? '#10b981' : (isRevoked ? '#ef4444' : '#f59e0b')
                  }}
                />

                <div>
                  {/* Doctor & Status Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div 
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '10px',
                          background: 'rgba(15, 118, 110, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#2dd4bf',
                          fontWeight: 700
                        }}
                      >
                        <Stethoscope size={22} />
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 2px 0', fontSize: '1.02rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {consent.doctor_name ? `Dr. ${consent.doctor_name}` : 'Attending Practitioner'}
                        </h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Building2 size={12} /> {consent.organization_name || 'Affiliated Facility'}
                        </span>
                      </div>
                    </div>

                    <div>
                      {active ? (
                        <span style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399' }} /> Active
                        </span>
                      ) : isRevoked ? (
                        <span style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          border: '1px solid rgba(239, 68, 68, 0.3)'
                        }}>
                          Revoked
                        </span>
                      ) : (
                        <span style={{
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#fbbf24',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          border: '1px solid rgba(245, 158, 11, 0.3)'
                        }}>
                          Expired
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Scope & Details */}
                  <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Authorized Scope:</span>
                      {getScopeBadge(consent.scope)}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Granted On:</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        {new Date(consent.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Access Window:</span>
                      <span style={{ fontSize: '0.82rem', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        {consent.expires_at 
                          ? `Expires ${new Date(consent.expires_at).toLocaleDateString()}` 
                          : 'Indefinite (Until Revoked)'}
                      </span>
                    </div>

                    <div style={{ marginTop: '4px', background: 'rgba(0,0,0,0.18)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                        Clinical Purpose:
                      </span>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                        "{consent.purpose || 'Clinical Consultation'}"
                      </p>
                    </div>

                    {isRevoked && consent.revocation_reason && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <span style={{ fontSize: '0.75rem', color: '#f87171', display: 'block', marginBottom: '2px' }}>
                          Revocation Reason:
                        </span>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#fca5a5' }}>
                          "{consent.revocation_reason}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action / Footer */}
                <div style={{ paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`Tx Hash: ${consent.transaction_hash}`}>
                    <KeyRound size={12} style={{ color: 'var(--text-secondary)' }} />
                    <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {consent.transaction_hash ? `${consent.transaction_hash.slice(0, 10)}...` : '0x...'}
                    </span>
                  </div>

                  {active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenRevokeModal(consent)}
                      style={{
                        color: '#f87171',
                        borderColor: 'rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.08)',
                        fontSize: '0.78rem',
                        padding: '4px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Ban size={13} /> Revoke Access
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Grant Access Modal */}
      {showGrantModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            style={{
              background: '#111827',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              padding: '24px 28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setShowGrantModal(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(15, 118, 110, 0.2)', padding: '10px', borderRadius: '10px', color: '#2dd4bf' }}>
                <KeyRound size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                  Grant Access Consent
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Legally delegate electronic health record access
                </span>
              </div>
            </div>

            {grantError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} />
                <span>{grantError}</span>
              </div>
            )}

            <form onSubmit={handleGrantConsent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Doctor Selector (Scoped to patient's tenant memberships) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Select Attending Physician (Scoped to Affiliated Facilities)
                </label>
                {loadingDoctors ? (
                  <div style={{ padding: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Loading verified practitioners...
                  </div>
                ) : doctors.length === 0 ? (
                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.82rem', color: '#fbbf24' }}>
                    No doctors found for your affiliated clinics. Ensure you are registered with an active clinic facility.
                  </div>
                ) : (
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: '#1e293b',
                      color: '#fff',
                      fontSize: '0.88rem',
                      outline: 'none'
                    }}
                  >
                    {doctors.map(doc => (
                      <option key={doc.id} value={doc.id}>
                        Dr. {doc.name} {doc.doctorProfile?.specialization ? `(${doc.doctorProfile.specialization})` : ''} — {doc.organizationName || 'Affiliated Clinic'}
                      </option>
                    ))}
                  </select>
                )}
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                  Doctor search is strictly limited to healthcare clinics where you have an active patient record.
                </span>
              </div>

              {/* Granular Scope Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Authorized Information Scope
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedScope('full_record')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: selectedScope === 'full_record' ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      background: selectedScope === 'full_record' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                      color: selectedScope === 'full_record' ? '#34d399' : 'var(--text-secondary)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <FileText size={18} />
                    <span>Full Dossier</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedScope('diagnoses_only')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: selectedScope === 'diagnoses_only' ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                      background: selectedScope === 'diagnoses_only' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.02)',
                      color: selectedScope === 'diagnoses_only' ? '#38bdf8' : 'var(--text-secondary)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Stethoscope size={18} />
                    <span>Diagnoses & Labs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedScope('prescriptions_only')}
                    style={{
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: selectedScope === 'prescriptions_only' ? '2px solid #c084fc' : '1px solid rgba(255,255,255,0.1)',
                      background: selectedScope === 'prescriptions_only' ? 'rgba(192, 132, 252, 0.15)' : 'rgba(255,255,255,0.02)',
                      color: selectedScope === 'prescriptions_only' ? '#c084fc' : 'var(--text-secondary)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Pill size={18} />
                    <span>Prescriptions</span>
                  </button>
                </div>
              </div>

              {/* Expiry / Duration */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Access Duration (Auto-Expiration)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {[
                    { label: '24 Hours', val: '1' },
                    { label: '7 Days', val: '7' },
                    { label: '30 Days', val: '30' },
                    { label: '90 Days', val: '90' },
                    { label: 'Indefinite', val: 'indefinite' }
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setSelectedDuration(opt.val)}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '6px',
                        border: selectedDuration === opt.val ? '1.5px solid #0F766E' : '1px solid rgba(255,255,255,0.1)',
                        background: selectedDuration === opt.val ? 'rgba(15, 118, 110, 0.25)' : 'transparent',
                        color: selectedDuration === opt.val ? '#5eead4' : 'var(--text-secondary)',
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Purpose */}
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Clinical Justification / Reason
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Cardiology Second Opinion Consultation"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: '#1e293b',
                    color: '#fff',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Legal Note */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Info size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  A cryptographic SHA-256 consent token will be generated. The physician will receive an instant SMS notification. You can revoke this grant anytime.
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowGrantModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={grantSubmitting || doctors.length === 0}
                  className="btn btn-primary"
                  style={{ flex: 2, background: '#0F766E', borderColor: '#0F766E' }}
                >
                  {grantSubmitting ? 'Recording Consent...' : 'Authorize & Sign Access'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {showRevokeModal && selectedConsentToRevoke && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            style={{
              background: '#111827',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px 28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setShowRevokeModal(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '10px', borderRadius: '10px', color: '#f87171' }}>
                <Ban size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                  Revoke Clinical Access
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Immediately terminates physician viewing permissions
                </span>
              </div>
            </div>

            {revokeError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem', marginBottom: '14px' }}>
                {revokeError}
              </div>
            )}

            <p style={{ color: 'var(--text-primary)', fontSize: '0.88rem', margin: '0 0 14px 0' }}>
              Are you sure you want to revoke electronic access granted to <strong>Dr. {selectedConsentToRevoke.doctor_name || 'the attending clinician'}</strong>? 
              Their authorization to view your records will be revoked instantly.
            </p>

            <form onSubmit={handleConfirmRevocation}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Revocation Reason / Note (Recorded in Audit Ledger):
                </label>
                <input
                  type="text"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. Treatment episode concluded"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: '#1e293b',
                    color: '#fff',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRevokeModal(false)}
                  style={{ flex: 1 }}
                >
                  Keep Active
                </Button>
                <Button
                  type="submit"
                  disabled={revokeSubmitting}
                  style={{ flex: 1, background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                >
                  {revokeSubmitting ? 'Revoking...' : 'Confirm Revocation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
