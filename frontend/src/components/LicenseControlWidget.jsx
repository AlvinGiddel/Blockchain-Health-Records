import React, { useEffect, useState, useRef } from 'react';
import { Shield, Server, RefreshCw, AlertTriangle, CheckCircle, Clock, Lock, Key, Plus, Stethoscope, Users, UserCheck, X, Activity, ToggleLeft, ToggleRight, Building2, Ban, Check, CreditCard, Search } from 'lucide-react';
import { safeFetch } from '../utils/api';
import PaystackRenewalModal from './PaystackRenewalModal';
import PaymentHistoryModal from './PaymentHistoryModal';
import SearchableSelect from './SearchableSelect';

export default function LicenseControlWidget({ user, refreshTrigger }) {
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  // Active Interactive Card Modal State: 'license' | 'security' | 'schedule' | 'kmpdc' | null
  const [activeModal, setActiveModal] = useState(null);

  // Multi-Tenant Organizations State & Search
  const [organizations, setOrganizations] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgActionLoading, setOrgActionLoading] = useState(null);
  const [orgStatusMsg, setOrgStatusMsg] = useState('');
  const [orgErrorMsg, setOrgErrorMsg] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [orgLimit, setOrgLimit] = useState(5); // Default to showing top 5 clinics with expander

  // Statutory Oracle State (KMPDC Doctors & NCK Nurses)
  const [activeOracleTab, setActiveOracleTab] = useState('kmpdc'); // 'kmpdc' | 'nck'
  const [selectedRegulator, setSelectedRegulator] = useState('kmpdc'); // 'kmpdc' | 'nck'
  const [practitioners, setPractitioners] = useState([]);
  const [loadingPractitioners, setLoadingPractitioners] = useState(false);
  const [nckPractitioners, setNckPractitioners] = useState([]);
  const [loadingNckPractitioners, setLoadingNckPractitioners] = useState(false);
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [practitionerSearch, setPractitionerSearch] = useState('');
  const [oracleLimit, setOracleLimit] = useState(5); // Default to top 5 practitioners with expander

  // Add Practitioner Form State
  const [newLicense, setNewLicense] = useState('');
  const [newName, setNewName] = useState('');
  const [newCadre, setNewCadre] = useState('Medical Practitioner');
  const [newSpec, setNewSpec] = useState('General Practice');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [customFacilityName, setCustomFacilityName] = useState('');
  const [newFacility, setNewFacility] = useState('');
  const [addDoctorLoading, setAddDoctorLoading] = useState(false);
  const [addDoctorError, setAddDoctorError] = useState('');
  const [addDoctorSuccess, setAddDoctorSuccess] = useState('');

  // Live Pre-flight Duplicate & Portal Verification Inspection States
  const debounceTimerRef = useRef(null);
  const [checkingLicense, setCheckingLicense] = useState(false);
  const [licenseDuplicate, setLicenseDuplicate] = useState(null);
  const [liveVerification, setLiveVerification] = useState(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const checkLicensePreflight = async (licVal, docName, reg = selectedRegulator) => {
    const cleanLic = (licVal || '').trim().toUpperCase();
    if (!cleanLic || cleanLic.length < 3) {
      setLicenseDuplicate(null);
      setLiveVerification(null);
      setCheckingLicense(false);
      setConfirmOverwrite(false);
      return;
    }

    setCheckingLicense(true);
    try {
      const token = localStorage.getItem('token');
      const inspectUrl = reg === 'nck'
        ? `/api/nck/inspect?license=${encodeURIComponent(cleanLic)}&name=${encodeURIComponent(docName || '')}`
        : `/api/kmpdc/inspect?license=${encodeURIComponent(cleanLic)}&name=${encodeURIComponent(docName || '')}`;

      const data = await safeFetch(inspectUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (data.existsLocally && data.existingRecord) {
        setLicenseDuplicate({
          isDuplicate: true,
          record: data.existingRecord
        });
      } else {
        setLicenseDuplicate(null);
        setConfirmOverwrite(false);
      }

      setLiveVerification({
        formatValid: data.formatValid,
        liveVerified: data.liveVerified,
        liveRecord: data.liveRecord,
        nameMatchScore: data.nameMatchScore,
        nameMismatch: data.nameMismatch,
        referenceName: data.referenceName
      });
    } catch (err) {
      console.warn('Pre-flight license check notice:', err.message);
    } finally {
      setCheckingLicense(false);
    }
  };

  const debouncedCheckLicense = (licVal, docName, reg = selectedRegulator) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      checkLicensePreflight(licVal, docName, reg);
    }, 350);
  };

  const resetAddDoctorForm = (reg = selectedRegulator) => {
    setNewLicense('');
    setNewName('');
    setNewCadre(reg === 'nck' ? 'nurse' : 'Medical Practitioner');
    setNewSpec(reg === 'nck' ? 'Registered Nursing' : 'General Practice');
    setSelectedOrgId('');
    setCustomFacilityName('');
    setNewFacility('');
    setAddDoctorError('');
    setAddDoctorSuccess('');
    setLicenseDuplicate(null);
    setLiveVerification(null);
    setCheckingLicense(false);
    setConfirmOverwrite(false);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  };

  // Paystack Renewal & Billing States
  const [paystackModalOrg, setPaystackModalOrg] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [clinicOrg, setClinicOrg] = useState(null);
  const [clinicOrgLoading, setClinicOrgLoading] = useState(false);

  const fetchLicenseStatus = async () => {
    try {
      setError('');
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/license/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (data.license) {
        setLicenseInfo(data.license);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch license authority status.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizations = async () => {
    if (user?.role !== 'super_admin') return;
    setLoadingOrgs(true);
    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/admin/organizations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (data.organizations) {
        setOrganizations(data.organizations);
      }
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const handleToggleOrgStatus = async (orgId, currentStatus) => {
    const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    setOrgActionLoading(orgId);
    setOrgStatusMsg('');
    setOrgErrorMsg('');
    
    // Optimistic UI update: immediately flip the clinic's badge and button
    setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, status: nextStatus } : o));

    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch(`/api/admin/organizations/${orgId}/status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: nextStatus })
      });
      setOrgStatusMsg(data.message || `✓ Clinic status updated to: ${nextStatus.toUpperCase()}`);
      fetchOrganizations();
    } catch (err) {
      // Revert optimistic update on failure
      setOrganizations(prev => prev.map(o => o.id === orgId ? { ...o, status: currentStatus } : o));
      setOrgErrorMsg(err.message || 'Failed to update organization status.');
    } finally {
      setOrgActionLoading(null);
    }
  };

  const handleExtendOrg = async (orgId) => {
    setOrgActionLoading(orgId);
    setOrgStatusMsg('');
    setOrgErrorMsg('');
    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch(`/api/admin/organizations/${orgId}/status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'active', extendDays: 30 })
      });
      setOrgStatusMsg(data.message || '✓ License extended by +30 days.');
      fetchOrganizations();
    } catch (err) {
      setOrgErrorMsg(err.message || 'Failed to extend license.');
    } finally {
      setOrgActionLoading(null);
    }
  };

  const fetchPractitioners = async () => {
    try {
      setLoadingPractitioners(true);
      const data = await safeFetch('/api/kmpdc/practitioners');
      if (data.practitioners) {
        setPractitioners(data.practitioners);
      }
    } catch (err) {
      console.error('Error fetching practitioners:', err);
    } finally {
      setLoadingPractitioners(false);
    }
  };

  const fetchNckPractitioners = async () => {
    try {
      setLoadingNckPractitioners(true);
      const data = await safeFetch('/api/nck/practitioners');
      if (data.practitioners) {
        setNckPractitioners(data.practitioners);
      }
    } catch (err) {
      console.error('Error fetching NCK practitioners:', err);
    } finally {
      setLoadingNckPractitioners(false);
    }
  };

  const handleManualPing = async () => {
    setRefreshing(true);
    setStatusMessage('');
    setError('');
    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/license/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (data.license) {
        setLicenseInfo(data.license);
        setStatusMessage('✓ Authority ping completed. License state is synchronized.');
      }
    } catch (err) {
      setError(err.message || 'Failed to ping license authority.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddDoctorSubmit = async (e) => {
    e.preventDefault();
    setAddDoctorError('');
    setAddDoctorSuccess('');

    if (licenseDuplicate?.isDuplicate && !confirmOverwrite) {
      setAddDoctorError(`License ${newLicense} already exists for '${licenseDuplicate.record?.fullName}'. Please check 'Confirm Overwrite / Update Existing Record' to proceed.`);
      return;
    }

    // Determine final facility string & organization ID
    let finalFacility = '';
    let targetOrgId = null;

    if (selectedOrgId === 'other') {
      finalFacility = customFacilityName.trim();
      targetOrgId = null;
      if (!finalFacility) {
        setAddDoctorError('Please specify the external healthcare facility name.');
        return;
      }
    } else if (selectedOrgId) {
      const selectedOrg = organizations.find(o => o.id === selectedOrgId);
      finalFacility = selectedOrg ? selectedOrg.name : newFacility.trim();
      targetOrgId = selectedOrgId;
    } else {
      finalFacility = newFacility.trim();
    }

    if (!finalFacility) {
      setAddDoctorError('Please select a healthcare facility or choose "Other / Not yet on platform".');
      return;
    }

    setAddDoctorLoading(true);

    try {
      const token = localStorage.getItem('token');
      const isNck = selectedRegulator === 'nck';
      const endpoint = isNck ? '/api/nck/practitioners' : '/api/kmpdc/practitioners';
      const payload = isNck ? {
        licenseNumber: newLicense,
        fullName: newName,
        cadre: newCadre,
        facility: finalFacility,
        organizationId: targetOrgId,
        status: 'active',
        confirmOverwrite: !!confirmOverwrite
      } : {
        licenseNumber: newLicense,
        fullName: newName,
        cadre: newCadre,
        specialization: newSpec,
        facility: finalFacility,
        organizationId: targetOrgId,
        status: 'active',
        confirmOverwrite: !!confirmOverwrite
      };

      const data = await safeFetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      setAddDoctorSuccess(data.message);
      resetAddDoctorForm();
      if (isNck) {
        fetchNckPractitioners();
      } else {
        fetchPractitioners();
      }
      setTimeout(() => {
        setShowAddDoctorModal(false);
        setAddDoctorSuccess('');
      }, 1500);
    } catch (err) {
      if (err.isDuplicate || err.status === 409) {
        setLicenseDuplicate({
          isDuplicate: true,
          record: err.existingRecord || { licenseNumber: newLicense }
        });
      }
      setAddDoctorError(err.message || `Failed to add ${selectedRegulator === 'nck' ? 'nurse' : 'doctor'} to registry.`);
    } finally {
      setAddDoctorLoading(false);
    }
  };

  const fetchClinicOrg = async () => {
    if (user?.role === 'super_admin') return;
    setClinicOrgLoading(true);
    try {
      const token = localStorage.getItem('token');
      const data = await safeFetch('/api/payments/clinic-license', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (data.organization) {
        setClinicOrg(data.organization);
      }
    } catch (err) {
      console.warn('Could not fetch clinic organization info:', err.message);
    } finally {
      setClinicOrgLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'super_admin') {
      fetchLicenseStatus();
      fetchPractitioners();
      fetchNckPractitioners();
      fetchOrganizations();
    } else if (user?.role === 'admin') {
      fetchClinicOrg();
    }
  }, [user, refreshTrigger]);

  if (user?.role !== 'super_admin') {
    if (user?.role === 'admin') {
      const isSuspended = clinicOrg?.status === 'suspended' || clinicOrg?.status === 'disabled';
      const isExpired = clinicOrg?.license_expires_at && new Date(clinicOrg.license_expires_at) < new Date();
      const currentExpiry = clinicOrg?.license_expires_at ? new Date(clinicOrg.license_expires_at) : null;
      const daysLeft = currentExpiry ? Math.ceil((currentExpiry - new Date()) / (1000 * 60 * 60 * 24)) : 0;

      return (
        <div className="glass-card" style={{ marginBottom: '24px', border: '1px solid var(--border)', background: 'var(--card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(15, 118, 110, 0.1)', border: '1px solid rgba(15, 118, 110, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={24} color="#0F766E" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                    {clinicOrg?.name || user?.organizationName || 'Health Facility License'}
                  </h3>
                  <span className={`badge ${isSuspended ? 'badge-error' : (isExpired ? 'badge-error' : 'badge-success')}`} style={{ textTransform: 'uppercase', fontSize: '0.72rem' }}>
                    {isSuspended ? 'SUSPENDED' : (isExpired ? 'EXPIRED' : (clinicOrg?.status || 'ACTIVE').toUpperCase())}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  SaaS Operational License &bull; {currentExpiry ? `Expires on ${currentExpiry.toLocaleDateString()} (${daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired'})` : 'Active'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowHistoryModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
              >
                <Clock size={14} /> Billing History
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPaystackModalOrg(clinicOrg || { id: user?.organization_id, name: user?.organizationName || 'Clinic' })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.88rem',
                  padding: '9px 18px',
                  background: '#0F766E',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(15, 118, 110, 0.2)',
                  cursor: 'pointer'
                }}
              >
                <CreditCard size={16} /> Renew License with Paystack (M-Pesa / Card)
              </button>
            </div>
          </div>

          <PaystackRenewalModal
            organization={paystackModalOrg}
            user={user}
            isOpen={!!paystackModalOrg}
            onClose={() => setPaystackModalOrg(null)}
            onSuccess={() => {
              fetchClinicOrg();
            }}
          />

          <PaymentHistoryModal
            isOpen={showHistoryModal}
            onClose={() => setShowHistoryModal(false)}
            user={user}
            organizationId={clinicOrg?.id || user?.organization_id}
          />
        </div>
      );
    }
    return null;
  }

  const isActive = licenseInfo?.status === 'active';
  const failureCount = licenseInfo?.consecutiveFailures || 0;

  return (
    <div className="glass-card mb-7">
      
      {/* Widget Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#E6F4F2', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #A3E3CD' }}>
            <Key size={22} color="#0F766E" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Super Admin SaaS & Licensing Control Center
              <span className="badge" style={{ fontSize: '0.7rem', backgroundColor: '#0B2545', color: '#ffffff' }}>
                ROOT AUTHORITY
              </span>
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Central Supabase Remote Kill-Switch, Fail-Closed Matrix, & Statutory Oracle (KMPDC / NCK) Manager
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowHistoryModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px' }}
          >
            <CreditCard size={15} /> Billing Records
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => {
              if (organizations.length === 0) fetchOrganizations();
              setSelectedRegulator('kmpdc');
              resetAddDoctorForm('kmpdc');
              setShowAddDoctorModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px', background: 'var(--admin-green-bg)', borderColor: 'var(--admin-green-border)', color: 'var(--admin-green)', fontWeight: 600 }}
          >
            <Plus size={15} /> Add Doctor (KMPDC)
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => {
              if (organizations.length === 0) fetchOrganizations();
              setSelectedRegulator('nck');
              resetAddDoctorForm('nck');
              setShowAddDoctorModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px', background: 'var(--admin-blue-bg)', borderColor: 'var(--admin-blue-border)', color: 'var(--admin-blue)', fontWeight: 600 }}
          >
            <Plus size={15} /> Add Nurse (NCK)
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleManualPing}
            disabled={refreshing || loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
            {refreshing ? 'Pinging Authority...' : 'Ping Authority Now'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: 'var(--admin-green-bg)', border: '1px solid var(--admin-green-border)', color: 'var(--admin-green)', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage('')} style={{ background: 'none', border: 'none', color: 'var(--admin-green)', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#dc2626', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 3 Interactive Clickable Metric Cards */}
      <div className="grid-3" style={{ gap: '16px', marginBottom: '20px' }}>
        
        {/* Card 1: Platform License Authority Status */}
        <div
          style={{
            padding: '18px',
            borderRadius: '10px',
            background: 'var(--card)',
            border: isActive ? '1px solid var(--admin-green-border)' : '1px solid rgba(239, 68, 68, 0.4)',
            position: 'relative',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Platform License Authority
            </div>
            <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
              {isActive ? 'Enforced' : 'Suspended'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isActive ? (
              <>
                <CheckCircle size={22} color="var(--admin-green)" />
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--admin-green)' }}>ACTIVE & LICENSED</span>
              </>
            ) : (
              <>
                <AlertTriangle size={22} color="#dc2626" />
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#dc2626' }}>RESTRICTED / DISABLED</span>
              </>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            {isActive ? '✓ Full operational access verified across registered healthcare facilities.' : '⚠️ Restricted mode: Unauthorized traffic blocked.'}
          </div>
        </div>

        {/* Card 2: Fail-Closed Security Counter (Clickable) */}
        <div
          onClick={() => setActiveModal('security')}
          style={{
            padding: '18px',
            borderRadius: '10px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(15, 118, 110, 0.12)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Fail-Closed Security Matrix
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', textDecoration: 'underline', fontWeight: 600 }}>View Policy</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={22} color={failureCount === 0 ? 'var(--color-primary)' : 'var(--admin-amber)'} />
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {failureCount} / 3 Failures
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            {failureCount === 0 ? '✓ Network ping healthy (0 connection drops).' : 'Consecutive dropped pings before auto-killswitch.'}
          </div>
        </div>

        {/* Card 3: Verification Schedule (Clickable) */}
        <div
          onClick={() => setActiveModal('schedule')}
          style={{
            padding: '18px',
            borderRadius: '10px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(15, 118, 110, 0.12)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
              Verification Schedule & Heartbeat
            </div>
            <span style={{ fontSize: '0.7rem', color: '#818cf8', textDecoration: 'underline' }}>View Timing</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={22} color="var(--color-accent)" />
            <span style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {licenseInfo?.lastChecked ? new Date(licenseInfo.lastChecked).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'On Server Boot'}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Autonomous 6-hour recurring verification interval.
          </div>
        </div>

      </div>

      {/* Master Statutory Council Oracle Registry (KMPDC Doctors & NCK Nurses) */}
      <div style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', marginBottom: '20px' }}>
        
        {/* Tab Header & Search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          
          {/* Council Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveOracleTab('kmpdc')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                background: activeOracleTab === 'kmpdc' ? 'rgba(16, 185, 129, 0.22)' : 'rgba(255,255,255,0.03)',
                color: activeOracleTab === 'kmpdc' ? '#34d399' : 'var(--text-secondary)',
                border: activeOracleTab === 'kmpdc' ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid rgba(255,255,255,0.08)'
              }}
            >
              <Stethoscope size={15} color={activeOracleTab === 'kmpdc' ? '#34d399' : 'var(--text-muted)'} />
              KMPDC Doctors ({practitioners.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveOracleTab('nck')}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                background: activeOracleTab === 'nck' ? 'rgba(59, 130, 246, 0.22)' : 'rgba(255,255,255,0.03)',
                color: activeOracleTab === 'nck' ? '#60a5fa' : 'var(--text-secondary)',
                border: activeOracleTab === 'nck' ? '1px solid rgba(59, 130, 246, 0.45)' : '1px solid rgba(255,255,255,0.08)'
              }}
            >
              <Users size={15} color={activeOracleTab === 'nck' ? '#60a5fa' : 'var(--text-muted)'} />
              NCK Nurses & Midwives ({nckPractitioners.length})
            </button>
          </div>
          
          {/* Real-time Search Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '280px', flex: 1, maxWidth: '420px', position: 'relative' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type="text"
                className="form-control"
                placeholder={activeOracleTab === 'nck' ? "Search by nurse license #, name, cadre, facility..." : "Search by doctor license #, name, cadre, facility..."}
                value={practitionerSearch}
                onChange={e => setPractitionerSearch(e.target.value)}
                style={{ paddingLeft: '32px', paddingRight: practitionerSearch ? '28px' : '10px', height: '34px', fontSize: '0.8rem', borderRadius: '8px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              {practitionerSearch && (
                <button
                  type="button"
                  onClick={() => setPractitionerSearch('')}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                  title="Clear Search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ maxHeight: oracleLimit > 5 ? '480px' : '260px', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px' }}>{activeOracleTab === 'nck' ? 'NCK License #' : 'KMPDC License #'}</th>
                <th style={{ padding: '8px 6px' }}>Practitioner Name</th>
                <th style={{ padding: '8px 6px' }}>{activeOracleTab === 'nck' ? 'Nursing Cadre' : 'Cadre & Specialty'}</th>
                <th style={{ padding: '8px 6px' }}>Hospital Facility</th>
                <th style={{ padding: '8px 6px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeOracleTab === 'kmpdc' ? (
                practitioners
                  .filter(doc => {
                    if (!practitionerSearch.trim()) return true;
                    const q = practitionerSearch.toLowerCase();
                    return (
                      (doc.license_number && doc.license_number.toLowerCase().includes(q)) ||
                      (doc.full_name && doc.full_name.toLowerCase().includes(q)) ||
                      (doc.specialization && doc.specialization.toLowerCase().includes(q)) ||
                      (doc.facility && doc.facility.toLowerCase().includes(q)) ||
                      (doc.cadre && doc.cadre.toLowerCase().includes(q)) ||
                      (doc.status && doc.status.toLowerCase().includes(q))
                    );
                  })
                  .slice(0, practitionerSearch.trim() ? undefined : oracleLimit)
                  .map((doc, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: 'var(--color-primary)', fontWeight: 600 }}>{doc.license_number}</td>
                      <td style={{ padding: '8px 6px', fontWeight: 500 }}>{doc.full_name}</td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{doc.specialization} ({doc.cadre})</td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>
                        {doc.organization_id || doc.organizationName ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: 500 }} title="Verified Multi-Tenant Facility">
                            🏥 {doc.facility}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="External Facility (Not yet on platform)">
                            🏢 {doc.facility}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <span className={`badge ${doc.status === 'suspended' ? 'badge-error' : 'badge-success'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                          {doc.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
              ) : (
                nckPractitioners
                  .filter(nurse => {
                    if (!practitionerSearch.trim()) return true;
                    const q = practitionerSearch.toLowerCase();
                    return (
                      (nurse.license_number && nurse.license_number.toLowerCase().includes(q)) ||
                      (nurse.full_name && nurse.full_name.toLowerCase().includes(q)) ||
                      (nurse.facility && nurse.facility.toLowerCase().includes(q)) ||
                      (nurse.cadre && nurse.cadre.toLowerCase().includes(q)) ||
                      (nurse.status && nurse.status.toLowerCase().includes(q))
                    );
                  })
                  .slice(0, practitionerSearch.trim() ? undefined : oracleLimit)
                  .map((nurse, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 6px', fontFamily: 'monospace', color: '#60a5fa', fontWeight: 600 }}>{nurse.license_number}</td>
                      <td style={{ padding: '8px 6px', fontWeight: 500 }}>{nurse.full_name}</td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {nurse.cadre === 'midwife' ? 'Registered Midwife' : 'Registered Nurse'}
                      </td>
                      <td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>
                        {nurse.organization_id || nurse.organizationName ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: 500 }} title="Verified Multi-Tenant Facility">
                            🏥 {nurse.facility || nurse.organizationName}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="External Facility">
                            🏢 {nurse.facility || 'External / National Register'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <span className={`badge ${nurse.status === 'suspended' ? 'badge-error' : 'badge-success'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                          {nurse.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
              )}

              {/* Empty States */}
              {activeOracleTab === 'kmpdc' && practitioners.length > 0 && practitioners.filter(doc => {
                if (!practitionerSearch.trim()) return true;
                const q = practitionerSearch.toLowerCase();
                return (
                  (doc.license_number && doc.license_number.toLowerCase().includes(q)) ||
                  (doc.full_name && doc.full_name.toLowerCase().includes(q)) ||
                  (doc.specialization && doc.specialization.toLowerCase().includes(q)) ||
                  (doc.facility && doc.facility.toLowerCase().includes(q)) ||
                  (doc.cadre && doc.cadre.toLowerCase().includes(q)) ||
                  (doc.status && doc.status.toLowerCase().includes(q))
                );
              }).length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No doctors match "{practitionerSearch}"
                  </td>
                </tr>
              )}

              {activeOracleTab === 'nck' && nckPractitioners.length > 0 && nckPractitioners.filter(nurse => {
                if (!practitionerSearch.trim()) return true;
                const q = practitionerSearch.toLowerCase();
                return (
                  (nurse.license_number && nurse.license_number.toLowerCase().includes(q)) ||
                  (nurse.full_name && nurse.full_name.toLowerCase().includes(q)) ||
                  (nurse.facility && nurse.facility.toLowerCase().includes(q)) ||
                  (nurse.cadre && nurse.cadre.toLowerCase().includes(q)) ||
                  (nurse.status && nurse.status.toLowerCase().includes(q))
                );
              }).length === 0 && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No nurses match "{practitionerSearch}"
                  </td>
                </tr>
              )}

              {activeOracleTab === 'nck' && nckPractitioners.length === 0 && !loadingNckPractitioners && (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                    No registered nurses found in NCK Oracle. Click "Add Nurse (NCK)" above to register one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Collapsible Expander for Statutory Oracle */}
        {(() => {
          const currentTotal = activeOracleTab === 'kmpdc' ? practitioners.length : nckPractitioners.length;
          const isCollapsible = !practitionerSearch.trim() && currentTotal > 5;
          return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Showing {Math.min(oracleLimit, currentTotal)} of {currentTotal} verified practitioners
              </span>
              {isCollapsible && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setOracleLimit(prev => prev === 5 ? currentTotal : 5)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  {oracleLimit > 5 ? (
                    <>▲ Show fewer (top 5)</>
                  ) : (
                    <>▼ Show all {currentTotal} ({currentTotal - 5} hidden)</>
                  )}
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* Multi-Tenant Organizations & Per-Clinic Kill-Switch Control Center (Super Admin Only) */}
      {user?.role === 'super_admin' && (
        <div id="admin-sec-licensing" style={{ padding: '20px', borderRadius: '10px', background: 'rgba(15, 118, 110, 0.05)', border: '1px solid rgba(15, 118, 110, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#E6F4F2', padding: '6px', borderRadius: '8px', border: '1px solid #A3E3CD' }}>
                <Building2 size={20} color="#0F766E" />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  Multi-Tenant Hospital Ledgers & Kill-Switch Matrix ({organizations.length} Clinics)
                </h4>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Manage tenant licenses and kill-switch states independently without cross-tenant disruption
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
              {/* Organization Search Input & Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '240px', maxWidth: '380px', width: '100%', position: 'relative' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search clinics by name, slug, status..."
                    value={orgSearch}
                    onChange={e => setOrgSearch(e.target.value)}
                    style={{ paddingLeft: '32px', paddingRight: orgSearch ? '28px' : '10px', height: '34px', fontSize: '0.8rem', borderRadius: '8px' }}
                  />
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  {orgSearch && (
                    <button
                      type="button"
                      onClick={() => setOrgSearch('')}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      title="Clear Search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ height: '34px', padding: '0 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                  onClick={() => {}}
                >
                  <Search size={13} /> Search
                </button>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchOrganizations}
                disabled={loadingOrgs}
                style={{ height: '34px', fontSize: '0.8rem', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} className={loadingOrgs ? 'rotate-spin' : ''} />
                {loadingOrgs ? 'Syncing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {orgStatusMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)', color: '#34d399', fontSize: '0.84rem', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{orgStatusMsg}</span>
              <button onClick={() => setOrgStatusMsg('')} style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
            </div>
          )}

          {orgErrorMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#f87171', fontSize: '0.84rem', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>⚠️ {orgErrorMsg}</span>
              <button onClick={() => setOrgErrorMsg('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>Hospital / Clinic</th>
                  <th style={{ padding: '10px 8px' }}>License Status</th>
                  <th style={{ padding: '10px 8px' }}>Expiration Date</th>
                  <th style={{ padding: '10px 8px' }}>Doctors</th>
                  <th style={{ padding: '10px 8px' }}>Patients</th>
                  <th style={{ padding: '10px 8px' }}>Ledger Height</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Kill-Switch Actions</th>
                </tr>
              </thead>
              <tbody>
                {organizations
                  .filter(org => {
                    if (!orgSearch.trim()) return true;
                    const q = orgSearch.toLowerCase();
                    return (
                      (org.name && org.name.toLowerCase().includes(q)) ||
                      (org.slug && org.slug.toLowerCase().includes(q)) ||
                      (org.status && org.status.toLowerCase().includes(q))
                    );
                  })
                  .slice(0, orgSearch.trim() ? undefined : orgLimit)
                  .map(org => {
                  const isOrgSuspended = org.status === 'suspended' || org.status === 'disabled';
                  const isExpired = org.licenseExpiresAt && new Date(org.licenseExpiresAt) < new Date();
                  const isBusy = orgActionLoading === org.id;

                  return (
                    <tr key={org.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{org.name}</span>
                          {org.slug && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>({org.slug})</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          className={`badge ${isOrgSuspended ? 'badge-error' : (org.status === 'trial' ? 'badge-warning' : 'badge-success')}`}
                          style={{ textTransform: 'uppercase', fontSize: '0.72rem', padding: '3px 8px' }}
                        >
                          {isOrgSuspended ? 'SUSPENDED' : (isExpired ? 'EXPIRED' : org.status.toUpperCase())}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', color: isExpired ? 'var(--color-error)' : 'var(--text-secondary)' }}>
                        {org.licenseExpiresAt ? new Date(org.licenseExpiresAt).toLocaleDateString() : 'Perpetual'}
                      </td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{org.doctorCount || 0}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>{org.patientCount || 0}</td>
                      <td style={{ padding: '10px 8px', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                        Block #{org.blockHeight || 0}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setPaystackModalOrg(org)}
                            style={{ fontSize: '0.75rem', padding: '5px 12px', background: '#0F766E', border: 'none', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: '6px', cursor: 'pointer' }}
                            title="Renew via Paystack (M-Pesa / Card)"
                          >
                            <CreditCard size={12} /> Paystack
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleExtendOrg(org.id)}
                            disabled={isBusy}
                            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                            title="Extend license by 30 days"
                          >
                            +30 Days
                          </button>
                          
                          {isOrgSuspended ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleToggleOrgStatus(org.id, org.status)}
                              disabled={isBusy}
                              style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#10b981', borderColor: '#10b981' }}
                            >
                              <Check size={12} /> Reactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleToggleOrgStatus(org.id, org.status)}
                              disabled={isBusy}
                              style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                            >
                              <Ban size={12} /> Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Collapsible Expander for Multi-Tenant Clinics */}
          {(() => {
            const filtered = organizations.filter(org => {
              if (!orgSearch.trim()) return true;
              const q = orgSearch.toLowerCase();
              return (
                (org.name && org.name.toLowerCase().includes(q)) ||
                (org.slug && org.slug.toLowerCase().includes(q)) ||
                (org.status && org.status.toLowerCase().includes(q))
              );
            });
            const isCollapsible = !orgSearch.trim() && filtered.length > 5;
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Showing {Math.min(orgLimit, filtered.length)} of {filtered.length} registered clinics
                </span>
                {isCollapsible && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setOrgLimit(prev => prev === 5 ? filtered.length : 5)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.78rem',
                      padding: '5px 14px',
                      borderRadius: '20px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    {orgLimit > 5 ? (
                      <>▲ Collapse list (show top 5)</>
                    ) : (
                      <>▼ Show all {filtered.length} clinics ({filtered.length - 5} hidden)</>
                    )}
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      )}



      {/* MODAL 2: Fail-Closed Security Matrix Modal */}
      {activeModal === 'security' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '520px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <Server size={20} /> Fail-Closed Security Policy
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              To prevent hospitals from unplugging their internet cable to bypass a disabled license, the system implements a strict <strong>Fail-Closed Security Matrix</strong>:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px', fontSize: '0.85rem' }}>
              <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <strong>1. Maximum Drop Tolerance:</strong> 3 consecutive network check drops allowed.
              </div>
              <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <strong>2. Auto-Lock Enforcement:</strong> On the 3rd failure, the instance automatically switches to <code>DISABLED</code>.
              </div>
              <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <strong>3. Root Admin Exemption:</strong> The Super Admin account can always log in to troubleshoot or re-license.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Understood</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Verification Schedule Modal */}
      {activeModal === 'schedule' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
                <Clock size={20} /> Verification Heartbeat Timing
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setActiveModal(null)}>✕</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              The backend runs an autonomous timer that pings your central Supabase Edge Function:
            </p>

            <div style={{ padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '20px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Polling Interval:</span>
                <span style={{ fontWeight: 600 }}>Every 6 Hours (21,600,000 ms)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Last Ping:</span>
                <span style={{ fontWeight: 600 }}>{licenseInfo?.lastChecked ? new Date(licenseInfo.lastChecked).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'Boot'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Request Timeout:</span>
                <span style={{ fontWeight: 600 }}>8000 ms (Fast Fail)</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-primary" onClick={() => { handleManualPing(); setActiveModal(null); }}>
                Ping License Now
              </button>
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Super Admin Add Practitioner to KMPDC / NCK Oracle Modal */}
      {showAddDoctorModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '540px', background: 'var(--bg-secondary)', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '14px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontSize: '1.15rem' }}>
                <Plus size={20} /> Add to {selectedRegulator === 'nck' ? 'Master NCK Nurse Oracle' : 'Master KMPDC Doctor Oracle'}
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => { setShowAddDoctorModal(false); resetAddDoctorForm(); }}>✕</button>
            </div>

            {/* Regulator Selector Tabs inside Modal */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', background: 'rgba(0,0,0,0.25)', padding: '4px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedRegulator('kmpdc');
                  resetAddDoctorForm('kmpdc');
                }}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: selectedRegulator === 'kmpdc' ? 'var(--color-primary)' : 'transparent',
                  color: selectedRegulator === 'kmpdc' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                🩺 KMPDC Doctor / Dentist
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedRegulator('nck');
                  resetAddDoctorForm('nck');
                }}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: selectedRegulator === 'nck' ? 'var(--color-primary)' : 'transparent',
                  color: selectedRegulator === 'nck' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                👩‍⚕️ NCK Nurse / Midwife
              </button>
            </div>

            {addDoctorSuccess && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '16px' }}>
                ✓ {addDoctorSuccess}
              </div>
            )}

            {addDoctorError && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '16px' }}>
                ⚠️ {addDoctorError}
              </div>
            )}

            <form onSubmit={handleAddDoctorSubmit}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {selectedRegulator === 'nck' ? 'NCK License / Reg No. (e.g. 594079 or KRCHN-12345)' : 'KMPDC License Number (e.g. A12345 or B10234)'} <span style={{ color: 'var(--color-error, #ef4444)' }}>*</span>
                  </label>
                  {checkingLicense && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <RefreshCw size={12} className="spinning" /> Verifying against {selectedRegulator === 'nck' ? 'NCK' : 'KMPDC'} portal...
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  className="form-control"
                  placeholder={selectedRegulator === 'nck' ? "e.g. 594079 or KRCHN-12345" : "e.g. A88990"}
                  required
                  value={newLicense}
                  onChange={e => {
                    const val = e.target.value.toUpperCase();
                    setNewLicense(val);
                    debouncedCheckLicense(val, newName, selectedRegulator);
                  }}
                  style={{
                    width: '100%',
                    fontFamily: 'monospace',
                    borderColor: licenseDuplicate?.isDuplicate ? '#f59e0b' : (liveVerification?.liveVerified ? '#10b981' : undefined)
                  }}
                />

                {/* Duplicate License Warning Banner with Explicit Overwrite Confirmation */}
                {licenseDuplicate?.isDuplicate && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.35)', color: '#fbbf24', fontSize: '0.82rem', marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: '2px', color: '#f59e0b' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#fef3c7', marginBottom: '2px' }}>
                          Duplicate {selectedRegulator === 'nck' ? 'Nurse License' : 'Doctor License'} Detected in Registry
                        </div>
                        <div>
                          License <code>{newLicense}</code> is already registered on file to:
                          <div style={{ margin: '4px 0', padding: '4px 8px', background: 'rgba(0,0,0,0.25)', borderRadius: '4px', borderLeft: '3px solid #f59e0b' }}>
                            <strong>{licenseDuplicate.record?.fullName}</strong> &bull; {licenseDuplicate.record?.facility} ({licenseDuplicate.record?.cadre}, Status: {(licenseDuplicate.record?.status || 'active').toUpperCase()})
                          </div>
                        </div>
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(245, 158, 11, 0.25)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, color: '#fef3c7', userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={confirmOverwrite}
                              onChange={e => setConfirmOverwrite(e.target.checked)}
                              style={{ width: '16px', height: '16px', accentColor: '#f59e0b', cursor: 'pointer' }}
                            />
                            Confirm Overwrite / Update Existing Registry Record
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Live Portal Resolution Badge */}
                {liveVerification?.liveVerified && (
                  <div style={{ padding: '7px 12px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.78rem', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} />
                      <span>Live {selectedRegulator === 'nck' ? 'NCK' : 'KMPDC'} Portal: <strong>{liveVerification.liveRecord?.fullName}</strong> ({liveVerification.liveRecord?.status?.toUpperCase() || 'ACTIVE'})</span>
                    </div>
                    {!newName && liveVerification.liveRecord?.fullName && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewName(liveVerification.liveRecord.fullName);
                          debouncedCheckLicense(newLicense, liveVerification.liveRecord.fullName, selectedRegulator);
                        }}
                        style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer' }}
                      >
                        Auto-fill Name
                      </button>
                    )}
                  </div>
                )}

                {/* Format warning if invalid format */}
                {liveVerification && !liveVerification.formatValid && (
                  <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ⚠️ {selectedRegulator === 'nck'
                      ? 'Non-standard NCK format. Expected numeric (e.g. 594079) or council prefix (e.g. KRCHN-12345, BSN-12345).'
                      : 'Non-standard license format. Expected Kenyan council series (e.g. A12345 for Medical Officer, B10234 for Dentist).'}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  {selectedRegulator === 'nck' ? 'Nurse Full Name (as on Council Certificate)' : 'Doctor Full Name (as on Council Certificate)'} <span style={{ color: 'var(--color-error, #ef4444)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder={selectedRegulator === 'nck' ? "e.g. Mary Njeri Kung'u" : "e.g. Dr. Mark Mwangi Mutuku"}
                  required
                  value={newName}
                  onChange={e => {
                    const val = e.target.value;
                    setNewName(val);
                    debouncedCheckLicense(newLicense, val, selectedRegulator);
                  }}
                  style={{ width: '100%' }}
                />

                {/* Name Mismatch Warning */}
                {liveVerification?.nameMismatch && (
                  <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: '0.78rem', marginTop: '6px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px', color: '#ef4444' }} />
                    <div>
                      <strong>Council Identity Discrepancy:</strong> Council records list "<strong>{liveVerification.referenceName}</strong>", but you entered "<strong>{newName}</strong>". (Super Admin override permitted).
                    </div>
                  </div>
                )}

                {/* Name Match Success */}
                {liveVerification && !liveVerification.nameMismatch && liveVerification.referenceName && newName.trim().length >= 4 && (
                  <div style={{ fontSize: '0.76rem', color: '#34d399', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Check size={13} /> Name matches official council certificate on file.
                  </div>
                )}
              </div>

              <div className="grid-2" style={{ gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Cadre</label>
                  <SearchableSelect 
                    className="form-control" 
                    value={newCadre} 
                    placeholder="-- Select Cadre --"
                    onChange={e => setNewCadre(e.target.value)} 
                    style={{ width: '100%' }}
                  >
                    {selectedRegulator === 'nck' ? (
                      <>
                        <option value="nurse">Registered Nurse (KRCHN / BSN)</option>
                        <option value="midwife">Registered Midwife (KRM)</option>
                        <option value="specialist">Advanced Practice Nurse / Specialist</option>
                      </>
                    ) : (
                      <>
                        <option value="Medical Practitioner">Medical Practitioner (A)</option>
                        <option value="Dental Practitioner">Dental Practitioner (B)</option>
                        <option value="Specialist Practitioner">Specialist Practitioner (C/T)</option>
                      </>
                    )}
                  </SearchableSelect>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    {selectedRegulator === 'nck' ? 'Department / Specialization' : 'Specialization'}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={selectedRegulator === 'nck' ? "e.g. Critical Care Nursing" : "e.g. Cardiology"}
                    value={newSpec}
                    onChange={e => setNewSpec(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: selectedOrgId === 'other' ? '12px' : '20px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Clinical Facility <span style={{ color: 'var(--color-error, #ef4444)' }}>*</span>
                </label>
                <SearchableSelect
                  className="form-control"
                  value={selectedOrgId}
                  placeholder="-- Select Clinical Facility --"
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedOrgId(val);
                    if (val && val !== 'other') {
                      const found = organizations.find(o => o.id === val);
                      if (found) setNewFacility(found.name);
                      setCustomFacilityName('');
                    } else if (val === 'other') {
                      setNewFacility(customFacilityName);
                    } else {
                      setNewFacility('');
                    }
                  }}
                  style={{ width: '100%' }}
                  required
                >
                  <option value="">-- Select Clinical Facility --</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>
                      🏥 {org.name}
                    </option>
                  ))}
                  <option value="other">➕ Other / Not yet on platform (External Facility)</option>
                </SearchableSelect>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                  {selectedOrgId && selectedOrgId !== 'other'
                    ? '✓ Practitioner will be tied directly to this registered healthcare tenant record.'
                    : 'Select an enrolled hospital or choose "Other" for broader national registry entries.'}
                </span>
              </div>

              {selectedOrgId === 'other' && (
                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    External Facility Name <span style={{ color: 'var(--color-error, #ef4444)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Gertrude's Children's Hospital"
                    required
                    value={customFacilityName}
                    onChange={e => {
                      setCustomFacilityName(e.target.value);
                      setNewFacility(e.target.value);
                    }}
                    style={{ width: '100%' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '3px' }}>
                    This facility is not yet a BHC tenant, but will be saved as the practitioner's official council facility.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddDoctorModal(false); resetAddDoctorForm(); }}>Cancel</button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={addDoctorLoading || (licenseDuplicate?.isDuplicate && !confirmOverwrite)}
                  style={licenseDuplicate?.isDuplicate && !confirmOverwrite ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                >
                  {addDoctorLoading ? 'Registering...' : (
                    licenseDuplicate?.isDuplicate
                      ? (confirmOverwrite ? `Overwrite & Save ${selectedRegulator === 'nck' ? 'Nurse' : 'Doctor'}` : 'Confirm Overwrite to Proceed')
                      : (selectedRegulator === 'nck' ? 'Register Nurse' : 'Register Doctor')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paystack Renewal Modal for Super Admin */}
      <PaystackRenewalModal
        organization={paystackModalOrg}
        user={user}
        isOpen={!!paystackModalOrg}
        onClose={() => setPaystackModalOrg(null)}
        onSuccess={() => {
          fetchOrganizations();
        }}
      />

      {/* Payment Billing History Modal */}
      <PaymentHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        user={user}
        organizationId={null}
      />

    </div>
  );
}
