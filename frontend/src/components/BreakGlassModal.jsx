import React, { useState } from 'react';
import { AlertOctagon, ShieldAlert, Clock, CheckCircle2, X } from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function BreakGlassModal({ patient, doctor, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleBreakGlass = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!reason || reason.trim().length < 10) {
      setError('Please provide a detailed emergency justification reason (at least 10 characters).');
      return;
    }

    setLoading(true);
    try {
      const data = await safeFetch('/api/auth/break-glass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: doctor.id || doctor._id,
          doctorName: doctor.name,
          patientId: patient.id || patient._id,
          patientName: patient.name,
          reason: reason.trim()
        })
      });

      setSuccess(data.message || 'Emergency break-glass access activated and logged on blockchain ledger.');
      setTimeout(() => {
        onSuccess(data);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to activate emergency break-glass protocol.');
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
        maxWidth: '520px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        boxShadow: '0 0 30px rgba(239, 68, 68, 0.25)',
        position: 'relative',
        padding: '24px'
      }}>
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

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            border: '1px solid rgba(239, 68, 68, 0.4)'
          }}>
            <ShieldAlert size={36} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '1.5rem', color: '#ef4444', marginBottom: '6px' }}>
            Emergency Break-Glass Access
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Bypass patient consent restriction for life-threatening emergency medical treatment.
          </p>
        </div>

        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          borderLeft: '4px solid #ef4444',
          padding: '12px 14px',
          borderRadius: '4px',
          marginBottom: '20px',
          fontSize: '0.82rem',
          color: 'var(--text-primary)'
        }}>
          <div style={{ fontWeight: 'bold', color: '#ef4444', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertOctagon size={16} /> Strict Cryptographic Audit Warning
          </div>
          This action will immediately override consent rules for patient <strong>{patient?.name}</strong>. An immutable emergency audit event will be recorded on the blockchain ledger and reported to network administrators.
        </div>

        {error && (
          <div className="badge-error" style={{ padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div className="badge-success" style={{ padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
            <CheckCircle2 size={16} style={{ display: 'inline', marginRight: '6px' }} />
            {success}
          </div>
        )}

        <form onSubmit={handleBreakGlass}>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', fontWeight: '600' }}>
              Emergency Justification Reason (Required)
            </label>
            <textarea
              className="form-control"
              rows={3}
              required
              placeholder="e.g. ER Trauma: Patient unconscious, acute severe reaction, vital records access required for emergency resuscitation."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1 }}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              style={{
                flex: 2,
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              disabled={loading}
            >
              <Clock size={16} />
              {loading ? 'Logging Override...' : 'Confirm Break-Glass Access'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
