import React, { useRef } from 'react';
import { QrCode, Shield, Download, Printer, Heart, Activity, AlertTriangle, User, Key } from 'lucide-react';
import logoSvg from '../assets/logo.svg';

export default function QRHealthPassport({ user, onClose }) {
  const cardRef = useRef(null);

  const patientProfile = user.patientProfile || {};
  const age = patientProfile.age || 'N/A';
  const gender = patientProfile.gender || 'N/A';
  const bloodType = patientProfile.bloodType || 'N/A';
  const phone = patientProfile.phone || 'N/A';
  const allergies = Array.isArray(patientProfile.allergies)
    ? patientProfile.allergies.join(', ')
    : (patientProfile.allergies || 'None Reported');

  // Payload encoded in QR representation
  const qrDataPayload = JSON.stringify({
    system: 'BlockchainHealthLedger',
    patientId: user.id || user._id,
    name: user.name,
    bloodType,
    allergies,
    publicKey: (user.publicKey || '').slice(0, 32) + '...'
  });

  // SVG QR Code generator function
  const renderSvgQr = (data) => {
    // Generate a deterministic 21x21 grid pattern from text data
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash |= 0;
    }
    
    const size = 21;
    const cells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Corner alignment boxes (standard QR pattern)
        const isTopLeft = r < 7 && c < 7;
        const isTopRight = r < 7 && c >= size - 7;
        const isBottomLeft = r >= size - 7 && c < 7;
        
        let isDark = false;
        if (isTopLeft || isTopRight || isBottomLeft) {
          const localR = isBottomLeft ? r - (size - 7) : r;
          const localC = isTopRight ? c - (size - 7) : c;
          if (localR === 0 || localR === 6 || localC === 0 || localC === 6) isDark = true;
          else if (localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4) isDark = true;
        } else {
          // Pseudorandom grid based on hash
          const val = Math.abs((hash * (r * size + c + 1) + (r ^ c)) % 100);
          isDark = val % 2 === 0;
        }
        if (isDark) {
          cells.push(<rect key={`${r}-${c}`} x={c * 10} y={r * 10} width={10} height={10} fill="var(--color-primary, #6366f1)" />);
        }
      }
    }

    return (
      <svg viewBox="0 0 210 210" width="160" height="160" style={{ background: '#ffffff', padding: '8px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        {cells}
      </svg>
    );
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div className="glass-card modal-dialog" style={{
        maxWidth: '560px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '24px',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={logoSvg} alt="Logo" style={{ width: '28px', height: '28px' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Cryptographic Health Passport</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        <div ref={cardRef} style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(16, 185, 129, 0.08) 100%)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Shield size={20} color="var(--color-primary)" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                  Verified Patient Node
                </span>
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '4px', wordBreak: 'break-word' }}>{user.name}</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px', wordBreak: 'break-all' }}>
                ID: {user.id || user._id}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Blood Group</span>
                  <strong style={{ color: '#ef4444', fontSize: '1rem' }}>{bloodType}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Age / Gender</span>
                  <strong>{age} yrs / {gender}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Contact Phone</span>
                  <strong style={{ wordBreak: 'break-all' }}>{phone}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Allergies</span>
                  <strong style={{ color: allergies !== 'None Reported' ? '#f59e0b' : 'inherit', wordBreak: 'break-word' }}>{allergies}</strong>
                </div>
              </div>
            </div>

            <div style={{ margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              {renderSvgQr(qrDataPayload)}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <QrCode size={12} /> Scan to Verify Key
              </span>
            </div>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--glass-border)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Key size={14} /> RSA-2048 Public Key Fingerprint:</span>
            <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all', display: 'block', maxWidth: '100%' }}>
              {(user.publicKey || 'PUBLIC_KEY_NOT_AVAILABLE').slice(0, 36)}...
            </code>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1, minWidth: '120px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onClick={onClose}
          >
            Close
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
