import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, CheckCircle, XCircle, Clock, X, Hash, RefreshCw, Building2, Phone } from 'lucide-react';
import { safeFetch } from '../utils/api';

export default function PaymentHistoryModal({ isOpen, onClose, user, organizationId }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchPaymentHistory();
    }
  }, [isOpen]);

  const fetchPaymentHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const url = organizationId 
        ? `/api/payments/history?organizationId=${organizationId}` 
        : '/api/payments/history';

      const data = await safeFetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (data.payments) {
        setPayments(data.payments);
      }
    } catch (err) {
      setError(err.message || 'Failed to load billing history.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const modalNode = (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(5, 5, 15, 0.88)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      padding: '16px',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #111827 0%, #1f2937 100%)',
        border: '1px solid rgba(14, 165, 233, 0.4)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '780px',
        maxHeight: '85vh',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
        color: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        margin: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(14, 165, 233, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CreditCard size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                Billing & Paystack Payment History
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                Immutable financial audit records & M-Pesa receipts
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={fetchPaymentHistory}
              disabled={loading}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                borderRadius: '8px',
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.78rem'
              }}
            >
              <RefreshCw size={13} className={loading ? 'spinning' : ''} />
              Refresh
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '0.84rem',
              marginBottom: '16px'
            }}>
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 12px' }} />
              <div>Loading payment records...</div>
            </div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <CreditCard size={32} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>No payment records found</div>
              <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                Completed Paystack license renewals will appear here with cryptographic audit receipts.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Reference</th>
                    <th style={{ padding: '8px 10px' }}>Facility</th>
                    <th style={{ padding: '8px 10px' }}>Plan / Days</th>
                    <th style={{ padding: '8px 10px' }}>Amount</th>
                    <th style={{ padding: '8px 10px' }}>Channel</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(item => {
                    const isSuccess = item.status === 'success';
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '10px 10px', fontFamily: 'monospace', color: '#38bdf8' }}>
                          <div>{item.reference}</div>
                          {item.blockchain_tx_hash && (
                            <div style={{ fontSize: '0.68rem', color: '#a78bfa' }}>
                              Tx: {item.blockchain_tx_hash.slice(0, 14)}...
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', fontWeight: 500 }}>
                          {item.organization_name || 'Clinic'}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#cbd5e1' }}>
                          <div>{item.plan_name}</div>
                          <span style={{ fontSize: '0.72rem', color: '#f59e0b' }}>+{item.plan_days} days</span>
                        </td>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: isSuccess ? '#10b981' : '#cbd5e1' }}>
                          KES {Number(item.amount).toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 10px', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                          {item.channel || 'mpesa'}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isSuccess ? '#34d399' : '#f87171',
                            border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                          }}>
                            {isSuccess ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', color: '#94a3b8', fontSize: '0.78rem' }}>
                          {item.paid_at || item.created_at ? new Date(item.paid_at || item.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}
