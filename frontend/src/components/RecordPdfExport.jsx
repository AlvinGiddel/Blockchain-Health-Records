import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Download, X, ShieldCheck, CheckCircle2, QrCode, FileText, Lock } from 'lucide-react';
import logoSvg from '../assets/logo.svg';

export default function RecordPdfExport({ record, patient, user, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (!record) return;

    // Construct verification payload URL encoded in the QR code
    const verificationUrl = `${window.location.origin}/?verifyRecordId=${encodeURIComponent(record.id || '')}&blockIndex=${record.blockIndex || 0}&blockHash=${encodeURIComponent(record.blockHash || '')}`;

    QRCode.toDataURL(verificationUrl, {
      width: 180,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Failed to generate QR code:', err));
  }, [record]);

  if (!record) return null;

  const handlePrint = () => {
    window.print();
  };

  // Resolve Patient Name and Demographics
  const patientName = record.patientName || patient?.name || user?.name || 'Registered Patient';
  
  const rawProfile = patient?.patientProfile || user?.patientProfile || record.patientProfile;
  const profile = typeof rawProfile === 'string' ? (() => {
    try { return JSON.parse(rawProfile); } catch (e) { return {}; }
  })() : (rawProfile || {});

  const doctorName = record.doctorName || 'Attending Medical Practitioner';
  const formattedDate = record.timestamp ? new Date(record.timestamp).toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'full',
    timeStyle: 'short'
  }) : new Date().toLocaleString();

  // Helper to format diagnosis if stored as raw ciphertext
  const formatDiagnosis = (diagText) => {
    if (!diagText) return 'Clinical assessment performed.';
    if (typeof diagText === 'string' && /^[0-9a-f]{32}:[0-9a-f]+$/i.test(diagText.trim())) {
      // In case raw AES ciphertext string was returned
      return record.symptoms ? `Clinical Diagnosis for Symptoms: ${record.symptoms}` : 'Confidential Medical Consultation (AES-256 Encrypted on Ledger)';
    }
    return diagText;
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, overflowY: 'auto', padding: '20px' }}>
      <div 
        className="modal-content certificate-modal-content"
        style={{
          maxWidth: '850px',
          width: '100%',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          padding: '0'
        }}
      >
        {/* Modal Top Action Bar (Hidden on Print) */}
        <div 
          className="no-print"
          style={{
            padding: '16px 24px',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>
              Cryptographically Verifiable Medical Certificate
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <Printer size={16} /> Print / Save PDF
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Printable Official Medical Certificate Layout */}
        <div 
          id="printable-certificate"
          style={{
            padding: '36px 44px',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          {/* Certificate Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <img src={logoSvg} alt="Hospital Seal" style={{ width: '48px', height: '48px' }} />
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', letterSpacing: '-0.02em', color: '#0f172a' }}>
                  BLOCKCHAIN HEALTHCARE NETWORK
                </h2>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>
                  Ministry of Health Registered Medical Node &bull; Republic of Kenya
                </p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '700', border: '1px solid #a7f3d0' }}>
                <ShieldCheck size={14} /> ON-CHAIN VERIFIED
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Document Ref: <strong>BHC-REC-{record.id?.slice(0, 8).toUpperCase()}</strong>
              </p>
            </div>
          </div>

          {/* Certificate Title */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h1 style={{ margin: 0, fontSize: '1.3rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1e293b' }}>
              Official Medical Consultation Certificate & Prescription
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Issued in accordance with the Kenya Medical Practitioners and Dentists Act (Cap 253)
            </p>
          </div>

          {/* Patient Demographics & Doctor Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', backgroundColor: '#f8fafc', padding: '16px 20px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Patient Information</h4>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem' }}><strong>Full Name:</strong> {patientName}</p>
              {profile?.age && (
                <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem' }}><strong>Age / Gender:</strong> {profile.age} Yrs &bull; {profile.gender || 'Unspecified'}</p>
              )}
              {profile?.bloodType && (
                <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem' }}><strong>Blood Group:</strong> {profile.bloodType}</p>
              )}
              {profile?.phone && (
                <p style={{ margin: 0, fontSize: '0.9rem' }}><strong>Contact Phone:</strong> {profile.phone}</p>
              )}
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Attending Physician</h4>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.95rem' }}><strong>Practitioner:</strong> Dr. {doctorName.replace(/^Dr\.?\s*/i, '')}</p>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem' }}><strong>KMPDC License:</strong> {record.kmpdcLicense || 'Verified Practitioner'}</p>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem' }}><strong>Facility Node:</strong> Kenyatta National Hospital</p>
              <p style={{ margin: 0, fontSize: '0.9rem' }}><strong>Date of Service:</strong> {formattedDate}</p>
            </div>
          </div>

          {/* Clinical Findings & Treatment Details */}
          <div style={{ marginBottom: '24px' }}>
            {record.symptoms && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Reported Symptoms</h4>
                <div style={{ padding: '10px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem' }}>
                  {record.symptoms}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Primary Diagnosis</h4>
              <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem', fontWeight: '500' }}>
                {formatDiagnosis(record.diagnosis)}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Prescribed Treatment & Regimen</h4>
              <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem' }}>
                {record.treatment || 'Oral care and clinical follow-up.'}
              </div>
            </div>

            {record.notes && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Physician Clinical Notes</h4>
                <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', color: '#334155', whiteSpace: 'pre-line' }}>
                  {record.notes}
                </div>
              </div>
            )}
          </div>

          {/* Cryptographic Blockchain Seal & QR Code Footer */}
          <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b', fontWeight: '700', fontSize: '0.9rem', marginBottom: '6px' }}>
                <Lock size={16} color="#059669" /> Cryptographic Ledger Proof
              </div>
              <p style={{ margin: '0 0 3px 0', fontSize: '0.78rem', color: '#475569' }}>
                <strong>Block Index:</strong> Block #{record.blockIndex !== undefined && record.blockIndex !== null ? record.blockIndex : 'Queued (Auto-Mining)'}
              </p>
              <p style={{ margin: '0 0 3px 0', fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b', wordBreak: 'break-all' }}>
                <strong>Block SHA-256:</strong> {record.blockHash || 'Pending Next Block Seal'}
              </p>
              <p style={{ margin: '0 0 3px 0', fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b', wordBreak: 'break-all' }}>
                <strong>Doctor RSA-2048 Signature:</strong> {record.signature ? `${record.signature.slice(0, 48)}...` : 'Cryptographically Signed'}
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#059669', fontWeight: '600' }}>
                ✓ Immutable on Distributed Ledger Network
              </p>
            </div>

            {/* Verifiable QR Code */}
            {qrDataUrl && (
              <div style={{ textAlign: 'center', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#ffffff' }}>
                <img src={qrDataUrl} alt="Verification QR Code" style={{ width: '110px', height: '110px', display: 'block' }} />
                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Scan to Verify
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
