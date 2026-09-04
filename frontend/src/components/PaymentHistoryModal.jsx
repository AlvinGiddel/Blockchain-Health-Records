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
      backgroundColor: 'rgba(11, 37, 69, 0.65)',
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
        background: 'var(--card, #FFFFFF)',
        border: '1px solid var(--border, #E2E8F0)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '780px',
        maxHeight: '85vh',
        boxShadow: '0 20px 40px -15px rgba(11, 37, 69, 0.2)',
        color: 'var(--text-primary, #0F172A)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        margin: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border, #E2E8F0)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-secondary, #F8FAFC)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'rgba(15, 118, 110, 0.1)',
              border: '1px solid rgba(15, 118, 110, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CreditCard size={18} color="#0F766E" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary, #0B2545)' }}>
                Billing & Paystack Payment History
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary, #475569)' }}>
                Immutable financial audit records & M-Pesa receipts
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={fetchPaymentHistory}
              disabled={loading}
              style={{
                background: 'var(--card, #FFFFFF)',
                border: '1px solid var(--border, #CBD5E1)',
                color: 'var(--text-secondary, #475569)',
                borderRadius: '8px',
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.78rem',
                fontWeight: 600
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
                color: 'var(--text-secondary, #475569)',
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
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#B91C1C',
              fontSize: '0.84rem',
              marginBottom: '16px'
            }}>
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary, #64748B)' }}>
              <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 12px', color: '#0F766E' }} />
              <div>Loading payment records...</div>
            </div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary, #64748B)' }}>
              <CreditCard size={32} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary, #0B2545)' }}>No payment records found</div>
              <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                Completed Paystack license renewals will appear here with cryptographic audit receipts.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border, #E2E8F0)', color: 'var(--text-secondary, #475569)', textAlign: 'left', background: 'var(--bg-secondary, #F8FAFC)' }}>
                    <th style={{ padding: '10px 12px' }}>Reference</th>
                    <th style={{ padding: '10px 12px' }}>Facility</th>
                    <th style={{ padding: '10px 12px' }}>Plan / Days</th>
                    <th style={{ padding: '10px 12px' }}>Amount</th>
                    <th style={{ padding: '10px 12px' }}>Channel</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(item => {
                    const isSuccess = item.status === 'success';
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border, #F1F5F9)' }}>
                        <td style={{ padding: '12px 12px', fontFamily: 'monospace', color: '#0F766E', fontWeight: 600 }}>
                          <div>{item.reference}</div>
                          {item.blockchain_tx_hash && (
                            <div style={{ fontSize: '0.68rem', color: '#2563EB' }}>
                              Tx: {item.blockchain_tx_hash.slice(0, 14)}...
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 12px', fontWeight: 600 }}>
                          {item.organization_name || 'Clinic'}
                        </td>
                        <td style={{ padding: '12px 12px', color: 'var(--text-secondary, #475569)' }}>
                          <div>{item.plan_name}</div>
                          <span style={{ fontSize: '0.72rem', color: '#D97706', fontWeight: 600 }}>+{item.plan_days} days</span>
                        </td>
                        <td style={{ padding: '12px 12px', fontWeight: 700, color: isSuccess ? '#1D9E75' : 'var(--text-primary, #0F172A)' }}>
                          KES {Number(item.amount).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 12px', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600 }}>
                          {item.channel || 'mpesa'}
                        </td>
                        <td style={{ padding: '12px 12px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background: isSuccess ? '#E8F7F2' : '#FEF2F2',
                            color: isSuccess ? '#1D9E75' : '#DC2626',
                            border: `1px solid ${isSuccess ? '#A3E3CD' : '#FECACA'}`
                          }}>
                            {isSuccess ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 12px', color: 'var(--text-secondary, #64748B)', fontSize: '0.78rem' }}>
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
