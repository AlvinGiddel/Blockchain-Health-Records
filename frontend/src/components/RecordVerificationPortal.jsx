import React, { useState } from 'react';
import { ShieldCheck, Search, AlertTriangle, CheckCircle2, FileText, Lock, Key, X } from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function RecordVerificationPortal({ recordId: initialRecordId, onClose }) {
  const [recordId, setRecordId] = useState(initialRecordId || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    if (!recordId || !recordId.trim()) {
      setError('Please enter a valid Record UUID.');
      return;
    }

    setError('');
    setResult(null);
    setLoading(true);

    try {
      const data = await safeFetch('/api/records/verify-seal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: recordId.trim() })
      });

      setResult(data);
    } catch (err) {
      setError(err.message || 'Verification query failed.');
    } finally {
      setLoading(false);
    }
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
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            background: 'var(--glass-glow)',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <ShieldCheck size={32} color="var(--color-primary)" />
          </div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '4px' }}>Cryptographic Seal Verification</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Verify medical record integrity against SHA-256 block hashes and RSA doctor signatures.
          </p>
        </div>

        <form onSubmit={handleVerify} style={{ marginBottom: '20px' }}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Medical Record ID (UUID)</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-control"
                style={{ flex: '1 1 200px', minHeight: '44px' }}
                placeholder="e.g. 5e5d6851-9b8b-411e-812a-d684e3ae2cd9"
                value={recordId}
                onChange={(e) => setRecordId(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ minHeight: '44px', minWidth: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                disabled={loading}
              >
                <Search size={16} /> {loading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
              Tip: Enter a 36-character Record UUID (e.g., <code style={{ color: 'var(--color-primary)' }}>4835312b-2cca-489b-b9c8-d58b6e0e3711</code>). You can also click "Verify Seal" directly from any record card.
            </span>
          </div>
        </form>

        {error && (
          <div className="badge-error" style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div style={{
            background: result.isVerified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${result.isVerified ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              {result.isVerified ? (
                <CheckCircle2 size={24} color="#10b981" />
              ) : (
                <AlertTriangle size={24} color="#ef4444" />
              )}
              <div>
                <h4 style={{ margin: 0, color: result.isVerified ? '#10b981' : '#ef4444' }}>
                  {result.isVerified ? 'IMMUTABLE RECORD VERIFIED' : 'VERIFICATION FAILED'}
                </h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {result.isVerified ? `Mined in Block #${result.blockIndex}` : 'Record data or signature is invalid/tampered'}
                </span>
              </div>
            </div>

            {result.isVerified && (
              <div style={{ fontSize: '0.82rem', display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Signing Physician:</span>
                  <strong>{result.doctorName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Timestamp:</span>
                  <span>{result.timestamp}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>AES Data Encryption:</span>
                  <span style={{ color: 'var(--color-primary)' }}>AES-256-CBC Active</span>
                </div>
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--glass-border)' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>SHA-256 Digital Signature:</span>
                  <code style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px', wordBreak: 'break-all', display: 'block' }}>
                    {result.signature || 'N/A'}
                  </code>
                </div>
              </div>
            )}
          </div>
        )}

        {onClose && (
          <button
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: '20px' }}
            onClick={onClose}
          >
            Close Portal
          </button>
        )}
      </div>
    </div>
  );
}
