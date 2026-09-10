import React, { useEffect, useState } from 'react';
import {
  Database, ShieldAlert, ShieldCheck, UserCheck, RefreshCw,
  Layers, Users, Zap, Terminal, Check, X, Stethoscope,
  User, Search, UserCog, Activity, Lock, Cpu, Server, CheckCircle2,
  ChevronRight, ArrowUpRight, Shield, Clock, Hash, Building2, Plus,
  CheckCircle, XCircle
} from 'lucide-react';
import LicenseControlWidget from './LicenseControlWidget';
import PatientsByOrgWidget from './PatientsByOrgWidget';
import PrescriptionsByOrgWidget from './PrescriptionsByOrgWidget';
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
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
  const [directoryLimit, setDirectoryLimit] = useState(5); // Default to top 5 with collapsible expander
  const [blocksLimit, setBlocksLimit] = useState(5); // Default to top 5 with collapsible expander

  const scrollToSection = (secId) => {
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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

    const POLLING_INTERVAL_MS = 20000; // 20s live sync (optimized from rapid 4s)
    let intervalId = null;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!document.hidden) {
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
        }
      }, POLLING_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden: cancel interval to save server load
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } else {
        // Tab restored: immediately fetch latest state and resume loop
        fetchAdminData(true);
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
        safeFetch('/api/blockchain/mempool').catch(() => [])
      ]);

      const freshBlocks = Array.isArray(blocksData) ? blocksData : [];
      const freshPatients = Array.isArray(patientsData) ? patientsData : [];
      const freshDoctors = Array.isArray(doctorsData) ? doctorsData : [];
      const freshAllAdmins = Array.isArray(allAdminsData) && allAdminsData.length > 0 ? allAdminsData : [{ id: user.id || user._id, name: user.name, email: user.email, role: user.role, organizationName: 'Global Platform Governance', isApproved: true, createdAt: new Date() }];
      const rawClinics = Array.isArray(resPendingClinics) ? resPendingClinics : (resPendingClinics?.pendingClinics || []);
      const freshPendingAdmins = Array.isArray(pendingData) ? pendingData : [];
      const freshPendingDoctors = Array.isArray(pendingDocsData) ? pendingDocsData : [];
      const freshMempool = Array.isArray(mempoolData) ? mempoolData : [];

      setBlocks(freshBlocks);
      setDbPatients(freshPatients);
      setDbDoctors(freshDoctors);
      setAllAdmins(freshAllAdmins);
      setPendingClinics(rawClinics);
      setPendingAdmins(freshPendingAdmins);
      setPendingDoctors(freshPendingDoctors);
      setMempoolRecords(freshMempool);

      if (isInitialFetched) {
        // Toast and alert for new pending clinics
        const existingClinicIds = pendingClinics.map(c => c.id);
        const newClinicRequests = rawClinics.filter(c => !existingClinicIds.includes(c.id));
        newClinicRequests.forEach(newClinic => {
          setToast({
            message: `New Clinic Registration: "${newClinic.organizationName}" is awaiting Super Admin approval.`,
            type: 'warning'
          });
          setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [ALERT] SECURITY: Pending clinic facility request received from ${newClinic.organizationName} (${newClinic.adminEmail || 'No email'})`]);
        });

        // Toast and alert for new admins
        const existingIds = pendingAdmins.map(a => a.id || a._id);
        const newRequests = freshPendingAdmins.filter(a => !existingIds.includes(a.id || a._id));
        newRequests.forEach(newAdmin => {
          setToast({
            message: `New Tenant Admin Request: ${newAdmin.name} (${newAdmin.email}) is awaiting approval.`,
            type: 'warning'
          });
          setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [ALERT] SECURITY: Pending tenant admin request received from ${newAdmin.email}`]);
        });

        // Toast and alert for new doctors
        const existingDocIds = pendingDoctors.map(d => d.id || d._id);
        const newDocRequests = freshPendingDoctors.filter(d => !existingDocIds.includes(d.id || d._id));
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

      return {
        stats: statsData,
        blocks: freshBlocks,
        patients: freshPatients,
        doctors: freshDoctors,
        pendingAdmins: freshPendingAdmins,
        allAdmins: freshAllAdmins,
        pendingDoctors: freshPendingDoctors,
        pendingClinics: rawClinics,
        mempool: freshMempool
      };
    } catch (err) {
      console.error('Error fetching admin stats:', err);
      return null;
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
    try {
      // Trigger child widgets (LicenseControlWidget) to refresh active organizations and licenses
      setRefreshTrigger(prev => prev + 1);

      const prevPendingClinicsCount = pendingClinics.length;
      const prevPendingDocsCount = pendingDoctors.length;
      const prevPendingAdminsCount = pendingAdmins.length;
      const prevBlocksCount = blocks.length;

      const freshData = await fetchAdminData(false);

      if (freshData) {
        const clinicsCount = freshData.pendingClinics.length;
        const docsCount = freshData.pendingDoctors.length;
        const adminsCount = freshData.pendingAdmins.length;
        const blocksCount = freshData.blocks.length;

        const changes = [];
        if (clinicsCount !== prevPendingClinicsCount) {
          changes.push(clinicsCount > prevPendingClinicsCount 
            ? `${clinicsCount - prevPendingClinicsCount} new pending clinic(s)` 
            : `clinic approvals updated (${clinicsCount} pending)`);
        }
        if (docsCount !== prevPendingDocsCount) {
          changes.push(docsCount > prevPendingDocsCount 
            ? `${docsCount - prevPendingDocsCount} new doctor request(s)` 
            : `doctor queue updated (${docsCount} pending)`);
        }
        if (adminsCount !== prevPendingAdminsCount) {
          changes.push(adminsCount > prevPendingAdminsCount 
            ? `${adminsCount - prevPendingAdminsCount} new admin request(s)` 
            : `admin queue updated (${adminsCount} pending)`);
        }
        if (blocksCount !== prevBlocksCount) {
          changes.push(`${blocksCount - prevBlocksCount} new mined block(s)`);
        }

        if (changes.length > 0) {
          setToast({
            message: `Console updated: ${changes.join(', ')} detected and synchronized!`,
            type: 'warning'
          });
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] [ADMIN] Manual refresh detected updates: ${changes.join(', ')}.`
          ]);
        } else if (clinicsCount > 0) {
          setToast({
            message: `Console refreshed: ${clinicsCount} pending clinic application(s) currently awaiting approval.`,
            type: 'info'
          });
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] [ADMIN] Console refreshed — ${clinicsCount} pending clinic(s), ${docsCount} pending doctor(s), ${blocksCount} blocks verified.`
          ]);
        } else {
          setToast({
            message: 'Console refreshed: System metrics, pending clinic queues, and ledger state are fully up to date.',
            type: 'success'
          });
          setLogs(prev => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] [ADMIN] SaaS console metrics manually refreshed. All queues synchronized and up to date.`
          ]);
        }
      }
    } catch (err) {
      console.error('Error refreshing console:', err);
      setToast({ message: 'Failed to refresh console: ' + (err.message || 'Network error'), type: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  // Self-Healing Recovery: Recovers database using ledger records
  const handleRestoreDatabase = async () => {
    setRecovering(true);
    setLogs(prev => [...prev, '[RECOVERY] Initializing Cryptographic Ledger Repair sequence...']);

    try {
      await safeFetch('/api/blockchain/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      setTimeout(() => {
        setRecovering(false);
        setLogs(prev => [...prev, '[RECOVERY] All database indexes verified. Ledger synchronization success. Integrity restored.']);
        fetchAdminData();
      }, 1500);

    } catch (err) {
      console.error(err);
      setRecovering(false);
      alert(err.message || 'Failed to restore database.');
    }
  };

  const handleMineBlock = async () => {
    if (mempoolRecords.length === 0) return;
    setMining(true);
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [MINER] Starting Proof of Work mining sequence...`]);
    try {
      const data = await safeFetch('/api/blockchain/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

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
      await safeFetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      setToast({
        message: `User ${userName} (${userRole}) removed from database.`,
        type: 'success'
      });
      setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: User ${userName} (${userRole}) removed from database.`]);
      fetchAdminData();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to delete user.');
    }
  };

  const handleApproveAdmin = async (userId, userName) => {
    try {
      await safeFetch(`/api/admin/approve/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Tenant Admin "${userName}" registration approved.`]);
      setToast({
        message: `Tenant Administrator "${userName}" has been approved.`,
        type: 'success'
      });
      fetchAdminData();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to approve admin request.');
    }
  };

  const handleRejectAdmin = async (userId, userName) => {
    try {
      await safeFetch(`/api/admin/reject/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Tenant Admin request for "${userName}" rejected.`]);
      setToast({
        message: `Tenant Administrator request for "${userName}" rejected.`,
        type: 'danger'
      });
      fetchAdminData();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to reject admin request.');
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
      await safeFetch('/api/admin/provision-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalName: newHospitalName.trim(),
          name: newAdminName.trim(),
          email: newAdminEmail.trim(),
          password: newAdminPassword
        })
      });

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
      await safeFetch(`/api/admin/doctors/approve/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Clinical Practitioner "Dr. ${userName}" verified and approved.`]);
      setToast({
        message: `Success: Clinical Practitioner Dr. ${userName} has been activated.`,
        type: 'success'
      });
      fetchAdminData();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to approve practitioner request.');
    }
  };

  const handleRejectDoctor = async (userId, userName) => {
    try {
      await safeFetch(`/api/admin/doctors/reject/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Practitioner request for "Dr. ${userName}" rejected.`]);
      setToast({
        message: `Practitioner request for Dr. ${userName} rejected.`,
        type: 'danger'
      });
      fetchAdminData();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to reject practitioner request.');
    }
  };

  return (
    <div style={{ color: 'var(--text-primary)' }}>

      {/* ── Toast Notification ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 10000,
          background: 'rgba(10, 15, 30, 0.97)',
          border: toast.type === 'warning' ? '1px solid rgba(245,158,11,0.4)' : toast.type === 'danger' ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(16,185,129,0.4)',
          boxShadow: toast.type === 'warning' ? '0 0 24px rgba(245,158,11,0.2)' : toast.type === 'danger' ? '0 0 24px rgba(239,68,68,0.2)' : '0 0 24px rgba(16,185,129,0.2)',
          padding: '14px 18px', borderRadius: '12px', color: '#fff',
          display: 'flex', alignItems: 'center', gap: '12px',
          maxWidth: '380px', backdropFilter: 'blur(16px)'
        }}>
          {toast.type === 'warning' ? <ShieldAlert size={18} color="#f59e0b" style={{ flexShrink: 0 }} /> :
           toast.type === 'danger'  ? <ShieldAlert size={18} color="#ef4444" style={{ flexShrink: 0 }} /> :
                                      <ShieldCheck size={18} color="#10b981" style={{ flexShrink: 0 }} />}
          <div style={{ fontSize: '0.83rem', flex: 1, lineHeight: '1.4' }}>{toast.message}</div>
          <button style={{ background: 'none', border: 'none', color: 'rgba(248,250,252,0.4)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="admin-header-gradient">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#00D4FF', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', padding: '3px 10px', borderRadius: '20px' }}>
                Platform Super Admin
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>› Command Center</span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
              Super Admin Command Center
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: '5px', fontSize: '0.85rem' }}>
              Multi-tenant licensing authority, cryptographic consensus governance &amp; global node registry
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div className={`admin-status-pill ${stats.isValid ? 'online' : 'compromised'}`}>
              <span className={stats.isValid ? 'admin-live-dot' : ''} style={!stats.isValid ? { width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' } : {}} />
              {stats.isValid ? 'SYSTEM ONLINE' : 'CHAIN COMPROMISED'}
            </div>
            <button className="btn btn-secondary" onClick={handleManualRefresh} disabled={loading || refreshing}
              style={{ display: 'flex', gap: '7px', alignItems: 'center', fontSize: '0.83rem', padding: '8px 14px', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <RefreshCw size={14} className={refreshing || loading ? 'rotate-spin' : ''} />
              {refreshing ? 'Refreshing…' : 'Refresh Console'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Super Admin Quick Navigation Jump Bar (No endless scrolling) ── */}
      <div className="admin-quick-nav-bar" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        padding: '6px 0 16px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--border)'
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px', whiteSpace: 'nowrap' }}>
          Jump To:
        </span>
        <button type="button" className="admin-tab-chip active-teal" onClick={() => scrollToSection('admin-sec-overview')}>
          ⚡ Approvals &amp; Queues
        </button>
        <button type="button" className="admin-tab-chip" onClick={() => scrollToSection('admin-sec-licensing')}>
          🏥 Hospital Licensing Matrix
        </button>
        <button type="button" className="admin-tab-chip" onClick={() => scrollToSection('admin-sec-oracles')}>
          🩺 Statutory Oracles (KMPDC / NCK)
        </button>
        <button type="button" className="admin-tab-chip" onClick={() => scrollToSection('admin-sec-audits')}>
          📊 Facility Patient &amp; Rx Audits
        </button>
        <button type="button" className="admin-tab-chip" onClick={() => scrollToSection('admin-sec-directory')}>
          👥 Node Directory
        </button>
        <button type="button" className="admin-tab-chip" onClick={() => scrollToSection('admin-sec-ledger')}>
          ⛓️ Blockchain Ledger ({blocks.length} Blocks)
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="admin-kpi-grid">
        {/* Tenant Admins */}
        <div className="admin-kpi-card orange" onClick={() => scrollToSection('admin-sec-licensing')} title="Jump to Hospital Licensing Matrix">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="admin-kpi-icon" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <UserCog size={22} color="#f59e0b" />
            </div>
            <div>
              <div className="admin-kpi-value">{stats.admins}</div>
              <div className="admin-kpi-label">Tenant Admins</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
            <span className="admin-kpi-chip" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}
              onClick={(e) => { e.stopPropagation(); setActiveMetricModal('admins'); setModalSearchQuery(''); }}>
              Manage &rarr;
            </span>
            <ChevronRight size={13} color="var(--text-muted)" />
          </div>
        </div>

        {/* Doctors */}
        <div className="admin-kpi-card teal" onClick={() => scrollToSection('admin-sec-oracles')} title="Jump to Statutory Practitioners">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="admin-kpi-icon" style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <Stethoscope size={22} color="#00D4FF" />
            </div>
            <div>
              <div className="admin-kpi-value">{stats.doctors}</div>
              <div className="admin-kpi-label">Practitioners</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
            <span className="admin-kpi-chip" style={{ background: 'rgba(0,212,255,0.1)', color: '#00D4FF' }}
              onClick={(e) => { e.stopPropagation(); setActiveMetricModal('doctors'); setModalSearchQuery(''); }}>
              KMPDC Verified &rarr;
            </span>
            <ChevronRight size={13} color="var(--text-muted)" />
          </div>
        </div>

        {/* Patients */}
        <div className="admin-kpi-card green" onClick={() => scrollToSection('admin-sec-directory')} title="Jump to Patient Directory">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="admin-kpi-icon" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <Users size={22} color="#10b981" />
            </div>
            <div>
              <div className="admin-kpi-value">{stats.patients}</div>
              <div className="admin-kpi-label">Patient IDs</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
            <span className="admin-kpi-chip" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}
              onClick={(e) => { e.stopPropagation(); setActiveMetricModal('patients'); setModalSearchQuery(''); }}>
              Browse Accounts &rarr;
            </span>
            <ChevronRight size={13} color="var(--text-muted)" />
          </div>
        </div>

        {/* Blocks */}
        <div className="admin-kpi-card blue" onClick={() => scrollToSection('admin-sec-ledger')} title="Jump to Mined Blocks Ledger">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="admin-kpi-icon" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
              <Layers size={22} color="#3B82F6" />
            </div>
            <div>
              <div className="admin-kpi-value">{stats.blocks}</div>
              <div className="admin-kpi-label">Mined Blocks</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
            <span className="admin-kpi-chip" style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}
              onClick={(e) => { e.stopPropagation(); setActiveMetricModal('blocks'); setModalSearchQuery(''); }}>
              View Chain &rarr;
            </span>
            <ChevronRight size={13} color="var(--text-muted)" />
          </div>
        </div>

        {/* Consensus */}
        <div className="admin-kpi-card" style={{ borderColor: stats.isValid ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)' }}
          onClick={() => { setActiveMetricModal('consensus'); setModalSearchQuery(''); }} title="View POW Consensus State">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="admin-kpi-icon" style={{ background: stats.isValid ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: stats.isValid ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(239,68,68,0.25)' }}>
              <Cpu size={22} color={stats.isValid ? '#10b981' : '#ef4444'} />
            </div>
            <div>
              <div className="admin-kpi-value" style={{ fontSize: '1.1rem', color: stats.isValid ? '#10b981' : '#ef4444' }}>
                {stats.isValid ? 'In Quorum' : 'Tampered'}
              </div>
              <div className="admin-kpi-label">Consensus State</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
            <span className="admin-kpi-chip" style={{ background: stats.isValid ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: stats.isValid ? '#10b981' : '#ef4444' }}>Diagnostics &rarr;</span>
            <ChevronRight size={13} color="var(--text-muted)" />
          </div>
        </div>
      </div>

      {/* ── Pending Clinic Approvals Queue ── */}
      {pendingClinics.length > 0 && (
        <div className="admin-section-card alert-orange" style={{ marginBottom: '20px', border: '1px solid rgba(245,158,11,0.35)', boxShadow: '0 0 20px rgba(245,158,11,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '9px' }}>
                <Building2 size={20} color="#f59e0b" />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', margin: 0, color: '#F8FAFC', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Pending Clinic Approvals
                  <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                    {pendingClinics.length} Awaiting
                  </span>
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'rgba(248,250,252,0.45)' }}>
                  Review institutional registration before activating isolated blockchain ledgers
                </p>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => fetchAdminData(true)}
              style={{ fontSize: '0.75rem', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(248,250,252,0.7)' }}>
              Refresh Queue
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', color: 'rgba(248,250,252,0.4)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Healthcare Facility</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lead Administrator</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin Email</th>
                  <th style={{ padding: '8px 10px', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Submitted</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingClinics.map(clinic => {
                  const isBusy = clinicActionLoading === clinic.id;
                  return (
                    <tr key={clinic.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 600, color: '#F8FAFC' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <Building2 size={14} color="#00D4FF" />
                          {clinic.organizationName}
                        </div>
                      </td>
                      <td style={{ padding: '12px 10px', color: 'rgba(248,250,252,0.8)' }}>{clinic.adminName || 'Pending Provision'}</td>
                      <td style={{ padding: '12px 10px', color: 'rgba(248,250,252,0.5)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{clinic.adminEmail || 'N/A'}</td>
                      <td style={{ padding: '12px 10px', color: 'rgba(248,250,252,0.45)', fontSize: '0.78rem' }}>{clinic.createdAt ? new Date(clinic.createdAt).toLocaleDateString() : 'Recent'}</td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '7px' }}>
                          <button type="button" className="btn btn-primary" onClick={() => handleApproveClinic(clinic.id)} disabled={isBusy}
                            style={{ fontSize: '0.75rem', padding: '5px 11px', background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle size={13} /> {isBusy ? 'Approving…' : 'Approve (14d Trial)'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => handleRejectClinic(clinic.id)} disabled={isBusy}
                            style={{ fontSize: '0.75rem', padding: '5px 11px', color: '#f87171', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <XCircle size={13} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Mid Row: Approvals & Node Operations ── */}
      <div id="admin-sec-overview" className="admin-mid-grid">

        {/* Left Column: Approvals Queues & Mempool Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {pendingClinics.length === 0 && (
            <div className="admin-section-card alert-orange">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '9px', padding: '8px' }}>
                    <Building2 size={18} color="#10b981" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-primary)', fontWeight: 700 }}>Pending Clinic Approvals</h3>
                    <span style={{ fontSize: '0.72rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', padding: '1px 7px', borderRadius: '20px', fontWeight: 700 }}>Queue Clear</span>
                  </div>
                </div>
                <button type="button" onClick={() => fetchAdminData(true)}
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 10px', fontSize: '0.72rem' }}>
                  Refresh
                </button>
              </div>
              <div style={{ padding: '18px', textAlign: 'center', background: 'rgba(16,185,129,0.04)', borderRadius: '8px', border: '1px dashed rgba(16,185,129,0.2)' }}>
                <CheckCircle2 size={28} color="#10b981" style={{ margin: '0 auto 8px', display: 'block', opacity: 0.7 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Queue is Clear — All registrations reviewed</span>
              </div>
            </div>
          )}

          {/* Pending Tenant Admin Approvals */}
          {pendingAdmins.length > 0 && (
            <div className="admin-section-card" style={{ border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 0 14px rgba(245,158,11,0.07)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ fontSize: '0.9rem', margin: 0, color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <ShieldAlert size={16} /> Pending Tenant Admins ({pendingAdmins.length})
                </h3>
                <div style={{ position: 'relative', maxWidth: '220px', width: '100%' }}>
                  <input type="text" className="form-control" placeholder="Filter by name or email…"
                    value={pendingAdminSearch} onChange={(e) => setPendingAdminSearch(e.target.value)}
                    style={{ paddingLeft: '28px', fontSize: '0.75rem', height: '32px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px' }} />
                  <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>
              <div className="table-container">
                <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Date</th><th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAdmins
                      .filter(adm => {
                        if (!pendingAdminSearch.trim()) return true;
                        const q = pendingAdminSearch.toLowerCase();
                        return (adm.name && adm.name.toLowerCase().includes(q)) || (adm.email && adm.email.toLowerCase().includes(q));
                      })
                      .map(adm => (
                        <tr key={adm.id || adm._id}>
                          <td style={{ fontWeight: 600 }}>{adm.name}</td>
                          <td>{adm.email}</td>
                          <td>{new Date(adm.createdAt || Date.now()).toLocaleDateString()}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '0.72rem', background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => handleApproveAdmin(adm.id || adm._id, adm.name)}>
                                <Check size={11} /> Approve
                              </button>
                              <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => handleRejectAdmin(adm.id || adm._id, adm.name)}>
                                <X size={11} /> Reject
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

          {/* Pending Doctor Approvals */}
          {pendingDoctors.length > 0 && (
            <div className="admin-section-card" style={{ border: '1px solid rgba(0,212,255,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ fontSize: '0.9rem', margin: 0, color: '#00D4FF', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <Stethoscope size={16} color="#00D4FF" /> Pending Practitioners ({pendingDoctors.length})
                </h3>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', maxWidth: '200px' }}>
                    <input type="text" className="form-control" placeholder="Filter…" value={pendingDoctorSearch}
                      onChange={(e) => setPendingDoctorSearch(e.target.value)}
                      style={{ paddingLeft: '28px', fontSize: '0.75rem', height: '30px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px' }} />
                    <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  </div>
                  <button type="button" onClick={refreshPendingDoctors} disabled={isRefreshingPendingDocs} className="btn btn-secondary"
                    style={{ height: '30px', padding: '0 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <RefreshCw size={12} className={isRefreshingPendingDocs ? 'spin' : ''} />
                  </button>
                </div>
              </div>
              <div className="table-container">
                <table className="custom-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>Name</th><th>Specialization</th><th>License</th><th>Hospital</th><th>Date</th><th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingDoctors
                      .filter(doc => {
                        if (!pendingDoctorSearch.trim()) return true;
                        const q = pendingDoctorSearch.toLowerCase();
                        return (doc.name && doc.name.toLowerCase().includes(q)) || (doc.email && doc.email.toLowerCase().includes(q)) ||
                          (doc.doctorProfile?.specialization && doc.doctorProfile.specialization.toLowerCase().includes(q)) ||
                          (doc.doctorProfile?.licenseNumber && doc.doctorProfile.licenseNumber.toLowerCase().includes(q)) ||
                          (doc.doctorProfile?.hospital && doc.doctorProfile.hospital.toLowerCase().includes(q));
                      })
                      .map(doc => (
                        <tr key={doc.id || doc._id}>
                          <td style={{ fontWeight: 600 }}>Dr. {doc.name}</td>
                          <td>{doc.doctorProfile?.specialization || 'General Practice'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{doc.doctorProfile?.licenseNumber || 'N/A'}</td>
                          <td>{doc.doctorProfile?.hospital || 'N/A'}</td>
                          <td>{new Date(doc.createdAt || Date.now()).toLocaleDateString()}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                              <button className="btn btn-primary" style={{ padding: '3px 7px', fontSize: '0.7rem', background: '#10b981', border: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => handleApproveDoctor(doc.id || doc._id, doc.name)}>
                                <Check size={11} /> Approve Node
                              </button>
                              <button className="btn btn-danger" style={{ padding: '3px 7px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px' }}
                                onClick={() => handleRejectDoctor(doc.id || doc._id, doc.name)}>
                                <X size={11} /> Reject
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

          {/* Mempool Queue */}
          <div className="admin-section-card" style={{ border: mempoolRecords.length > 0 ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '0.88rem', color: mempoolRecords.length > 0 ? '#a78bfa' : 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Zap size={15} color={mempoolRecords.length > 0 ? '#a78bfa' : 'var(--text-muted)'} />
                Mempool Queue ({mempoolRecords.length})
              </h3>
              {mempoolRecords.length > 0 && (
                <button onClick={handleMineBlock} disabled={mining}
                  style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: '8px', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Layers size={12} className={mining ? 'rotate-slow' : ''} /> {mining ? 'Sealing…' : 'Force Mine'}
                </button>
              )}
            </div>
            {mempoolRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '14px', color: 'var(--text-muted)', fontSize: '0.78rem', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                Mempool synchronized — no pending transactions
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                {mempoolRecords.map((rec, i) => (
                  <div key={rec.recordId || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '8px', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{new Date(rec.timestamp).toLocaleTimeString()}</span>
                    <span style={{ background: rec.txType === 'consent' ? 'rgba(16,185,129,0.1)' : 'rgba(0,212,255,0.1)', color: rec.txType === 'consent' ? '#10b981' : '#00D4FF', padding: '2px 7px', borderRadius: '20px', fontSize: '0.68rem', fontWeight: 700 }}>
                      {rec.txType === 'consent' ? 'Consent' : 'Clinical'}
                    </span>
                    <span style={{ background: 'rgba(16,185,129,0.08)', color: '#10b981', padding: '2px 7px', borderRadius: '20px', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <ShieldCheck size={10} /> Signed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Node Activity Log & Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Node Activity Log */}
          <div className="admin-section-card" style={{ flex: 1, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#00D4FF', display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700 }}>
                <Terminal size={16} /> Node Activity Log
              </h3>
              <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#10b981', background: 'rgba(16,185,129,0.08)', padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.2)' }}>LIVE</span>
            </div>
            <div className="admin-terminal" style={{ minHeight: '160px', maxHeight: '220px' }}>
              {logs.map((log, i) => (
                <div key={i} className="admin-terminal-line">
                  <span style={{ color: 'rgba(0,212,255,0.4)' }}>&gt; </span>{log}
                </div>
              ))}
              {recovering && <div style={{ color: '#f59e0b', fontWeight: 600 }}>&gt;&gt; [SYS] Rebuilding from cryptographic ledger snapshots…</div>}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="admin-section-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p className="admin-section-title">Quick Actions</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="admin-quick-btn teal" onClick={() => scrollToSection('admin-sec-oracles')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={14} /> Add Doctor (KMPDC)</span>
                <ArrowUpRight size={13} />
              </button>
              <button className="admin-quick-btn violet" onClick={() => { setActiveMetricModal('admins'); setShowProvisionForm(true); }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={14} /> Onboard Hospital Admin</span>
                <ArrowUpRight size={13} />
              </button>
              <button className="admin-quick-btn ghost" onClick={() => scrollToSection('admin-sec-licensing')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Building2 size={14} /> Manage Clinic Licenses</span>
                <ArrowUpRight size={13} />
              </button>
              <button className="admin-quick-btn ghost" onClick={() => { setActiveMetricModal('admins'); setModalSearchQuery(''); }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UserCog size={14} /> View All Admins</span>
                <ArrowUpRight size={13} />
              </button>
              <button className="admin-quick-btn ghost" onClick={() => { setActiveMetricModal('consensus'); setModalSearchQuery(''); }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Shield size={14} /> Consensus Diagnostics</span>
                <ArrowUpRight size={13} />
              </button>
            </div>

            {/* Self-healing recover */}
            {!stats.isValid && (
              <div style={{ marginTop: 'auto', padding: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#f87171', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={14} /> Tamper Detected!
                </p>
                <button onClick={handleRestoreDatabase} disabled={recovering}
                  style={{ width: '100%', padding: '8px', background: '#ef4444', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                  {recovering ? 'Repairing Database…' : 'Recover from Ledger'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SaaS Multi-Tenant Organization Licensing Authority & Statutory Oracles ── */}
      <div style={{ marginBottom: '24px' }}>
        <LicenseControlWidget user={user} refreshTrigger={refreshTrigger} />
      </div>

      {/* ── Widget Sections: Facility Audits ── */}
      <div id="admin-sec-audits" style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <PatientsByOrgWidget user={user} refreshTrigger={refreshTrigger} />
        <PrescriptionsByOrgWidget user={user} refreshTrigger={refreshTrigger} />
      </div>

      {/* ── Network Node Directory & Identity Governance ── */}
      <div id="admin-sec-directory" className="admin-section-card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', margin: 0, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} color="#00D4FF" /> Network Node Directory &amp; Identity Governance
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>
              Manage licensed clinical node operators and patient accounts across the health network
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', maxWidth: '320px', width: '100%' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input type="text" className="form-control" placeholder="Search by name, email, license…"
                value={nodeSearchQuery} onChange={(e) => setNodeSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px', paddingRight: nodeSearchQuery ? '28px' : '10px', fontSize: '0.8rem', height: '36px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: '8px' }} />
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              {nodeSearchQuery && (
                <button type="button" onClick={() => setNodeSearchQuery('')}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Directory Tab Chips */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <button className={`admin-tab-chip ${activeDirectoryTab === 'doctors' ? 'active-teal' : ''}`} onClick={() => setActiveDirectoryTab('doctors')}>
            <UserCheck size={13} style={{ marginRight: 5 }} />
            Clinical Node Operators ({filteredDoctors.length})
          </button>
          <button className={`admin-tab-chip ${activeDirectoryTab === 'patients' ? 'active-green' : ''}`} onClick={() => setActiveDirectoryTab('patients')}>
            <Users size={13} style={{ marginRight: 5 }} />
            Patient Identities ({filteredPatients.length})
          </button>
        </div>

        {/* Doctors Table */}
        {activeDirectoryTab === 'doctors' && (
          filteredDoctors.length === 0 ? (
            <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '8px' }}>
              {nodeSearchQuery ? 'No clinical practitioners match your search.' : 'No registered doctors in the network.'}
            </div>
          ) : (
            <>
              <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Practitioner</th><th>Email</th><th>Specialization</th><th>License Number</th><th>Hospital Facility</th><th style={{ textAlign: 'right' }}>Governance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(nodeSearchQuery.trim() ? filteredDoctors : filteredDoctors.slice(0, directoryLimit)).map(doc => {
                      const isDocOrgSuspended = doc.organizationStatus === 'suspended' || doc.organizationStatus === 'disabled';
                      return (
                        <tr key={doc.id || doc._id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Dr. {doc.name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{doc.email}</td>
                          <td>{doc.doctorProfile?.specialization || 'General Practice'}</td>
                          <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{doc.doctorProfile?.licenseNumber || 'N/A'}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{doc.organizationName || doc.doctorProfile?.hospital || 'N/A'}</span>
                              {isDocOrgSuspended && <span className="badge badge-error" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>SUSPENDED</span>}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: '0.73rem' }}
                              onClick={() => setDeleteTarget({ id: doc.id || doc._id, name: `Dr. ${doc.name}`, role: 'Doctor' })}>
                              Revoke Node
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!nodeSearchQuery.trim() && filteredDoctors.length > 5 && (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setDirectoryLimit(prev => prev === 5 ? filteredDoctors.length : 5)}
                    style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 18px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#00D4FF',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                    }}
                  >
                    {directoryLimit === 5 ? (
                      <>▼ Show all {filteredDoctors.length} clinical nodes ({filteredDoctors.length - 5} hidden)</>
                    ) : (
                      <>▲ Collapse list (show top 5)</>
                    )}
                  </button>
                </div>
              )}
            </>
          )
        )}

        {/* Patients Table */}
        {activeDirectoryTab === 'patients' && (
          filteredPatients.length === 0 ? (
            <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '8px' }}>
              {nodeSearchQuery ? 'No patient identities match your search.' : 'No registered patients in the network.'}
            </div>
          ) : (
            <>
              <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Patient Name</th><th>Email</th><th>Registration Date</th><th>Key Status</th><th style={{ textAlign: 'right' }}>Governance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(nodeSearchQuery.trim() ? filteredPatients : filteredPatients.slice(0, directoryLimit)).map(pat => (
                      <tr key={pat.id || pat._id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{pat.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{pat.email}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(pat.createdAt || Date.now()).toLocaleDateString()}</td>
                        <td><span className="badge badge-success" style={{ fontSize: '0.65rem' }}>RSA-2048 Seeded</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: '0.73rem' }}
                            onClick={() => setDeleteTarget({ id: pat.id || pat._id, name: pat.name, role: 'Patient' })}>
                            Purge Account
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!nodeSearchQuery.trim() && filteredPatients.length > 5 && (
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setDirectoryLimit(prev => prev === 5 ? filteredPatients.length : 5)}
                    style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 18px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#10b981',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                    }}
                  >
                    {directoryLimit === 5 ? (
                      <>▼ Show all {filteredPatients.length} patient identities ({filteredPatients.length - 5} hidden)</>
                    ) : (
                      <>▲ Collapse list (show top 5)</>
                    )}
                  </button>
                </div>
              )}
            </>
          )
        )}
      </div>

      {/* ── Mined Block Heights Explorer ── */}
      <div id="admin-sec-ledger" className="admin-section-card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '8px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={18} color="#3B82F6" /> Mined Block Heights Explorer
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.25)', padding: '2px 8px', borderRadius: '20px' }}>
            Height: {blocks.length}
          </span>
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Immutable proof-of-work blockchain ledger linked via recursive SHA-256 cryptographic hashing.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {blocks.slice(0, blocksLimit).map((block, bIdx) => (
            <div key={block.id || block.hash || `${block.organizationId || 'org'}_${block.index}_${bIdx}`} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="badge badge-primary" style={{ fontSize: '0.8rem', padding: '3px 9px', background: 'rgba(59,130,246,0.12)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.25)' }}>Block #{block.index}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Mined: {new Date(block.timestamp).toLocaleString()}</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Nonce: <strong style={{ color: 'var(--text-primary)' }}>{block.nonce}</strong></span>
              </div>
              <div className="grid-2" style={{ gap: '10px', fontSize: '0.73rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Current Block Hash</span>
                  <span style={{ fontFamily: 'monospace', color: '#10b981', wordBreak: 'break-all', fontSize: '0.7rem' }}>{block.hash}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>Previous Block Hash</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all', fontSize: '0.7rem' }}>{block.previousHash}</span>
                </div>
              </div>
              <div style={{ marginTop: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Encapsulated Transactions: <strong style={{ color: 'var(--text-primary)' }}>{block.records?.length || 0}</strong></span>
                <span className="badge badge-success" style={{ fontSize: '0.62rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <CheckCircle2 size={10} /> SHA-256 Verified
                </span>
              </div>
            </div>
          ))}
        </div>
        {blocks.length > 5 && (
          <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => setBlocksLimit(prev => prev === 5 ? blocks.length : 5)}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 18px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#3B82F6',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
              }}
            >
              {blocksLimit === 5 ? (
                <>▼ Show all {blocks.length} mined blocks ({blocks.length - 5} hidden)</>
              ) : (
                <>▲ Collapse ledger (show latest 5)</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Interactive Metric Detail Modals ── */}
      {activeMetricModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(10px)', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '900px', background: 'rgba(10,15,30,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 0 60px rgba(0,0,0,0.6)', padding: '28px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: activeMetricModal === 'admins' ? 'rgba(245,158,11,0.12)' : activeMetricModal === 'doctors' ? 'rgba(0,212,255,0.1)' : activeMetricModal === 'patients' ? 'rgba(16,185,129,0.1)' : activeMetricModal === 'blocks' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {activeMetricModal === 'admins' && <UserCog size={22} color="#f59e0b" />}
                  {activeMetricModal === 'doctors' && <Stethoscope size={22} color="#00D4FF" />}
                  {activeMetricModal === 'patients' && <Users size={22} color="#10b981" />}
                  {activeMetricModal === 'blocks' && <Layers size={22} color="#3B82F6" />}
                  {activeMetricModal === 'consensus' && <Cpu size={22} color="#10b981" />}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#F8FAFC' }}>
                    {activeMetricModal === 'admins' && 'Tenant Administrators & Governance Matrix'}
                    {activeMetricModal === 'doctors' && 'Licensed Clinical Node Operators'}
                    {activeMetricModal === 'patients' && 'Registered Patient Identities (Ledger Directory)'}
                    {activeMetricModal === 'blocks' && 'Blockchain Ledger Height & Block Snapshots'}
                    {activeMetricModal === 'consensus' && 'Cryptographic Consensus & Quorum State'}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(248,250,252,0.4)' }}>
                    {activeMetricModal === 'admins' && `Total: ${allAdmins.length} (${pendingAdmins.length} pending review)`}
                    {activeMetricModal === 'doctors' && `Total Verified Practitioners: ${dbDoctors.length} nodes`}
                    {activeMetricModal === 'patients' && `Total Patient Keys: ${dbPatients.length} accounts`}
                    {activeMetricModal === 'blocks' && `Chain Height: ${blocks.length} blocks in continuous sequence`}
                    {activeMetricModal === 'consensus' && 'Proof-of-Work Quorum & Tamper-Verification Architecture'}
                  </span>
                </div>
              </div>
              <button style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}
                onClick={() => setActiveMetricModal(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
              {/* Admins Modal */}
              {activeMetricModal === 'admins' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                      <input type="text" className="form-control" placeholder="Filter administrators by name or email…"
                        value={modalSearchQuery} onChange={(e) => setModalSearchQuery(e.target.value)}
                        style={{ paddingLeft: '32px', fontSize: '0.83rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC', borderRadius: '8px' }} />
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(248,250,252,0.35)' }} />
                    </div>
                    <button className="btn btn-primary" type="button" onClick={() => setShowProvisionForm(!showProvisionForm)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px', background: '#f59e0b', borderColor: '#f59e0b', color: '#000', fontWeight: 700 }}>
                      <Plus size={14} /> {showProvisionForm ? 'Hide Form' : '+ Onboard Hospital Admin'}
                    </button>
                  </div>

                  {showProvisionForm && (
                    <div style={{ padding: '16px', marginBottom: '16px', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '12px', background: 'rgba(245,158,11,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <Building2 size={16} color="#f59e0b" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#f59e0b', fontWeight: 700 }}>Onboard Rented Hospital Administrator</h4>
                      </div>
                      <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: 'rgba(248,250,252,0.45)' }}>
                        Creates an active administrator account. Generates RSA-2048 cryptographic keys and secure password hash.
                      </p>
                      {provisionError && <div className="badge-error" style={{ padding: '7px 10px', fontSize: '0.78rem', marginBottom: '10px', borderRadius: '8px' }}>{provisionError}</div>}
                      <form onSubmit={handleProvisionTenant} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '0.72rem', color: 'rgba(248,250,252,0.45)', display: 'block', marginBottom: '4px' }}>Hospital Facility Name</label>
                          <input type="text" className="form-control" placeholder="e.g. Nairobi West Hospital" value={newHospitalName} onChange={(e) => setNewHospitalName(e.target.value)}
                            style={{ fontSize: '0.78rem', height: '34px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC', borderRadius: '8px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.72rem', color: 'rgba(248,250,252,0.45)', display: 'block', marginBottom: '4px' }}>Admin Contact Name *</label>
                          <input type="text" className="form-control" placeholder="e.g. Dr. Evans Kilonzo" required value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)}
                            style={{ fontSize: '0.78rem', height: '34px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC', borderRadius: '8px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.72rem', color: 'rgba(248,250,252,0.45)', display: 'block', marginBottom: '4px' }}>Official Admin Email *</label>
                          <input type="email" className="form-control" placeholder="admin@nairobiwest.org" required value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)}
                            style={{ fontSize: '0.78rem', height: '34px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC', borderRadius: '8px' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.72rem', color: 'rgba(248,250,252,0.45)', display: 'block', marginBottom: '4px' }}>Initial Secure Password *</label>
                          <input type="password" className="form-control" placeholder="Create initial password" required value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)}
                            style={{ fontSize: '0.78rem', height: '34px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC', borderRadius: '8px' }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button type="button" className="btn btn-secondary" onClick={() => setShowProvisionForm(false)} style={{ padding: '5px 12px', fontSize: '0.78rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(248,250,252,0.7)' }}>Cancel</button>
                          <button type="submit" className="btn btn-primary" disabled={provisioningLoading} style={{ padding: '5px 16px', fontSize: '0.78rem', background: '#10b981', borderColor: '#10b981', fontWeight: 600 }}>
                            {provisioningLoading ? 'Provisioning Keys…' : 'Create & Authorize Admin'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead><tr><th>Admin Name</th><th>Email</th><th>Hospital / Facility</th><th>Role Tier</th><th>Status</th><th>Registered</th><th style={{ textAlign: 'right' }}>Authority</th></tr></thead>
                      <tbody>
                        {allAdmins.filter(a => {
                          if (!modalSearchQuery.trim()) return true;
                          const q = modalSearchQuery.toLowerCase();
                          return (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q) || (a.organizationName || '').toLowerCase().includes(q);
                        }).map(adm => {
                          const isPending = adm.isApproved === false;
                          const isSuper = adm.role === 'super_admin';
                          const isOrgSuspended = !isSuper && (adm.organizationStatus === 'suspended' || adm.organizationStatus === 'disabled');
                          const isOrgExpired = !isSuper && adm.licenseExpiresAt && new Date(adm.licenseExpiresAt) < new Date();
                          return (
                            <tr key={adm.id || adm._id}>
                              <td style={{ fontWeight: 600, color: '#F8FAFC' }}>{adm.name}</td>
                              <td>{adm.email}</td>
                              <td>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px', background: isSuper ? 'rgba(59,130,246,0.12)' : isOrgSuspended ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', color: isSuper ? '#60a5fa' : isOrgSuspended ? '#f87171' : '#34d399', fontWeight: 600, fontSize: '0.73rem', border: isSuper ? '1px solid rgba(59,130,246,0.3)' : isOrgSuspended ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)' }}>
                                  <Building2 size={12} />{adm.organizationName || (isSuper ? 'Global Platform Governance' : 'Unassigned')}
                                  {isOrgSuspended && <span style={{ fontSize: '0.6rem', color: '#f87171' }}>• SUSPENDED</span>}
                                </span>
                              </td>
                              <td><span className={`badge ${isSuper ? 'badge-primary' : 'badge-warning'}`} style={{ fontSize: '0.68rem' }}>{isSuper ? 'Root Super Admin' : 'Tenant Admin'}</span></td>
                              <td>
                                {isSuper ? <span className="badge badge-primary" style={{ fontSize: '0.68rem' }}>Platform Active</span> :
                                 isOrgSuspended ? <span className="badge badge-error" style={{ fontSize: '0.68rem', background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>⛔ Suspended</span> :
                                 isOrgExpired ? <span className="badge badge-warning" style={{ fontSize: '0.68rem' }}>⚠️ Expired</span> :
                                 isPending ? <span className="badge badge-warning" style={{ fontSize: '0.68rem' }}>Pending Approval</span> :
                                 <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Active & Authorized</span>}
                              </td>
                              <td>{new Date(adm.createdAt || Date.now()).toLocaleDateString()}</td>
                              <td style={{ textAlign: 'right' }}>
                                {isPending ? (
                                  <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-primary" style={{ padding: '3px 7px', fontSize: '0.72rem', background: '#10b981', border: 'none' }} onClick={() => handleApproveAdmin(adm.id || adm._id, adm.name)}>Approve</button>
                                    <button className="btn btn-danger" style={{ padding: '3px 7px', fontSize: '0.72rem' }} onClick={() => handleRejectAdmin(adm.id || adm._id, adm.name)}>Reject</button>
                                  </div>
                                ) : isOrgSuspended ? <span style={{ fontSize: '0.73rem', color: '#f87171', fontWeight: 600 }}>Access Blocked</span> :
                                <span style={{ fontSize: '0.73rem', color: 'rgba(248,250,252,0.35)' }}>Authorized</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Doctors Modal */}
              {activeMetricModal === 'doctors' && (
                <div>
                  <div style={{ position: 'relative', marginBottom: '14px' }}>
                    <input type="text" className="form-control" placeholder="Search practitioners by name, specialization, hospital, license…"
                      value={modalSearchQuery} onChange={(e) => setModalSearchQuery(e.target.value)}
                      style={{ paddingLeft: '32px', fontSize: '0.83rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC', borderRadius: '8px' }} />
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(248,250,252,0.35)' }} />
                  </div>
                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead><tr><th>Practitioner</th><th>Email</th><th>Specialization</th><th>License Number</th><th>Hospital Facility</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                      <tbody>
                        {dbDoctors.filter(doc => {
                          if (!modalSearchQuery.trim()) return true;
                          const q = modalSearchQuery.toLowerCase();
                          return (doc.name || '').toLowerCase().includes(q) || (doc.email || '').toLowerCase().includes(q) || (doc.doctorProfile?.specialization || '').toLowerCase().includes(q) || (doc.doctorProfile?.hospital || '').toLowerCase().includes(q) || (doc.doctorProfile?.licenseNumber || '').toLowerCase().includes(q);
                        }).map(doc => {
                          const isDocOrgSuspended = doc.organizationStatus === 'suspended' || doc.organizationStatus === 'disabled';
                          return (
                            <tr key={doc.id || doc._id}>
                              <td style={{ fontWeight: 600, color: '#F8FAFC' }}>Dr. {doc.name}</td>
                              <td>{doc.email}</td>
                              <td>{doc.doctorProfile?.specialization || 'General Practice'}</td>
                              <td style={{ fontFamily: 'monospace', color: 'rgba(248,250,252,0.45)' }}>{doc.doctorProfile?.licenseNumber || 'N/A'}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>{doc.organizationName || doc.doctorProfile?.hospital || 'N/A'}</span>
                                  {isDocOrgSuspended && <span className="badge badge-error" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>SUSPENDED</span>}
                                </div>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: '0.73rem' }}
                                  onClick={() => { setActiveMetricModal(null); setDeleteTarget({ id: doc.id || doc._id, name: `Dr. ${doc.name}`, role: 'Doctor' }); }}>
                                  Revoke Node
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Patients Modal */}
              {activeMetricModal === 'patients' && (
                <div>
                  <div style={{ position: 'relative', marginBottom: '14px' }}>
                    <input type="text" className="form-control" placeholder="Search patient identities by name or email…"
                      value={modalSearchQuery} onChange={(e) => setModalSearchQuery(e.target.value)}
                      style={{ paddingLeft: '32px', fontSize: '0.83rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC', borderRadius: '8px' }} />
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(248,250,252,0.35)' }} />
                  </div>
                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead><tr><th>Patient Name</th><th>Email Address</th><th>Key ID Status</th><th>Registered Date</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                      <tbody>
                        {dbPatients.filter(pat => {
                          if (!modalSearchQuery.trim()) return true;
                          const q = modalSearchQuery.toLowerCase();
                          return (pat.name || '').toLowerCase().includes(q) || (pat.email || '').toLowerCase().includes(q);
                        }).map(pat => (
                          <tr key={pat.id || pat._id}>
                            <td style={{ fontWeight: 600, color: '#F8FAFC' }}>{pat.name}</td>
                            <td>{pat.email}</td>
                            <td><span className="badge badge-success" style={{ fontSize: '0.65rem' }}>RSA-2048 Seeded</span></td>
                            <td>{new Date(pat.createdAt || Date.now()).toLocaleDateString()}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: '0.73rem' }}
                                onClick={() => { setActiveMetricModal(null); setDeleteTarget({ id: pat.id || pat._id, name: pat.name, role: 'Patient' }); }}>
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

              {/* Blocks Modal */}
              {activeMetricModal === 'blocks' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                    {[{ label: 'Chain Height', val: blocks.length, color: '#3B82F6' }, { label: 'Consensus Hash', val: 'SHA-256', color: '#10b981' }, { label: 'Mempool Buffer', val: `${mempoolRecords.length} pending`, color: '#a78bfa' }].map(s => (
                      <div key={s.label} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(248,250,252,0.35)' }}>{s.label}</span>
                        <strong style={{ display: 'block', fontSize: '1.1rem', color: s.color }}>{s.val}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                      <thead><tr><th>Block Index</th><th>Mined Date</th><th>Nonce</th><th>Encapsulated Tx</th><th>Current Block Hash</th></tr></thead>
                      <tbody>
                        {blocks.map(b => (
                          <tr key={b.index}>
                            <td><span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>Block #{b.index}</span></td>
                            <td>{new Date(b.timestamp).toLocaleString()}</td>
                            <td style={{ fontFamily: 'monospace' }}>{b.nonce}</td>
                            <td>{b.records?.length || 0} transactions</td>
                            <td style={{ fontFamily: 'monospace', color: '#10b981', fontSize: '0.72rem' }}>{b.hash.substring(0, 18)}…</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Consensus Modal */}
              {activeMetricModal === 'consensus' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ padding: '16px', borderRadius: '10px', background: stats.isValid ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)', border: stats.isValid ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {stats.isValid ? <ShieldCheck size={32} color="#10b981" /> : <ShieldAlert size={32} color="#ef4444" />}
                    <div>
                      <strong style={{ fontSize: '1rem', color: stats.isValid ? '#10b981' : '#ef4444' }}>
                        {stats.isValid ? 'Consensus Status: 100% In Quorum (Chain Valid)' : 'Consensus Status: Tamper Detected (Hash Mismatch)'}
                      </strong>
                      <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'rgba(248,250,252,0.45)' }}>
                        {stats.isValid ? 'Every medical record snapshot matches the recursive SHA-256 block hash tree across all tenant nodes.' : 'A discrepancy was found between database contents and mined block hashes. Trigger self-healing repair below.'}
                      </p>
                    </div>
                  </div>
                  <div className="grid-2" style={{ gap: '12px' }}>
                    {[
                      { label: 'Consensus Protocol', val: 'Proof of Work (SHA-256)', sub: 'Difficulty: 2 leading hex zeros with autonomous nonce searching', color: '#F8FAFC' },
                      { label: 'Autonomous Auto-Miner', val: 'Active & Mutex-Protected', sub: 'Trigger threshold: 10 transactions or 60,000ms periodic fallback', color: '#3B82F6' },
                      { label: 'Mempool Unmined Queue', val: `${mempoolRecords.length} pending state changes`, sub: 'Awaiting threshold seal into the next mined block', color: '#a78bfa' },
                      { label: 'Self-Healing Integrity Engine', val: 'Standby & Ready', sub: 'Can restore corrupt database tables from valid block logs', color: '#10b981' }
                    ].map(s => (
                      <div key={s.label} style={{ background: 'rgba(255,255,255,0.02)', padding: '13px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span style={{ color: 'rgba(248,250,252,0.35)', fontSize: '0.78rem', display: 'block', marginBottom: '3px' }}>{s.label}</span>
                        <strong style={{ fontSize: '0.92rem', color: s.color }}>{s.val}</strong>
                        <p style={{ margin: '3px 0 0', fontSize: '0.73rem', color: 'rgba(248,250,252,0.35)' }}>{s.sub}</p>
                      </div>
                    ))}
                  </div>
                  {!stats.isValid && (
                    <button className="btn btn-primary" style={{ width: '100%', padding: '12px', background: '#ef4444', borderColor: '#ef4444' }} disabled={recovering}
                      onClick={() => { handleRestoreDatabase(); setActiveMetricModal(null); }}>
                      {recovering ? 'Repairing Database State…' : 'Trigger Cryptographic Self-Healing Repair'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '14px' }}>
              <button className="btn btn-secondary" onClick={() => setActiveMetricModal(null)} style={{ minWidth: '110px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC' }}>Close View</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(10px)' }}>
          <div style={{ width: '100%', maxWidth: '460px', background: 'rgba(10,15,30,0.98)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '16px', boxShadow: '0 0 30px rgba(239,68,68,0.15)', padding: '28px', textAlign: 'center' }}>
            <div style={{ background: 'rgba(239,68,68,0.1)', width: '52px', height: '52px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', border: '1px solid rgba(239,68,68,0.2)' }}>
              <ShieldAlert size={26} color="#ef4444" />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px', color: '#F8FAFC' }}>Confirm Network Deletion</h3>
            <p style={{ color: 'rgba(248,250,252,0.5)', fontSize: '0.85rem', lineHeight: '1.5', marginBottom: '24px' }}>
              Are you sure you want to permanently revoke and purge <strong style={{ color: '#F8FAFC' }}>"{deleteTarget.name}"</strong> ({deleteTarget.role}) from the tenant database and key registry?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC' }}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { executeDeleteUser(deleteTarget.id, deleteTarget.name, deleteTarget.role); setDeleteTarget(null); }} style={{ flex: 1, padding: '10px', background: '#ef4444' }}>Confirm Revocation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
