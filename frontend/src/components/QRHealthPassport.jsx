import React, { useRef, useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  QrCode, ShieldCheck, Printer, Download, ExternalLink, Copy, Check, 
  Heart, Activity, AlertTriangle, User, Key, Building2, Calendar, FileText, CheckCircle2 
} from 'lucide-react';
import logoSvg from '../assets/logo.svg';

export default function QRHealthPassport({ user, records = [], onClose }) {
  const cardRef = useRef(null);

  const patientProfile = user.patientProfile || {};
  const age = patientProfile.age || 'N/A';
  const gender = patientProfile.gender || 'N/A';
  const bloodType = patientProfile.bloodType || 'N/A';
  const phone = patientProfile.phone || 'N/A';
  const allergies = Array.isArray(patientProfile.allergies)
    ? patientProfile.allergies.join(', ')
    : (patientProfile.allergies || 'None Reported');

  // Scope selection: allows proving a specific clinical visit record OR the universal patient identity
  const [selectedScope, setSelectedScope] = useState(() => {
    if (records && records.length > 0) {
      return records[0].id;
    }
    return user.id || user._id || '';
  });

  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState('');

  // Selected record metadata (if scoped to a specific clinical record)
  const activeRecord = (records || []).find(r => r.id === selectedScope);

  // Verification URL that will be encoded inside the physical QR code
  const verificationTargetId = selectedScope || user.id || user._id;
  const verificationUrl = `${window.location.origin}/?verifyRecordId=${encodeURIComponent(verificationTargetId)}`;

  useEffect(() => {
    if (!verificationTargetId) return;

    setQrLoading(true);
    setQrError('');

    QRCode.toDataURL(verificationUrl, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => {
        setQrDataUrl(url);
        setQrLoading(false);
      })
      .catch(err => {
        console.error('Failed to generate scannable QR code:', err);
        setQrError('Failed to generate cryptographic QR code image.');
        setQrLoading(false);
      });
  }, [verificationUrl, verificationTargetId]);

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const isRevoked = user.is_rejected || user.isRejected;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.82)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div className="glass-card modal-dialog" style={{
        maxWidth: '620px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '24px',
        position: 'relative'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={logoSvg} alt="Logo" style={{ width: '30px', height: '30px' }} />
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Universal Cryptographic Health Passport
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Decentralized Patient Identity & Proof-of-Work Attested Ledger
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.3rem',
              minWidth: '40px',
              minHeight: '40px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Multi-Tenant Record Selector (if patient has multiple clinic visits) */}
        {records && records.length > 0 && (
          <div style={{ 
            marginBottom: '16px', 
            padding: '12px 14px', 
            backgroundColor: 'var(--bg-secondary, rgba(15, 118, 110, 0.05))', 
            borderRadius: '10px', 
            border: '1px solid var(--border, rgba(15, 118, 110, 0.15))' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={14} color="var(--color-primary)" /> Verification Scope & Hospital Visit:
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {records.length} visit{records.length === 1 ? '' : 's'} recorded
              </span>
            </div>
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border, #cbd5e1)',
                backgroundColor: 'var(--card, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.85rem',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={user.id || user._id}>
                Universal Patient Identity Node (All Clinics & Emergency Vitals)
              </option>
              {records.map((rec, idx) => (
                <option key={rec.id} value={rec.id}>
                  Visit #{records.length - idx}: {rec.doctorName || 'Attending Physician'} &bull; {rec.diagnosis ? rec.diagnosis.slice(0, 30) : 'Clinical Consultation'} ({new Date(rec.timestamp).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Passport Card Content */}
        <div ref={cardRef} style={{
          background: 'linear-gradient(135deg, rgba(15, 118, 110, 0.08) 0%, rgba(29, 158, 117, 0.06) 100%)',
          border: '1px solid var(--glass-border, rgba(15, 118, 110, 0.2))',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
            {/* Patient Vitals & Identification */}
            <div style={{ flex: '1 1 240px', minWidth: '220px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <ShieldCheck size={20} color="var(--color-primary, #0F766E)" />
                <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-primary, #0F766E)' }}>
                  {activeRecord ? 'Cryptographically Sealed Record' : 'Verified Sovereign Patient Node'}
                </span>
              </div>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '4px', wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                {user.name}
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                ID: {verificationTargetId}
              </p>

              {/* Vitals Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px', fontSize: '0.85rem' }}>
                <div style={{ padding: '8px 10px', backgroundColor: 'rgba(255, 255, 255, 0.7)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Blood Group</span>
                  <strong style={{ color: '#dc2626', fontSize: '1.1rem' }}>{bloodType}</strong>
                </div>
                <div style={{ padding: '8px 10px', backgroundColor: 'rgba(255, 255, 255, 0.7)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Age &bull; Gender</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{age} yrs &bull; {gender}</strong>
                </div>
                <div style={{ padding: '8px 10px', backgroundColor: 'rgba(255, 255, 255, 0.7)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Emergency Phone</span>
                  <strong style={{ wordBreak: 'break-all', color: 'var(--text-primary)' }}>{phone}</strong>
                </div>
                <div style={{ padding: '8px 10px', backgroundColor: 'rgba(255, 255, 255, 0.7)', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Known Allergies</span>
                  <strong style={{ color: allergies !== 'None Reported' ? '#d97706' : 'var(--text-primary)', wordBreak: 'break-word' }}>
                    {allergies}
                  </strong>
                </div>
              </div>

              {activeRecord && (
                <div style={{ marginTop: '12px', padding: '10px', backgroundColor: 'rgba(15, 118, 110, 0.08)', borderRadius: '8px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--color-primary)' }}>
                    <FileText size={14} /> Attested Clinical Dossier
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Doctor: Dr. {activeRecord.doctorName ? activeRecord.doctorName.replace(/^Dr\.?\s*/i, '') : 'Attending Physician'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Diagnosis: <strong>{activeRecord.diagnosis || 'Clinical evaluation'}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Real Scannable QR Code Column */}
            <div style={{ margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ 
                position: 'relative', 
                width: '180px', 
                height: '180px', 
                background: '#ffffff', 
                padding: '6px', 
                borderRadius: '12px', 
                boxShadow: '0 8px 24px rgba(11, 37, 69, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {qrLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                    <div style={{ width: '32px', height: '32px', border: '3px solid #cbd5e1', borderTopColor: '#0F766E', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '0.72rem' }}>Generating QR...</span>
                  </div>
                ) : qrError ? (
                  <div style={{ color: '#ef4444', fontSize: '0.75rem', padding: '10px' }}>
                    {qrError}
                  </div>
                ) : (
                  <img
                    src={qrDataUrl}
                    alt="Verifiable Cryptographic Health Passport QR Code"
                    style={{ width: '100%', height: '100%', display: 'block', borderRadius: '8px' }}
                  />
                )}
              </div>
              <span style={{ 
                fontSize: '0.72rem', 
                color: 'var(--text-secondary)', 
                marginTop: '10px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '4px',
                fontWeight: 600
              }}>
                <QrCode size={14} color="var(--color-primary)" /> Scan with any phone camera
              </span>
            </div>
          </div>

          {/* Footer of Card */}
          <div style={{ 
            marginTop: '18px', 
            paddingTop: '12px', 
            borderTop: '1px solid var(--glass-border, rgba(0,0,0,0.1))', 
            fontSize: '0.8rem', 
            color: 'var(--text-secondary)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Key size={14} color="var(--color-primary)" />
              Key Fingerprint: {((user.publicKey || '')).slice(0, 24)}...
            </span>
            {isRevoked ? (
              <span className="badge" style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.75rem', padding: '3px 8px', fontWeight: 700 }}>
                ⚠️ Verification Revoked
              </span>
            ) : (
              <span className="badge" style={{ backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontSize: '0.75rem', padding: '3px 8px', fontWeight: 700 }}>
                ✓ Active & Blockchain Attested
              </span>
            )}
          </div>
        </div>

        {/* Verification Link Action Box */}
        <div style={{ 
          marginBottom: '18px', 
          padding: '10px 14px', 
          backgroundColor: 'var(--bg-main, #f8fafc)', 
          borderRadius: '10px', 
          border: '1px solid var(--border, #e2e8f0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: '180px', overflow: 'hidden' }}>
            <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Encoded Blockchain Verification URL
            </span>
            <span style={{ 
              display: 'block', 
              fontSize: '0.78rem', 
              color: 'var(--color-primary, #0F766E)', 
              fontFamily: 'monospace', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis' 
            }}>
              {verificationUrl}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={handleCopyLink}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border, #cbd5e1)',
                backgroundColor: 'var(--card, #ffffff)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Copy verification link to clipboard"
            >
              {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>

            <a
              href={verificationUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-primary, #0F766E)',
                color: '#ffffff',
                fontSize: '0.78rem',
                fontWeight: 600,
                textDecoration: 'none',
                cursor: 'pointer'
              }}
              title="Open Public Verification Page"
            >
              <ExternalLink size={14} /> Open Page
            </a>
          </div>
        </div>

        {/* Modal Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, minWidth: '120px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onClick={onClose}
          >
            Close Passport
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1, minWidth: '160px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onClick={handlePrint}
          >
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
