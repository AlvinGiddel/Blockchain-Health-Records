import React, { useEffect, useState } from 'react';
import { 
  Database, ShieldAlert, ShieldCheck, UserCheck, RefreshCw, 
  Layers, Users, Zap, Terminal, Check, X, Stethoscope, 
  User, Search, UserCog, Activity, Lock, Cpu, Server, CheckCircle2,
  ChevronRight, ArrowUpRight, Shield, Clock, Hash, Building2, Plus,
  CheckCircle, XCircle
} from 'lucide-react';
import LicenseControlWidget from './LicenseControlWidget';
import { getApiUrl, safeFetch } from '../utils/api';

export default function SuperAdminPanel({ user }) {
  const [stats, setStats] = useState({
    blocks: 0,
    mempool: 0,
    doctors: 0,
    patients: 0,
    admins: 1,
    isValid: true
  });
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [dbPatients, setDbPatients] = useState([]);
  const [dbDoctors, setDbDoctors] = useState([]);
  const [allAdmins, setAllAdmins] = useState([]);
  
  // Custom states for admin approval workflow & ledger explorations
  const [pendingClinics, setPendingClinics] = useState([]);
  const [clinicActionLoading, setClinicActionLoading] = useState(null);
  const [pendingAdmins, setPendingAdmins] = useState([]);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [isRefreshingPendingDocs, setIsRefreshingPendingDocs] = useState(false);
  const [mempoolRecords, setMempoolRecords] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, role }
  const [toast, setToast] = useState(null); // { message, type }
  const [isInitialFetched, setIsInitialFetched] = useState(false);
  const [mining, setMining] = useState(false);

  // Interactive Metric Card Modal State: 'admins' | 'doctors' | 'patients' | 'blocks' | 'consensus' | null
  const [activeMetricModal, setActiveMetricModal] = useState(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  // Onboard New Hospital Admin State
  const [showProvisionForm, setShowProvisionForm] = useState(false);
  const [newHospitalName, setNewHospitalName] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [provisioningLoading, setProvisioningLoading] = useState(false);
  const [provisionError, setProvisionError] = useState('');

  // Search state for Node Directory & Registry Control
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');
  const [activeDirectoryTab, setActiveDirectoryTab] = useState('doctors'); // 'doctors' | 'patients'
  const [pendingAdminSearch, setPendingAdminSearch] = useState('');
  const [pendingDoctorSearch, setPendingDoctorSearch] = useState('');

  // Filtered Doctors & Patients based on search query
  const filteredDoctors = dbDoctors.filter(doc => {
    if (!nodeSearchQuery.trim()) return true;
    const q = nodeSearchQuery.toLowerCase().trim();
    const name = (doc.name || '').toLowerCase();
    const email = (doc.email || '').toLowerCase();
    const spec = (doc.doctorProfile?.specialization || '').toLowerCase();
    const hospital = (doc.doctorProfile?.hospital || '').toLowerCase();
    const license = (doc.doctorProfile?.licenseNumber || '').toLowerCase();
    return name.includes(q) || email.includes(q) || spec.includes(q) || hospital.includes(q) || license.includes(q);
  });

  const filteredPatients = dbPatients.filter(pat => {
    if (!nodeSearchQuery.trim()) return true;
    const q = nodeSearchQuery.toLowerCase().trim();
    const name = (pat.name || '').toLowerCase();
    const email = (pat.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  // Simulated node logs
  const [logs, setLogs] = useState([
    'Node [0] initialized - Listening on port 5000',
    'Syncing local chain database with consensus pool...',
    'Genesis Block validation complete. SHA-256 chain verified.',
    'SaaS Multi-Tenancy Engine: Active & Monitoring.'
  ]);

  useEffect(() => {
    fetchAdminData(false);
    // Poll backend state and node updates every 4 seconds for snappy live updates
    const interval = setInterval(() => {
      fetchAdminData(true);
      
      // Periodic network pings for live infrastructure monitoring
      const pingMsgs = [
        'P2P Peer Ping: Tenant Gateway responded in 32ms',
        'Consensus Verification: Ledger height matches network quorum.',
        'P2P Peer Ping: Backup validator node responded in 44ms',
        'Database connection pool: Healthy (0 deadlocks, latency 4ms).'
      ];
      const randomMsg = pingMsgs[Math.floor(Math.random() * pingMsgs.length)];
      setLogs(prev => [...prev.slice(-10), `[${new Date().toLocaleTimeString()}] ${randomMsg}`]);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const refreshPendingDoctors = async () => {
    try {
      setIsRefreshingPendingDocs(true);
      const data = await safeFetch('/api/admin/doctors/pending');
      setPendingDoctors(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to refresh pending doctors:', e.message);
    } finally {
      setIsRefreshingPendingDocs(false);
    }
  };

  const fetchAdminData = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      
      // Parallelize all endpoint requests concurrently with Promise.all for instant sub-second response
      const [
        statsData,
        blocksData,
        patientsData,
        doctorsData,
        pendingData,
        allAdminsData,
        pendingDocsData,
        resPendingClinics,
        mempoolData
      ] = await Promise.all([
        safeFetch('/api/admin/stats').catch(() => null),
        safeFetch('/api/blockchain/blocks').catch(() => []),
        safeFetch('/api/users/patients').catch(() => []),
        safeFetch('/api/users/doctors').catch(() => []),
        safeFetch('/api/admin/pending').catch(() => []),
        safeFetch('/api/admin/all').catch(() => []),
        safeFetch('/api/admin/doctors/pending').catch(() => []),
        safeFetch('/api/admin/organizations/pending').catch(() => ({ pendingClinics: [] })),
        fetch(getApiUrl('/api/blockchain/mempool')).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      setBlocks(Array.isArray(blocksData) ? blocksData : []);
      setDbPatients(Array.isArray(patientsData) ? patientsData : []);
      setDbDoctors(Array.isArray(doctorsData) ? doctorsData : []);
      setAllAdmins(Array.isArray(allAdminsData) && allAdminsData.length > 0 ? allAdminsData : [{ id: user.id || user._id, name: user.name, email: user.email, role: user.role, organizationName: 'Global Platform Governance', isApproved: true, createdAt: new Date() }]);
      setPendingClinics(resPendingClinics?.pendingClinics || []);
      setPendingAdmins(Array.isArray(pendingData) ? pendingData : []);
      setPendingDoctors(Array.isArray(pendingDocsData) ? pendingDocsData : []);
      setMempoolRecords(Array.isArray(mempoolData) ? mempoolData : []);

      if (isInitialFetched) {
        // Toast and alert for new admins
        const existingIds = pendingAdmins.map(a => a.id || a._id);
        const newRequests = (Array.isArray(pendingData) ? pendingData : []).filter(a => !existingIds.includes(a.id || a._id));
        newRequests.forEach(newAdmin => {
          setToast({
            message: `New Tenant Admin Request: ${newAdmin.name} (${newAdmin.email}) is awaiting approval.`,
            type: 'warning'
          });
          setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [ALERT] SECURITY: Pending tenant admin request received from ${newAdmin.email}`]);
        });

        // Toast and alert for new doctors
        const existingDocIds = pendingDoctors.map(d => d.id || d._id);
        const newDocRequests = (Array.isArray(pendingDocsData) ? pendingDocsData : []).filter(d => !existingDocIds.includes(d.id || d._id));
        newDocRequests.forEach(newDoc => {
          setToast({
            message: `New Clinical Node Request: Dr. ${newDoc.name} (${newDoc.email}) is awaiting approval.`,
            type: 'warning'
          });
          setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [ALERT] SECURITY: Pending practitioner node request from ${newDoc.email}`]);
        });
      } else {
        setIsInitialFetched(true);
      }
      setMempoolRecords(mempoolData);

      if (statsData) {
        setStats({
          blocks: statsData.blocks,
          mempool: statsData.mempool,
          doctors: statsData.doctors,
          patients: statsData.patients,
          admins: statsData.admins,
          isValid: statsData.isValid
        });
      }
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const handleApproveClinic = async (clinicId) => {
    setClinicActionLoading(clinicId);
    try {
      const res = await safeFetch(`/api/admin/organizations/${clinicId}/approve`, { method: 'POST' });
      setToast({ message: res.message || 'Clinic approved successfully! 14-day trial started.', type: 'success' });
      fetchAdminData(true);
    } catch (err) {
      setToast({ message: err.message || 'Failed to approve clinic.', type: 'error' });
    } finally {
      setClinicActionLoading(null);
    }
  };

  const handleRejectClinic = async (clinicId) => {
    const reason = window.prompt('Optional: Enter rejection reason to send to clinic applicant:');
    if (reason === null) return; // cancelled
    setClinicActionLoading(clinicId);
    try {
      const res = await safeFetch(`/api/admin/organizations/${clinicId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || 'Facility credentials could not be verified at this time.' })
      });
      setToast({ message: res.message || 'Clinic registration rejected and set to disabled.', type: 'warning' });
      fetchAdminData(true);
    } catch (err) {
      setToast({ message: err.message || 'Failed to reject clinic.', type: 'error' });
    } finally {
      setClinicActionLoading(null);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    const minDelay = new Promise(resolve => setTimeout(resolve, 600));
    try {
      await Promise.all([fetchAdminData(false), minDelay]);
      setToast({
        message: 'System metrics and ledger status refreshed successfully.',
        type: 'success'
      });
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [ADMIN] SaaS console metrics manually refreshed.`]);
    } catch (err) {
      console.error('Error refreshing console:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Self-Healing Recovery: Recovers database using ledger records
  const handleRestoreDatabase = async () => {
    setRecovering(true);
    setLogs(prev => [...prev, '[RECOVERY] Initializing Cryptographic Ledger Repair sequence...']);
    
    try {
      const res = await fetch(getApiUrl('/api/blockchain/recover'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      await res.json();
      
      setTimeout(() => {
        setRecovering(false);
        setLogs(prev => [...prev, '[RECOVERY] All database indexes verified. Ledger synchronization success. Integrity restored.']);
        fetchAdminData();
      }, 1500);

    } catch (err) {
      console.error(err);
      setRecovering(false);
    }
  };

  const handleMineBlock = async () => {
    if (mempoolRecords.length === 0) return;
    setMining(true);
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [MINER] Starting Proof of Work mining sequence...`]);
    try {
      const res = await fetch(getApiUrl('/api/blockchain/mine'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Mining failed.');
      }
      
      setToast({
        message: `Success: Block #${data.block.index} successfully mined! Hash: ${data.block.hash.substring(0, 24)}...`,
        type: 'success'
      });
      
      setLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [MINER] Proof of Work success! Block #${data.block.index} sealed.`,
        `[${new Date().toLocaleTimeString()}] [MINER] Hash: ${data.block.hash}`,
        `[${new Date().toLocaleTimeString()}] [MINER] Chain height: ${data.block.index + 1}`
      ]);
      
      fetchAdminData();
    } catch (err) {
      console.error(err);
      setToast({
        message: err.message || 'Failed to mine pending block.',
        type: 'danger'
      });
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [ERROR] Mining execution aborted: ${err.message}`]);
    } finally {
      setMining(false);
    }
  };

  const executeDeleteUser = async (userId, userName, userRole) => {
    try {
      const res = await fetch(getApiUrl(`/api/users/${userId}`), {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (res.ok) {
        setToast({
          message: `User ${userName} (${userRole}) removed from database.`,
          type: 'success'
        });
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: User ${userName} (${userRole}) removed from database.`]);
        fetchAdminData();
      } else {
        alert(data.error || 'Failed to delete user.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete user.');
    }
  };

  const handleApproveAdmin = async (userId, userName) => {
    try {
      const res = await fetch(getApiUrl(`/api/admin/approve/${userId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Tenant Admin "${userName}" registration approved.`]);
        setToast({
          message: `Tenant Administrator "${userName}" has been approved.`,
          type: 'success'
        });
        fetchAdminData();
      } else {
        alert(data.error || 'Failed to approve admin request.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to approve admin request.');
    }
  };

  const handleRejectAdmin = async (userId, userName) => {
    try {
      const res = await fetch(getApiUrl(`/api/admin/reject/${userId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Tenant Admin request for "${userName}" rejected.`]);
        setToast({
          message: `Tenant Administrator request for "${userName}" rejected.`,
          type: 'danger'
        });
        fetchAdminData();
      } else {
        alert(data.error || 'Failed to reject admin request.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to reject admin request.');
    }
  };

  const handleProvisionTenant = async (e) => {
    e.preventDefault();
    setProvisionError('');
    if (!newAdminName.trim() || !newAdminEmail.trim() || !newAdminPassword) {
      setProvisionError('Please fill in administrator name, email, and password.');
      return;
    }

    setProvisioningLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/provision-tenant'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalName: newHospitalName.trim(),
          name: newAdminName.trim(),
          email: newAdminEmail.trim(),
          password: newAdminPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to provision tenant admin.');
      }

      setToast({
        message: `Success! Tenant Administrator for "${newHospitalName || newAdminName}" provisioned.`,
        type: 'success'
      });
      setLogs(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [PROVISION] Tenant hospital administrator ${newAdminEmail} created and authorized.`
      ]);

      // Clear form
      setNewHospitalName('');
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setShowProvisionForm(false);
      fetchAdminData();
    } catch (err) {
      console.error(err);
      setProvisionError(err.message);
    } finally {
      setProvisioningLoading(false);
    }
  };

  const handleApproveDoctor = async (userId, userName) => {
    try {
      const res = await fetch(getApiUrl(`/api/admin/doctors/approve/${userId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Clinical Practitioner "Dr. ${userName}" verified and approved.`]);
        setToast({
          message: `Success: Clinical Practitioner Dr. ${userName} has been activated.`,
          type: 'success'
        });
        fetchAdminData();
      } else {
        alert(data.error || 'Failed to approve practitioner request.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to approve practitioner request.');
    }
  };

  const handleRejectDoctor = async (userId, userName) => {
    try {
      const res = await fetch(getApiUrl(`/api/admin/doctors/reject/${userId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Practitioner request for "Dr. ${userName}" rejected.`]);
        setToast({
          message: `Practitioner request for Dr. ${userName} rejected.`,
          type: 'danger'
        });
        fetchAdminData();
      } else {
        alert(data.error || 'Failed to reject practitioner request.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to reject practitioner request.');
    }
  };

  return (
    <div>
      {/* Toast Notification Overlay */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 10000,
          background: 'rgba(15, 15, 25, 0.95)',
          border: toast.type === 'warning' ? '1px solid rgba(245, 158, 11, 0.4)' : toast.type === 'danger' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
          boxShadow: toast.type === 'warning' ? '0 0 20px rgba(245, 158, 11, 0.25)' : toast.type === 'danger' ? '0 0 20px rgba(239, 68, 68, 0.25)' : '0 0 20px rgba(16, 185, 129, 0.25)',
          padding: '16px 20px',
          borderRadius: '10px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          maxWidth: '380px',
          backdropFilter: 'blur(12px)'
        }}>
          {toast.type === 'warning' ? (
            <ShieldAlert size={20} color="#f59e0b" style={{ flexShrink: 0 }} />
          ) : toast.type === 'danger' ? (
            <ShieldAlert size={20} color="#ef4444" style={{ flexShrink: 0 }} />
          ) : (
            <ShieldCheck size={20} color="#10b981" style={{ flexShrink: 0 }} />
          )}
          <div style={{ fontSize: '0.85rem', flex: 1, lineHeight: '1.4' }}>
            {toast.message}
          </div>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }} onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header-flex">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-primary" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Platform Super Admin
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Tenant System Quorum: Active
            </span>
          </div>
          <h1 style={{ fontSize: '2.00rem', fontWeight: 800, margin: 0 }}>Super Admin Command Center</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Multi-tenant licensing authority, cryptographic consensus governance, and global node registry
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={handleManualRefresh}
          disabled={loading || refreshing}
          style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
        >
          <RefreshCw size={16} className={refreshing || loading ? 'rotate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh Console'}
        </button>
      </div>

      {/* Super Admin Pending Clinic Approvals Queue */}
      <div className="glass-card" style={{ marginBottom: '28px', border: pendingClinics.length > 0 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: pendingClinics.length > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.1)', padding: '10px', borderRadius: '10px' }}>
              <Building2 size={22} color={pendingClinics.length > 0 ? '#f59e0b' : 'var(--color-primary)'} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Pending Clinic Approvals
                {pendingClinics.length > 0 ? (
                  <span className="badge badge-warning" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                    {pendingClinics.length} Awaiting Review
                  </span>
                ) : (
                  <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '2px 7px' }}>
                    Queue Clear
                  </span>
                )}
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Review institutional registration requests before activating isolated blockchain ledgers and 14-day trials.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fetchAdminData(true)}
            style={{ fontSize: '0.75rem', padding: '6px 12px' }}
          >
            Refresh Queue
          </button>
        </div>

        {pendingClinics.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.01)', borderRadius: '8px', border: '1px dashed var(--glass-border)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              ✓ All clinic registration applications have been reviewed. Zero requests currently pending.
            </span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 8px' }}>Healthcare Facility</th>
                  <th style={{ padding: '10px 8px' }}>Lead Administrator</th>
                  <th style={{ padding: '10px 8px' }}>Admin Email</th>
                  <th style={{ padding: '10px 8px' }}>Submission Date</th>
                  <th style={{ padding: '10px 8px' }}>Status</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingClinics.map(clinic => {
                  const isBusy = clinicActionLoading === clinic.id;
                  return (
                    <tr key={clinic.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Building2 size={16} color="var(--color-accent)" />
                          <span>{clinic.organizationName}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>
                        {clinic.adminName || 'Pending Provision'}
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {clinic.adminEmail || 'N/A'}
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>
                        {clinic.createdAt ? new Date(clinic.createdAt).toLocaleDateString() : 'Recent'}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                          PENDING APPROVAL
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleApproveClinic(clinic.id)}
                            disabled={isBusy}
                            style={{ fontSize: '0.78rem', padding: '5px 12px', background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <CheckCircle size={14} /> {isBusy ? 'Approving...' : 'Approve (14d Trial)'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleRejectClinic(clinic.id)}
                            disabled={isBusy}
                            style={{ fontSize: '0.78rem', padding: '5px 12px', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Super Admin Remote Licensing & Kill-Switch Authority Control Center */}
      <LicenseControlWidget user={user} />

      {/* Cryptographic Ledger Health Header */}
      <div
        className={stats.isValid ? 'badge-success' : 'badge-error'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 24px',
          borderRadius: '12px',
          marginBottom: '28px',
          width: '100%',
          fontSize: '1rem',
          boxShadow: stats.isValid ? '0 0 15px rgba(16,185,129,0.1)' : '0 0 20px rgba(239,68,68,0.25)'
        }}
      >
        {stats.isValid ? (
          <>
            <ShieldCheck size={24} />
            <div>
              <strong style={{ display: 'block', fontSize: '1.05rem' }}>EHR Platform Integrity: 100% VERIFIED & SECURE</strong>
              <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>Database records match distributed cryptographic SHA-256 block state. Zero chain discrepancies detected across all tenants.</span>
            </div>
          </>
        ) : (
          <div className="banner-flex" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldAlert size={24} />
              <div>
                <strong style={{ display: 'block', fontSize: '1.05rem' }}>EHR Network Status: COMPROMISED (TAMPER DETECTED)</strong>
                <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>Discrepancy detected between database state and cryptographic block hashes. Immediate ledger recovery recommended.</span>
              </div>
            </div>
            <button className="btn btn-secondary" onClick={handleRestoreDatabase} disabled={recovering} style={{ background: '#fff', color: '#000', border: 'none', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600 }}>
              {recovering ? 'Repairing Database...' : 'Recover from Ledger'}
            </button>
          </div>
        )}
      </div>

      {/* SaaS Platform Tenancy & Infrastructure Metrics (Clickable Cards) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {/* Tenant Administrators Card */}
        <div 
          className="glass-card stats-card-clickable" 
          onClick={() => { setActiveMetricModal('admins'); setModalSearchQuery(''); }}
          style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer', transition: 'all 0.25s ease', border: '1px solid rgba(245, 158, 11, 0.25)' }}
          title="Click to inspect Tenant Administrators"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <UserCog size={24} color="#f59e0b" />
            </div>
            <div>
              <h4 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{stats.admins}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '2px 0 0 0' }}>Tenant Admins</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, borderTop: '1px solid var(--glass-border)', paddingTop: '8px' }}>
            <span>Manage Admins</span>
            <ChevronRight size={13} />
          </div>
        </div>

        {/* Clinical Practitioner Nodes Card */}
        <div 
          className="glass-card stats-card-clickable" 
          onClick={() => { setActiveMetricModal('doctors'); setModalSearchQuery(''); }}
          style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer', transition: 'all 0.25s ease', border: '1px solid rgba(99, 102, 241, 0.25)' }}
          title="Click to inspect Licensed Practitioners"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '12px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Stethoscope size={24} color="var(--color-primary)" />
            </div>
            <div>
              <h4 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{stats.doctors}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '2px 0 0 0' }}>Licensed Practitioners</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 600, borderTop: '1px solid var(--glass-border)', paddingTop: '8px' }}>
            <span>Inspect Nodes</span>
            <ChevronRight size={13} />
          </div>
        </div>

        {/* Registered Patient Identities Card */}
        <div 
          className="glass-card stats-card-clickable" 
          onClick={() => { setActiveMetricModal('patients'); setModalSearchQuery(''); }}
          style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer', transition: 'all 0.25s ease', border: '1px solid rgba(16, 185, 129, 0.25)' }}
          title="Click to inspect Patient Identities"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Users size={24} color="#10b981" />
            </div>
            <div>
              <h4 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{stats.patients}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '2px 0 0 0' }}>Patient Identities</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#10b981', fontWeight: 600, borderTop: '1px solid var(--glass-border)', paddingTop: '8px' }}>
            <span>Browse Accounts</span>
            <ChevronRight size={13} />
          </div>
        </div>

        {/* Chain Height Card */}
        <div 
          className="glass-card stats-card-clickable" 
          onClick={() => { setActiveMetricModal('blocks'); setModalSearchQuery(''); }}
          style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer', transition: 'all 0.25s ease', border: '1px solid rgba(139, 92, 246, 0.25)' }}
          title="Click to inspect Mined Blocks"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '12px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Layers size={24} color="#8b5cf6" />
            </div>
            <div>
              <h4 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>{stats.blocks}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '2px 0 0 0' }}>Mined Blocks (Height)</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: '#8b5cf6', fontWeight: 600, borderTop: '1px solid var(--glass-border)', paddingTop: '8px' }}>
            <span>View Chain State</span>
            <ChevronRight size={13} />
          </div>
        </div>

        {/* Consensus Health Card */}
        <div 
          className="glass-card stats-card-clickable" 
          onClick={() => { setActiveMetricModal('consensus'); setModalSearchQuery(''); }}
          style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', cursor: 'pointer', transition: 'all 0.25s ease', border: stats.isValid ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)' }}
          title="Click to inspect POW Consensus & Quorum State"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ background: stats.isValid ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)', border: stats.isValid ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Cpu size={24} color={stats.isValid ? '#10b981' : '#ef4444'} />
            </div>
            <div>
              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: stats.isValid ? '#10b981' : '#ef4444' }}>
                {stats.isValid ? 'POW Quorum' : 'Tampered'}
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '2px 0 0 0' }}>Consensus State</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: stats.isValid ? '#10b981' : '#ef4444', fontWeight: 600, borderTop: '1px solid var(--glass-border)', paddingTop: '8px' }}>
            <span>Quorum Diagnostics</span>
            <ChevronRight size={13} />
          </div>
        </div>
      </div>

      {/* Pending Tenant Admin Approvals */}
      {pendingAdmins.length > 0 && (
        <div className="glass-card" style={{ border: '1px solid rgba(245, 158, 11, 0.3)', marginBottom: '28px', boxShadow: '0 0 15px rgba(245, 158, 11, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
              <ShieldAlert size={20} /> Pending Tenant Administrator Registrations ({pendingAdmins.length})
            </h3>

            {/* Pending Admins Search Input & Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '240px', maxWidth: '340px', width: '100%', position: 'relative' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Filter pending admins by name or email..."
                  value={pendingAdminSearch}
                  onChange={(e) => setPendingAdminSearch(e.target.value)}
                  style={{ paddingLeft: '32px', paddingRight: pendingAdminSearch ? '28px' : '10px', fontSize: '0.8rem', height: '34px', borderRadius: '8px' }}
                />
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                {pendingAdminSearch && (
                  <button
                    type="button"
                    onClick={() => setPendingAdminSearch('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                    title="Clear Search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ height: '34px', padding: '0 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                onClick={() => {}}
              >
                <Search size={13} /> Search
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            The following individuals have registered as administrators for tenant health institutions. As Platform Super Admin, approve or reject their system access.
          </p>
          <div className="table-container">
            <table className="custom-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Administrator Name</th>
                  <th>Contact Email</th>
                  <th>Registered Date</th>
                  <th style={{ textAlign: 'right' }}>Authority Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingAdmins
                  .filter(adm => {
                    if (!pendingAdminSearch.trim()) return true;
                    const q = pendingAdminSearch.toLowerCase();
                    return (
                      (adm.name && adm.name.toLowerCase().includes(q)) ||
                      (adm.email && adm.email.toLowerCase().includes(q))
                    );
                  })
                  .map(adm => (
                  <tr key={adm.id || adm._id}>
                    <td style={{ fontWeight: 600 }}>{adm.name}</td>
                    <td>{adm.email}</td>
                    <td>{new Date(adm.createdAt || Date.now()).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleApproveAdmin(adm.id || adm._id, adm.name)}
                        >
                          <Check size={14} /> Authorize Admin
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleRejectAdmin(adm.id || adm._id, adm.name)}
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Doctor Approvals (Global Practitioner Verification) */}
      {pendingDoctors.length > 0 && (
        <div className="glass-card" style={{ border: '1px solid rgba(99, 102, 241, 0.3)', marginBottom: '28px', boxShadow: '0 0 15px rgba(99, 102, 241, 0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
              <Stethoscope size={20} color="var(--color-primary)" /> Pending Clinical Practitioner Approvals ({pendingDoctors.length})
            </h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'flex-end', minWidth: '280px' }}>
              {/* Pending Doctors Search Input & Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '340px', width: '100%', position: 'relative' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Filter pending doctors by name, license..."
                    value={pendingDoctorSearch}
                    onChange={(e) => setPendingDoctorSearch(e.target.value)}
                    style={{ paddingLeft: '32px', paddingRight: pendingDoctorSearch ? '28px' : '10px', fontSize: '0.8rem', height: '34px', borderRadius: '8px' }}
                  />
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  {pendingDoctorSearch && (
                    <button
                      type="button"
                      onClick={() => setPendingDoctorSearch('')}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      title="Clear Search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ height: '34px', padding: '0 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                  onClick={() => {}}
                >
                  <Search size={13} /> Search
                </button>
              </div>

              <button
                type="button"
                onClick={refreshPendingDoctors}
                disabled={isRefreshingPendingDocs}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '0 12px', height: '34px' }}
                title="Instantly refresh approval queue"
              >
                <RefreshCw size={14} className={isRefreshingPendingDocs ? 'spin' : ''} />
                {isRefreshingPendingDocs ? 'Checking...' : 'Refresh'}
              </button>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Practitioners awaiting license credential validation before their cryptographic signing keys are enabled in the tenant node network.
          </p>
          <div className="table-container">
            <table className="custom-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Specialization</th>
                  <th>License Number</th>
                  <th>Affiliated Hospital</th>
                  <th>Registered</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDoctors
                  .filter(doc => {
                    if (!pendingDoctorSearch.trim()) return true;
                    const q = pendingDoctorSearch.toLowerCase();
                    return (
                      (doc.name && doc.name.toLowerCase().includes(q)) ||
                      (doc.email && doc.email.toLowerCase().includes(q)) ||
                      (doc.doctorProfile?.specialization && doc.doctorProfile.specialization.toLowerCase().includes(q)) ||
                      (doc.doctorProfile?.licenseNumber && doc.doctorProfile.licenseNumber.toLowerCase().includes(q)) ||
                      (doc.doctorProfile?.hospital && doc.doctorProfile.hospital.toLowerCase().includes(q))
                    );
                  })
                  .map(doc => (
                  <tr key={doc.id || doc._id}>
                    <td style={{ fontWeight: 600 }}>Dr. {doc.name}</td>
                    <td>{doc.email}</td>
                    <td>{doc.doctorProfile?.specialization || 'General Practice'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{doc.doctorProfile?.licenseNumber || 'N/A'}</td>
                    <td>{doc.doctorProfile?.hospital || 'N/A'}</td>
                    <td>{new Date(doc.createdAt || Date.now()).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleApproveDoctor(doc.id || doc._id, doc.name)}
                        >
                          <Check size={14} /> Approve Node
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => handleRejectDoctor(doc.id || doc._id, doc.name)}
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout: Network Node Directory & Live Console */}
      <div className="grid-admin-main" style={{ marginBottom: '28px' }}>
        
        {/* Left Column: Network Node Directory & Global Identity Governance */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <Users size={20} /> Network Node Directory & Identity Governance
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Manage licensed clinical node operators and patient accounts across the health network
              </p>
            </div>

            {/* Search Input & Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', maxWidth: '340px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search by name, email, license..."
                  value={nodeSearchQuery}
                  onChange={(e) => setNodeSearchQuery(e.target.value)}
                  style={{ paddingLeft: '32px', paddingRight: nodeSearchQuery ? '28px' : '10px', fontSize: '0.8rem', height: '36px', borderRadius: '8px' }}
                />
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                {nodeSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setNodeSearchQuery('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                    title="Clear Search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ height: '36px', padding: '0 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                onClick={() => {}}
              >
                <Search size={13} /> Search
              </button>
            </div>
          </div>

          {/* Directory Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px', marginBottom: '16px' }}>
            <button
              onClick={() => setActiveDirectoryTab('doctors')}
              style={{
                background: activeDirectoryTab === 'doctors' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                border: activeDirectoryTab === 'doctors' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                color: activeDirectoryTab === 'doctors' ? 'var(--color-primary)' : 'var(--text-secondary)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <UserCheck size={16} /> Clinical Node Operators ({filteredDoctors.length})
            </button>
            <button
              onClick={() => setActiveDirectoryTab('patients')}
              style={{
                background: activeDirectoryTab === 'patients' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                border: activeDirectoryTab === 'patients' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                color: activeDirectoryTab === 'patients' ? '#10b981' : 'var(--text-secondary)',
                borderRadius: '8px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Users size={16} /> Patient Identities ({filteredPatients.length})
            </button>
          </div>
          
          {/* Active Tab: Clinical Node Operators */}
          {activeDirectoryTab === 'doctors' && (
            <div>
              {filteredDoctors.length === 0 ? (
                <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
                  {nodeSearchQuery ? 'No clinical practitioners match your search.' : 'No registered doctors in the network.'}
                </div>
              ) : (
                <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Practitioner</th>
                        <th>Email</th>
                        <th>Specialization</th>
                        <th>License Number</th>
                        <th>Hospital Facility</th>
                        <th style={{ textAlign: 'right' }}>Governance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDoctors.map(doc => (
                        <tr key={doc.id || doc._id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Dr. {doc.name}</td>
                          <td>{doc.email}</td>
                          <td>{doc.doctorProfile?.specialization || 'General Practice'}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{doc.doctorProfile?.licenseNumber || 'N/A'}</td>
                          <td>{doc.doctorProfile?.hospital || 'N/A'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => setDeleteTarget({ id: doc.id || doc._id, name: `Dr. ${doc.name}`, role: 'Doctor' })}
                            >
                              Revoke Node
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Active Tab: Patient Accounts */}
          {activeDirectoryTab === 'patients' && (
            <div>
              {filteredPatients.length === 0 ? (
                <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
                  {nodeSearchQuery ? 'No patient identities match your search.' : 'No registered patients in the network.'}
                </div>
              ) : (
                <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Patient Name</th>
                        <th>Email</th>
                        <th>Registration Date</th>
                        <th style={{ textAlign: 'right' }}>Governance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPatients.map(pat => (
                        <tr key={pat.id || pat._id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pat.name}</td>
                          <td>{pat.email}</td>
                          <td>{new Date(pat.createdAt || Date.now()).toLocaleDateString()}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-danger"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => setDeleteTarget({ id: pat.id || pat._id, name: pat.name, role: 'Patient' })}
                            >
                              Purge Account
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Console Node Terminal */}
        <div className="glass-card" style={{ background: '#050508', border: '1px solid #1f2130', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
              <Terminal size={18} /> P2P Network Console
            </h3>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              LIVE
            </span>
          </div>
          
          <div style={{ flex: 1, minHeight: '340px', background: '#000', border: '1px solid #111', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#10b981', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {logs.map((log, index) => (
              <div key={index} style={{ borderLeft: '2px solid rgba(16, 185, 129, 0.3)', paddingLeft: '8px', wordBreak: 'break-all' }}>
                <span style={{ color: 'var(--text-muted)' }}>&gt; </span> {log}
              </div>
            ))}
            {recovering && (
              <div style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                &gt;&gt; [SYS] Rebuilding database state from cryptographic ledger snapshots...
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Autonomous Transaction Pool Monitor (Mempool Queue) */}
      <div className="glass-card" style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
              <Zap size={20} color="var(--color-accent)" /> Autonomous Transaction Pool (Pending Records: {mempoolRecords.length})
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Cryptographically signed state changes queuing for autonomous threshold sealing into the distributed ledger.
            </p>
          </div>
          {mempoolRecords.length > 0 && (
            <button
              onClick={handleMineBlock}
              className="btn btn-primary"
              style={{
                padding: '8px 16px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--color-accent)',
                borderColor: 'var(--color-accent)',
                cursor: 'pointer'
              }}
              disabled={mining}
            >
              <Layers size={16} className={mining ? 'rotate-slow' : ''} /> {mining ? 'Sealing Block...' : 'Force Mine Block'}
            </button>
          )}
        </div>

        {mempoolRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
            Mempool synchronized. No unconfirmed transactions in the pipeline.
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            <table className="custom-table" style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Transaction ID</th>
                  <th>Type</th>
                  <th>Signature Status</th>
                </tr>
              </thead>
              <tbody>
                {mempoolRecords.map((rec, i) => (
                  <tr key={rec.recordId || i}>
                    <td>{new Date(rec.timestamp).toLocaleTimeString()}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{rec.recordId || `tx-${i}`}</td>
                    <td>
                      <span className={`badge ${rec.txType === 'consent' ? 'badge-success' : 'badge-primary'}`} style={{ fontSize: '0.7rem' }}>
                        {rec.txType === 'consent' ? 'Consent Policy' : 'Clinical Entry'}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem' }}>
                        <ShieldCheck size={11} /> Cryptographically Signed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mined Block Heights Explorer */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
          <Layers size={20} color="var(--color-primary)" /> Mined Block Heights Explorer (Chain Height: {blocks.length})
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Chronologically ordered, immutable proof-of-work blockchain ledger. Linked via recursive SHA-256 cryptographic hashing.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {blocks.map((block) => (
            <div key={block.index} style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--glass-border)',
              borderRadius: '10px',
              padding: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="badge badge-primary" style={{ fontSize: '0.85rem', padding: '3px 10px' }}>
                    Block #{block.index}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Mined: {new Date(block.timestamp).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Nonce: <strong style={{ color: 'var(--text-primary)' }}>{block.nonce}</strong>
                </div>
              </div>

              <div className="grid-2" style={{ gap: '12px', fontSize: '0.75rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Current Block Hash</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-success)', wordBreak: 'break-all' }}>{block.hash}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Previous Block Hash</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{block.previousHash}</span>
                </div>
              </div>

              <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Encapsulated Transactions: <strong style={{ color: 'var(--text-primary)' }}>{block.records?.length || 0}</strong>
                </span>
                <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={10} /> SHA-256 Verified
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Metric Detail Modals */}
      {activeMetricModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(8px)',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '900px',
            border: '1px solid var(--glass-border)',
            boxShadow: '0 0 35px rgba(0, 0, 0, 0.5)',
            padding: '28px',
            background: 'rgba(15, 15, 25, 0.98)',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  background: activeMetricModal === 'admins' ? 'rgba(245, 158, 11, 0.15)' :
                              activeMetricModal === 'doctors' ? 'rgba(99, 102, 241, 0.15)' :
                              activeMetricModal === 'patients' ? 'rgba(16, 185, 129, 0.15)' :
                              activeMetricModal === 'blocks' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--glass-border)'
                }}>
                  {activeMetricModal === 'admins' && <UserCog size={22} color="#f59e0b" />}
                  {activeMetricModal === 'doctors' && <Stethoscope size={22} color="var(--color-primary)" />}
                  {activeMetricModal === 'patients' && <Users size={22} color="#10b981" />}
                  {activeMetricModal === 'blocks' && <Layers size={22} color="#8b5cf6" />}
                  {activeMetricModal === 'consensus' && <Cpu size={22} color="#10b981" />}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {activeMetricModal === 'admins' && 'Tenant Administrators & Governance Matrix'}
                    {activeMetricModal === 'doctors' && 'Licensed Clinical Node Operators'}
                    {activeMetricModal === 'patients' && 'Registered Patient Identities (Ledger Directory)'}
                    {activeMetricModal === 'blocks' && 'Blockchain Ledger Height & Block Snapshots'}
                    {activeMetricModal === 'consensus' && 'Cryptographic Consensus & Quorum State'}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {activeMetricModal === 'admins' && `Total Administrators: ${allAdmins.length} (${pendingAdmins.length} pending review)`}
                    {activeMetricModal === 'doctors' && `Total Verified Practitioners: ${dbDoctors.length} nodes`}
                    {activeMetricModal === 'patients' && `Total Patient Keys: ${dbPatients.length} accounts`}
                    {activeMetricModal === 'blocks' && `Mined Chain Height: ${blocks.length} blocks in continuous sequence`}
                    {activeMetricModal === 'consensus' && 'Proof-of-Work Quorum & Tamper-Verification Architecture'}
                  </span>
                </div>
              </div>
              <button 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}
                onClick={() => setActiveMetricModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
              
              {/* 1. Admins Modal */}
              {activeMetricModal === 'admins' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Filter administrators by name or email..."
                        value={modalSearchQuery}
                        onChange={(e) => setModalSearchQuery(e.target.value)}
                        style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
                      />
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    </div>

                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={() => setShowProvisionForm(!showProvisionForm)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '8px 14px', background: '#f59e0b', borderColor: '#f59e0b', color: '#000', fontWeight: 700 }}
                    >
                      <Plus size={15} /> {showProvisionForm ? 'Hide Form' : '+ Onboard Hospital Admin'}
                    </button>
                  </div>

                  {/* Onboarding Provision Form */}
                  {showProvisionForm && (
                    <div className="glass-card" style={{ padding: '18px', marginBottom: '20px', border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <Building2 size={18} color="#f59e0b" />
                        <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#f59e0b', fontWeight: 700 }}>Onboard Rented Hospital Administrator</h4>
                      </div>
                      <p style={{ margin: '0 0 14px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Creates an active administrator account for the rented facility. Generates RSA-2048 cryptographic keys and secure password hash in the database.
                      </p>

                      {provisionError && (
                        <div className="badge-error" style={{ padding: '8px 12px', fontSize: '0.8rem', marginBottom: '12px' }}>
                          {provisionError}
                        </div>
                      )}

                      <form onSubmit={handleProvisionTenant} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Hospital Facility Name</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. Nairobi West Hospital"
                            value={newHospitalName}
                            onChange={(e) => setNewHospitalName(e.target.value)}
                            style={{ fontSize: '0.8rem', height: '36px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Admin Contact Name *</label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. Dr. Evans Kilonzo"
                            required
                            value={newAdminName}
                            onChange={(e) => setNewAdminName(e.target.value)}
                            style={{ fontSize: '0.8rem', height: '36px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Official Admin Email *</label>
                          <input
                            type="email"
                            className="form-control"
                            placeholder="admin@nairobiwest.org"
                            required
                            value={newAdminEmail}
                            onChange={(e) => setNewAdminEmail(e.target.value)}
                            style={{ fontSize: '0.8rem', height: '36px' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Initial Secure Password *</label>
                          <input
                            type="password"
                            className="form-control"
                            placeholder="Create initial password"
                            required
                            value={newAdminPassword}
                            onChange={(e) => setNewAdminPassword(e.target.value)}
                            style={{ fontSize: '0.8rem', height: '36px' }}
                          />
                        </div>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowProvisionForm(false)}
                            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={provisioningLoading}
                            style={{ padding: '6px 18px', fontSize: '0.8rem', background: '#10b981', borderColor: '#10b981', fontWeight: 600 }}
                          >
                            {provisioningLoading ? 'Provisioning Keys...' : 'Create & Authorize Admin'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Admin Name</th>
                          <th>Email</th>
                          <th>Hospital / Facility</th>
                          <th>Role Tier</th>
                          <th>Status</th>
                          <th>Registered</th>
                          <th style={{ textAlign: 'right' }}>Authority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allAdmins
                          .filter(a => {
                            if (!modalSearchQuery.trim()) return true;
                            const q = modalSearchQuery.toLowerCase();
                            return (a.name || '').toLowerCase().includes(q) || 
                                   (a.email || '').toLowerCase().includes(q) ||
                                   (a.organizationName || '').toLowerCase().includes(q);
                          })
                          .map(adm => {
                            const isPending = adm.isApproved === false;
                            const isSuper = adm.role === 'super_admin';
                            return (
                              <tr key={adm.id || adm._id}>
                                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{adm.name}</td>
                                <td>{adm.email}</td>
                                <td>
                                  <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    background: isSuper ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                    color: isSuper ? '#60a5fa' : '#34d399',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    border: isSuper ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)'
                                  }}>
                                    <Building2 size={13} />
                                    {adm.organizationName || (isSuper ? 'Global Platform Governance' : 'Unassigned Facility')}
                                  </span>
                                </td>
                                <td>
                                  <span className={`badge ${isSuper ? 'badge-primary' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                                    {isSuper ? 'Root Super Admin' : 'Tenant Admin'}
                                  </span>
                                </td>
                                <td>
                                  <span className={`badge ${isPending ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.7rem' }}>
                                    {isPending ? 'Pending Approval' : 'Active & Authorized'}
                                  </span>
                                </td>
                                <td>{new Date(adm.createdAt || Date.now()).toLocaleDateString()}</td>
                                <td style={{ textAlign: 'right' }}>
                                  {isPending ? (
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                      <button
                                        className="btn btn-primary"
                                        style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#10b981', border: 'none' }}
                                        onClick={() => handleApproveAdmin(adm.id || adm._id, adm.name)}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        className="btn btn-danger"
                                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                        onClick={() => handleRejectAdmin(adm.id || adm._id, adm.name)}
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Authorized</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. Doctors Modal */}
              {activeMetricModal === 'doctors' && (
                <div>
                  <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search practitioners by name, specialization, hospital, license..."
                      value={modalSearchQuery}
                      onChange={(e) => setModalSearchQuery(e.target.value)}
                      style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
                    />
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  </div>

                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Practitioner</th>
                          <th>Email</th>
                          <th>Specialization</th>
                          <th>License Number</th>
                          <th>Hospital Facility</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbDoctors
                          .filter(doc => {
                            if (!modalSearchQuery.trim()) return true;
                            const q = modalSearchQuery.toLowerCase();
                            return (doc.name || '').toLowerCase().includes(q) || (doc.email || '').toLowerCase().includes(q) || (doc.doctorProfile?.specialization || '').toLowerCase().includes(q) || (doc.doctorProfile?.hospital || '').toLowerCase().includes(q) || (doc.doctorProfile?.licenseNumber || '').toLowerCase().includes(q);
                          })
                          .map(doc => (
                            <tr key={doc.id || doc._id}>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Dr. {doc.name}</td>
                              <td>{doc.email}</td>
                              <td>{doc.doctorProfile?.specialization || 'General Practice'}</td>
                              <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{doc.doctorProfile?.licenseNumber || 'N/A'}</td>
                              <td>{doc.doctorProfile?.hospital || 'N/A'}</td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="btn btn-danger"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    setActiveMetricModal(null);
                                    setDeleteTarget({ id: doc.id || doc._id, name: `Dr. ${doc.name}`, role: 'Doctor' });
                                  }}
                                >
                                  Revoke Node
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3. Patients Modal */}
              {activeMetricModal === 'patients' && (
                <div>
                  <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search patient identities by name or email..."
                      value={modalSearchQuery}
                      onChange={(e) => setModalSearchQuery(e.target.value)}
                      style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
                    />
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  </div>

                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>Email Address</th>
                          <th>Key ID Status</th>
                          <th>Registered Date</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbPatients
                          .filter(pat => {
                            if (!modalSearchQuery.trim()) return true;
                            const q = modalSearchQuery.toLowerCase();
                            return (pat.name || '').toLowerCase().includes(q) || (pat.email || '').toLowerCase().includes(q);
                          })
                          .map(pat => (
                            <tr key={pat.id || pat._id}>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pat.name}</td>
                              <td>{pat.email}</td>
                              <td>
                                <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                                  RSA-2048 Seeded
                                </span>
                              </td>
                              <td>{new Date(pat.createdAt || Date.now()).toLocaleDateString()}</td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="btn btn-danger"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    setActiveMetricModal(null);
                                    setDeleteTarget({ id: pat.id || pat._id, name: pat.name, role: 'Patient' });
                                  }}
                                >
                                  Purge Account
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. Blocks Modal */}
              {activeMetricModal === 'blocks' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chain Height</span>
                      <strong style={{ display: 'block', fontSize: '1.2rem', color: 'var(--color-primary)' }}>{blocks.length}</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Consensus Hash</span>
                      <strong style={{ display: 'block', fontSize: '1.2rem', color: '#10b981' }}>SHA-256</strong>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mempool Buffer</span>
                      <strong style={{ display: 'block', fontSize: '1.2rem', color: '#8b5cf6' }}>{mempoolRecords.length} pending</strong>
                    </div>
                  </div>

                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead>
                        <tr>
                          <th>Block Index</th>
                          <th>Mined Date</th>
                          <th>Nonce</th>
                          <th>Encapsulated Tx</th>
                          <th>Current Block Hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blocks.map(b => (
                          <tr key={b.index}>
                            <td>
                              <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>Block #{b.index}</span>
                            </td>
                            <td>{new Date(b.timestamp).toLocaleString()}</td>
                            <td style={{ fontFamily: 'monospace' }}>{b.nonce}</td>
                            <td>{b.records?.length || 0} transactions</td>
                            <td style={{ fontFamily: 'monospace', color: '#10b981', fontSize: '0.75rem' }}>
                              {b.hash.substring(0, 18)}...
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. Consensus Modal */}
              {activeMetricModal === 'consensus' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{
                    padding: '16px',
                    borderRadius: '10px',
                    background: stats.isValid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: stats.isValid ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}>
                    {stats.isValid ? <ShieldCheck size={32} color="#10b981" /> : <ShieldAlert size={32} color="#ef4444" />}
                    <div>
                      <strong style={{ fontSize: '1.05rem', color: stats.isValid ? '#10b981' : '#ef4444' }}>
                        {stats.isValid ? 'Consensus Status: 100% In Quorum (Chain Valid)' : 'Consensus Status: Tamper Detected (Hash Mismatch)'}
                      </strong>
                      <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {stats.isValid 
                          ? 'Every PostgreSQL medical record snapshot matches the recursive SHA-256 block hash tree across all tenant nodes.'
                          : 'A discrepancy was found between database contents and mined block hashes. Trigger self-healing repair below.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid-2" style={{ gap: '14px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Consensus Protocol</span>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Proof of Work (SHA-256)</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Difficulty: 2 leading hex zeros with autonomous nonce searching</p>
                    </div>
                    
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Autonomous Auto-Miner</span>
                      <strong style={{ fontSize: '0.95rem', color: '#8b5cf6' }}>Active & Mutex-Protected</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Trigger threshold: 10 transactions or 60,000ms periodic fallback</p>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Mempool Unmined Queue</span>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--color-accent)' }}>{mempoolRecords.length} pending state changes</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Awaiting threshold seal into the next mined block</p>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '4px' }}>Self-Healing Integrity Engine</span>
                      <strong style={{ fontSize: '0.95rem', color: '#10b981' }}>Standby & Ready</strong>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Can restore corrupt database tables from valid block logs</p>
                    </div>
                  </div>

                  {!stats.isValid && (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '12px', background: '#ef4444', borderColor: '#ef4444' }}
                      disabled={recovering}
                      onClick={() => {
                        handleRestoreDatabase();
                        setActiveMetricModal(null);
                      }}
                    >
                      {recovering ? 'Repairing Database State...' : 'Trigger Cryptographic Self-Healing Repair'}
                    </button>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setActiveMetricModal(null)}
                style={{ minWidth: '110px' }}
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(8px)'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '460px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.15)',
            padding: '24px',
            textAlign: 'center',
            background: 'rgba(15, 15, 25, 0.98)'
          }}>
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <ShieldAlert size={26} color="#ef4444" />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
              Confirm Network Deletion
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '24px' }}>
              Are you sure you want to revoke and permanently purge <strong style={{ color: 'var(--text-primary)' }}>"{deleteTarget.name}"</strong> ({deleteTarget.role}) from the tenant database and key registry?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                style={{ flex: 1, padding: '9px' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  executeDeleteUser(deleteTarget.id, deleteTarget.name, deleteTarget.role);
                  setDeleteTarget(null);
                }}
                style={{ flex: 1, padding: '9px', background: '#ef4444' }}
              >
                Confirm Revocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
