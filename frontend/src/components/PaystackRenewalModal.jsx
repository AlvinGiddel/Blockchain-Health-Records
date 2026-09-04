import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  CreditCard, Shield, CheckCircle, AlertTriangle, 
  Clock, X, ArrowRight, ExternalLink, RefreshCw, Zap, Phone, Sparkles 
} from 'lucide-react';
import { safeFetch } from '../utils/api';

/**
 * Loads Paystack Inline Script dynamically
 */
function loadPaystackScript() {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) {
      return resolve(window.PaystackPop);
    }
    const existingScript = document.getElementById('paystack-inline-js');
    if (existingScript) {
      existingScript.onload = () => resolve(window.PaystackPop);
      return;
    }
    const script = document.createElement('script');
    script.id = 'paystack-inline-js';
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => resolve(window.PaystackPop);
    script.onerror = () => reject(new Error('Failed to load Paystack Inline SDK.'));
    document.body.appendChild(script);
  });
}

export default function PaystackRenewalModal({ organization, user, isOpen, onClose, onSuccess }) {
  const [plans, setPlans] = useState([
    { id: 'plan_1m', name: 'Standard Monthly Renewal', days: 30, amountKES: 20000, popular: true },
    { id: 'plan_3m', name: 'Quarterly Clinic Plan', days: 90, amountKES: 54000, popular: false },
    { id: 'plan_1y', name: 'Annual Medical License', days: 365, amountKES: 192000, popular: false }
  ]);
  const [selectedPlanId, setSelectedPlanId] = useState('plan_1m');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paystackReady, setPaystackReady] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [isSimulatedMode, setIsSimulatedMode] = useState(false);
  const [pendingReference, setPendingReference] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccessData(null);
      setPendingReference(null);
      loadPaystackScript()
        .then(() => setPaystackReady(true))
        .catch(() => setPaystackReady(false));
      fetchPlans();
    }
  }, [isOpen]);

  const fetchPlans = async () => {
    try {
      const data = await safeFetch('/api/payments/plans');
      if (data.plans && Array.isArray(data.plans)) {
        setPlans(data.plans);
      }
    } catch (err) {
      console.warn('Could not fetch remote plans, using defaults:', err.message);
    }
  };

  if (!isOpen || !organization) return null;

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || plans[0];

  // Fair expiration calculation: GREATEST(currentExpiry, today) + plan.days
  const currentExpiryDate = organization.license_expires_at || organization.licenseExpiresAt 
    ? new Date(organization.license_expires_at || organization.licenseExpiresAt) 
    : new Date();
  
  const baseDate = currentExpiryDate > new Date() ? currentExpiryDate : new Date();
  const projectedExpiry = new Date(baseDate.getTime() + (selectedPlan.days * 24 * 60 * 60 * 1000));

  const handleStartPayment = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const initRes = await safeFetch('/api/payments/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-organization-id': organization.id
        },
        body: JSON.stringify({
          planId: selectedPlan.id,
          organizationId: organization.id,
          email: user?.email
        })
      });

      if (!initRes.success || !initRes.reference) {
        throw new Error(initRes.error || 'Failed to initialize Paystack transaction.');
      }

      const reference = initRes.reference;
      const cleanKey = (initRes.publicKey || '').trim();

      // Check if real Paystack Public Key is configured or if mock mode is active
      const hasRealKey = cleanKey && cleanKey.startsWith('pk_') && !cleanKey.includes('placeholder');

      if (window.PaystackPop && hasRealKey) {
        // Open real Paystack Inline Popup (M-Pesa STK Push / Card)
        const setupOptions = {
          key: cleanKey,
          email: user?.email || 'admin@health.go.ke',
          amount: Math.round(selectedPlan.amountKES * 100), // in subunits (cents/kobo)
          currency: 'KES',
          ref: reference,
          channels: ['card', 'mobile_money'],
          metadata: {
            organization_id: organization.id,
            plan_id: selectedPlan.id
          },
          callback: function (response) {
            // Instant verification after popup completion
            verifyAndFinalizePayment(reference);
          },
          onClose: function () {
            setLoading(false);
          }
        };

        // If backend already generated a verified access_code, supply it directly
        if (initRes.access_code) {
          setupOptions.access_code = initRes.access_code;
        }

        const handler = window.PaystackPop.setup(setupOptions);
        handler.openIframe();
      } else {
        // In local/sandbox testing without live key: offer simulated one-click checkout
        setPendingReference(reference);
        setIsSimulatedMode(true);
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || 'Payment initiation failed.');
      setLoading(false);
    }
  };

  const verifyAndFinalizePayment = async (ref) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const verifyRes = await safeFetch(`/api/payments/verify/${encodeURIComponent(ref)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (verifyRes.success) {
        setSuccessData(verifyRes);
        if (onSuccess) {
          onSuccess(verifyRes);
        }
      } else {
        throw new Error(verifyRes.message || 'Payment verification failed.');
      }
    } catch (err) {
      setError(err.message || 'Failed to verify payment with server.');
    } finally {
      setLoading(false);
    }
  };

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
        maxWidth: '560px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px -15px rgba(11, 37, 69, 0.2)',
        color: 'var(--text-primary, #0F172A)',
        overflow: 'hidden',
        margin: 'auto'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border, #E2E8F0)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-secondary, #F8FAFC)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'rgba(15, 118, 110, 0.1)',
              border: '1px solid rgba(15, 118, 110, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CreditCard size={20} color="#0F766E" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary, #0B2545)' }}>
                Renew Clinic SaaS License
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary, #475569)' }}>
                Paystack Gateway • M-Pesa STK Push & Cards
              </p>
            </div>
          </div>
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

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#B91C1C',
              fontSize: '0.85rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Success State */}
          {successData ? (
            <div style={{ textAlign: 'center', padding: '16px 8px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#E8F7F2',
                border: '2px solid #A3E3CD',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <CheckCircle size={36} color="#1D9E75" />
              </div>
              <h4 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0', color: '#0B2545' }}>
                License Successfully Renewed!
              </h4>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #475569)', margin: '0 0 20px 0' }}>
                {successData.message}
              </p>

              <div style={{
                background: 'var(--bg-secondary, #F8FAFC)',
                border: '1px solid var(--border, #E2E8F0)',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'left',
                fontSize: '0.85rem',
                marginBottom: '24px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary, #475569)' }}>Facility:</span>
                  <span style={{ fontWeight: 600 }}>{organization.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary, #475569)' }}>Paystack Reference:</span>
                  <span style={{ fontFamily: 'monospace', color: '#0F766E', fontWeight: 600 }}>{successData.payment?.reference}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary, #475569)' }}>Amount Paid:</span>
                  <span style={{ fontWeight: 700, color: '#1D9E75' }}>KES {Number(successData.payment?.amount || 0).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary, #475569)' }}>Channel:</span>
                  <span style={{ textTransform: 'uppercase' }}>{successData.payment?.channel || 'M-Pesa'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary, #475569)' }}>New Expiration:</span>
                  <span style={{ fontWeight: 700, color: '#D97706' }}>
                    {new Date(successData.organization?.license_expires_at).toLocaleDateString()}
                  </span>
                </div>
                {successData.payment?.blockchain_tx_hash && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border, #E2E8F0)', paddingTop: '8px', marginTop: '8px' }}>
                    <span style={{ color: 'var(--text-secondary, #475569)' }}>Blockchain Ledger Seal:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#2563EB' }}>
                      {successData.payment.blockchain_tx_hash.slice(0, 16)}...
                    </span>
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary"
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  background: '#0F766E',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Close & Return to Dashboard
              </button>
            </div>
          ) : isSimulatedMode ? (
            /* Development Sandbox Simulation Screen */
            <div>
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1D4ED8', fontWeight: 600, marginBottom: '6px' }}>
                  <Sparkles size={16} />
                  <span>Sandbox Test Mode Active</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#1E40AF', lineHeight: 1.5 }}>
                  Live Paystack keys are not set in `.env`. The system has generated reference <code style={{ color: '#0F766E', fontWeight: 600 }}>{pendingReference}</code>. You can simulate completing an M-Pesa STK push or Card payment to verify atomic idempotency, fair extension, and blockchain sealing.
                </p>
              </div>

              <div style={{
                background: 'var(--bg-secondary, #F8FAFC)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid var(--border, #E2E8F0)',
                marginBottom: '20px',
                fontSize: '0.85rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary, #475569)' }}>Plan:</span>
                  <span style={{ fontWeight: 600 }}>{selectedPlan.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary, #475569)' }}>Amount:</span>
                  <span style={{ fontWeight: 700, color: '#1D9E75' }}>KES {selectedPlan.amountKES.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary, #475569)' }}>Fair Extension:</span>
                  <span style={{ color: '#D97706', fontWeight: 600 }}>
                    +{selectedPlan.days} Days → {projectedExpiry.toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsSimulatedMode(false)}
                  style={{ flex: 1, padding: '12px' }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => verifyAndFinalizePayment(pendingReference)}
                  disabled={loading}
                  style={{
                    flex: 2,
                    padding: '12px',
                    background: '#0F766E',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Phone size={16} />
                  {loading ? 'Verifying & Mining...' : 'Simulate M-Pesa Payment Success'}
                </button>
              </div>
            </div>
          ) : (
            /* Plan Selection & Checkout Initiation */
            <div>
              {/* Facility & Expiry Overview */}
              <div style={{
                background: 'var(--bg-secondary, #F8FAFC)',
                borderRadius: '12px',
                padding: '14px 18px',
                border: '1px solid var(--border, #E2E8F0)',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #475569)', textTransform: 'uppercase', fontWeight: 600 }}>Target Facility</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary, #0B2545)' }}>{organization.name}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #475569)', textTransform: 'uppercase', fontWeight: 600 }}>Current Expiry</div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: currentExpiryDate < new Date() ? '#DC2626' : '#1D9E75' }}>
                    {currentExpiryDate.toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Plan Options */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary, #475569)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '10px' }}>
                  Select Subscription Plan
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {plans.map(plan => {
                    const isSelected = selectedPlanId === plan.id;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        style={{
                          padding: '14px 16px',
                          borderRadius: '10px',
                          border: isSelected ? '2px solid #0F766E' : '1px solid var(--border, #E2E8F0)',
                          background: isSelected ? 'rgba(15, 118, 110, 0.06)' : 'var(--card, #FFFFFF)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: isSelected ? '#0F766E' : 'var(--text-primary, #0B2545)' }}>{plan.name}</span>
                            {plan.popular && (
                              <span style={{
                                fontSize: '0.65rem',
                                background: '#0F766E',
                                color: '#fff',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontWeight: 700
                              }}>
                                MOST POPULAR
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #475569)', marginTop: '2px' }}>
                            Adds +{plan.days} days operational license
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F766E' }}>
                            KES {plan.amountKES.toLocaleString()}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #64748B)' }}>
                            KES {Math.round(plan.days === 365 ? plan.amountKES / 12 : plan.amountKES / (plan.days / 30)).toLocaleString()}/mo
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Fair Extension Calculation Preview */}
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                fontSize: '0.8rem',
                color: '#92400E',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Clock size={18} style={{ flexShrink: 0, color: '#D97706' }} />
                <span>
                  <strong>Fair Extension Guarantee:</strong> Days are added from {currentExpiryDate > new Date() ? 'your remaining balance' : 'today'}. New expiration will be <strong>{projectedExpiry.toLocaleDateString()}</strong>.
                </span>
              </div>

              {/* Checkout Action Button */}
              <button
                type="button"
                onClick={handleStartPayment}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  background: '#0F766E',
                  border: 'none',
                  color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)'
                }}
              >
                <CreditCard size={18} />
                {loading ? 'Connecting to Paystack...' : `Pay KES ${selectedPlan.amountKES.toLocaleString()} with Paystack`}
              </button>

              <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-secondary, #64748B)' }}>
                🔒 Secured by Paystack • Supports M-Pesa STK Push & Visa/Mastercard
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}
