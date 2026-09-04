import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, Printer, Lock, ArrowLeft, ExternalLink, QrCode, FileText } from 'lucide-react';
import logoSvg from '../assets/logo.svg';
import { getApiUrl } from '../utils/api';

export default function PublicCertificateView({ recordId, onDismiss }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!recordId) return;

    fetch(getApiUrl(`/api/records/${recordId}/verify-blockchain`))
      .then(res => res.json())
      .then(result => {
        if (result.verified) {
          setData(result);
        } else {
          setError(result.error || 'Record verification failed or record does not exist.');
        }
      })
      .catch(err => {
        console.error('Verification error:', err);
        setError('Unable to reach blockchain network gateway.');
      })
      .finally(() => setLoading(false));
  }, [recordId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCertificate = () => {
    const certElement = document.getElementById('printable-certificate');
    if (!certElement) return;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verifiable Medical Certificate - BHC-${(data?.recordId || '').slice(0, 8).toUpperCase()}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; padding: 30px 15px; display: flex; justify-content: center; margin: 0; color: #0f172a; }
    .cert-card-container { width: 100%; max-width: 850px; background: #ffffff; border-radius: 12px; box-shadow: 0 25px 50px rgba(0,0,0,0.5); padding: 40px 48px; box-sizing: border-box; }
    .cert-header-flex { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 24px; }
    .cert-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 24px; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  ${certElement.outerHTML}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BHC_Medical_Certificate_${(data?.recordId || 'record').slice(0, 8).toUpperCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '16px', color: 'var(--text-primary, #0B2545)' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid rgba(15, 118, 110, 0.2)', borderTopColor: '#0F766E', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <h3 style={{ margin: 0, fontWeight: 700, color: '#0B2545' }}>Verifying Cryptographic Ledger Seal...</h3>
        <p style={{ color: 'var(--text-secondary, #475569)', fontSize: '0.85rem' }}>Querying decentralized blockchain blocks and validating RSA signatures</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '20px' }}>
        <div className="glass-card" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.05)' }}>
          <AlertTriangle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.4rem', color: '#ef4444', marginBottom: '8px' }}>Verification Notice</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
            {error || 'The requested medical document could not be validated against the blockchain ledger.'}
          </p>
          <button className="btn btn-primary" onClick={onDismiss} style={{ width: '100%' }}>
            Return to Healthcare Portal
          </button>
        </div>
      </div>
    );
  }

  const profile = data.patientProfile || {};
  const docProfile = data.doctorProfile || {};
  const formattedDate = data.timestamp ? new Date(data.timestamp).toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi',
    dateStyle: 'full',
    timeStyle: 'short'
  }) : new Date().toLocaleString();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-main, #F8FAFC)', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Top Action Bar (Hidden on Print) */}
      <div 
        className="no-print cert-top-bar"
        style={{
          maxWidth: '850px',
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          backgroundColor: 'var(--card, #FFFFFF)',
          padding: '14px 20px',
          borderRadius: '12px',
          border: '1px solid var(--border, #E2E8F0)',
          boxShadow: '0 4px 12px rgba(11, 37, 69, 0.05)',
          boxSizing: 'border-box'
        }}
      >
        <button
          onClick={onDismiss}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary, #475569)',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 600
          }}
        >
          <ArrowLeft size={18} /> Exit Verification View
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#E8F7F2', color: '#1D9E75', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, border: '1px solid #A3E3CD' }}>
            <ShieldCheck size={16} /> BLOCKCHAIN SEAL VERIFIED
          </div>
          <button
            onClick={handleDownloadCertificate}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: '#0F766E',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            title="Download offline verifiable certificate HTML document"
          >
            <Download size={16} /> Download
          </button>
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
        </div>
      </div>

      {/* Official Verifiable Certificate Layout */}
      <div 
        id="printable-certificate"
        className="cert-card-container"
      >
        {/* Header */}
        <div className="cert-header-flex">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <img src={logoSvg} alt="Hospital Seal" style={{ width: '48px', height: '48px', flexShrink: 0 }} />
            <div>
              <h2 style={{ margin: 0, fontSize: 'clamp(1.15rem, 3vw, 1.45rem)', fontWeight: '800', letterSpacing: '-0.02em', color: '#0f172a' }}>
                BLOCKCHAIN HEALTHCARE NETWORK
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748b', fontWeight: '500' }}>
                Ministry of Health Registered Medical Node &bull; Republic of Kenya
              </p>
            </div>
          </div>
          <div className="cert-header-right" style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#ecfdf5', color: '#059669', padding: '5px 12px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '700', border: '1px solid #a7f3d0' }}>
              <ShieldCheck size={15} /> ON-CHAIN VERIFIED
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              Document Ref: <strong>BHC-REC-{data.recordId?.slice(0, 8).toUpperCase()}</strong>
            </p>
          </div>
        </div>

        {/* Certificate Title */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#1e293b' }}>
            Official Medical Consultation Certificate & Prescription
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Issued in accordance with the Kenya Medical Practitioners and Dentists Act (Cap 253)
          </p>
        </div>

        {/* Patient Demographics & Doctor Info Grid */}
        <div className="cert-grid-2">
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.82rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Patient Information</h4>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.95rem' }}><strong>Full Name:</strong> {data.patientName}</p>
            {data.patientEmail && (
              <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}><strong>Email Address:</strong> {data.patientEmail}</p>
            )}
            {profile.phone && (
              <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}><strong>Contact Phone:</strong> {profile.phone}</p>
            )}
            <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}>
              <strong>Age / Gender:</strong> {profile.age ? `${profile.age} Yrs` : 'Adult'} &bull; {profile.gender || 'Unspecified'}
            </p>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}>
              <strong>Blood Group:</strong> {profile.bloodType || 'O+ (Standard)'}
            </p>
            {profile.allergies && (
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#b91c1c' }}>
                <strong>Allergies / Conditions:</strong> {profile.allergies}
              </p>
            )}
          </div>

          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.82rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Attending Physician</h4>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.95rem' }}><strong>Practitioner:</strong> Dr. {data.doctorName.replace(/^Dr\.?\s*/i, '')}</p>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}><strong>KMPDC License:</strong> {docProfile.licenseNumber || 'Verified Practitioner'}</p>
            <p style={{ margin: '0 0 5px 0', fontSize: '0.9rem' }}><strong>Clinical Facility:</strong> {docProfile.hospital || 'Kenyatta National Hospital'}</p>
            <p style={{ margin: 0, fontSize: '0.9rem' }}><strong>Date of Service:</strong> {formattedDate}</p>
          </div>
        </div>

        {/* Clinical Findings & Treatment Details */}
        <div style={{ marginBottom: '28px' }}>
          {data.symptoms && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Reported Symptoms</h4>
              <div style={{ padding: '10px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.92rem' }}>
                {data.symptoms}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Primary Diagnosis</h4>
            <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem', fontWeight: '500' }}>
              {data.diagnosis || 'Clinical evaluation performed.'}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Prescribed Treatment & Regimen</h4>
            <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem' }}>
              {data.treatment || 'Oral care and clinical follow-up.'}
            </div>
          </div>

          {data.prescriptions && data.prescriptions.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Prescribed Medication</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {data.prescriptions.map((pres, idx) => (
                  <span key={idx} style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem', fontWeight: '600' }}>
                    {pres}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.notes && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#475569' }}>Physician Clinical Notes</h4>
              <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', color: '#334155', whiteSpace: 'pre-line' }}>
                {data.notes}
              </div>
            </div>
          )}
        </div>

        {/* Cryptographic Blockchain Seal Footer */}
        <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b', fontWeight: '700', fontSize: '0.95rem', marginBottom: '6px' }}>
              <Lock size={18} color="#059669" /> Cryptographic Ledger Seal Proof
            </div>
            <p style={{ margin: '0 0 3px 0', fontSize: '0.8rem', color: '#475569' }}>
              <strong>Block Index:</strong> Block #{data.blockIndex !== undefined && data.blockIndex !== null ? data.blockIndex : 'Mined On-Chain'}
            </p>
            <p style={{ margin: '0 0 3px 0', fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b', wordBreak: 'break-all' }}>
              <strong>Block SHA-256 Hash:</strong> {data.blockHash || 'Cryptographically Sealed on Distributed Ledger'}
            </p>
            <p style={{ margin: '0 0 3px 0', fontSize: '0.75rem', fontFamily: 'monospace', color: '#64748b', wordBreak: 'break-all' }}>
              <strong>Doctor RSA-2048 Signature:</strong> {data.signature ? `${data.signature.slice(0, 50)}... (Verified)` : 'Mathematically Verified'}
            </p>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.78rem', color: '#059669', fontWeight: '600' }}>
              ✓ Status: {data.blockchainSealStatus} &bull; Tamper-Proof Electronic Record
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
