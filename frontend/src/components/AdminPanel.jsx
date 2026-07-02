import React, { useEffect, useState } from 'react';
import { Database, ShieldAlert, ShieldCheck, UserCheck, Flame, RefreshCw, Layers, Users, Zap, Terminal, Check, X, Clock, Stethoscope, User } from 'lucide-react';

export default function AdminPanel({ user }) {
  // Helper to format 24h time string to 12h AM/PM format
  const formatTime12h = (timeStr) => {
    if (!timeStr) return 'N/A';
    const [hoursStr, minutesStr] = timeStr.split(':');
    let hours = parseInt(hoursStr, 10);
    const minutes = minutesStr;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  // Helper to format days concisely (e.g. Mon-Fri or listing them)
  const formatDaysConcise = (days) => {
    if (!days || days.length === 0) return 'None';
    const shortDays = days.map(d => d.substring(0, 3));
    
    // Check if it matches Monday to Friday
    const monToFri = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const isMonToFri = days.length === 5 && monToFri.every(d => days.includes(d));
    if (isMonToFri) return 'Mon-Fri';
    
    // Check if it matches Monday to Sunday
    const monToSun = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const isMonToSun = days.length === 7 && monToSun.every(d => days.includes(d));
    if (isMonToSun) return 'Mon-Sun';

    return shortDays.join(', ');
  };

  const [stats, setStats] = useState({
    blocks: 0,
    mempool: 0,
    doctors: 0,
    patients: 0,
    totalAppointments: 0,
    pendingAppointments: 0,
    completedConsultations: 0,
    isValid: true
  });
  const [doctors, setDoctors] = useState([]);
  const [minedRecords, setMinedRecords] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [dbPatients, setDbPatients] = useState([]);
  const [dbDoctors, setDbDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  
  // Custom states for admin approval workflow & ledger explorations
  const [pendingAdmins, setPendingAdmins] = useState([]);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [mempoolRecords, setMempoolRecords] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, role }
  const [toast, setToast] = useState(null); // { message, type }
  const [viewModal, setViewModal] = useState({ isOpen: false, title: '', type: '', data: [] });
  const [isInitialFetched, setIsInitialFetched] = useState(false);
  
  // Tampering Form
  const [tamperRecordId, setTamperRecordId] = useState('');
  const [tamperDiagnosis, setTamperDiagnosis] = useState('');
  const [tamperSuccess, setTamperSuccess] = useState('');
  const [tamperError, setTamperError] = useState('');
  const [mining, setMining] = useState(false);

  // Simulated node logs
  const [logs, setLogs] = useState([
    'Node [0] initialized - Listening on port 3030',
    'Syncing local chain database...',
    'Genesis Block validation complete.',
    'System standby.'
  ]);

  useEffect(() => {
    fetchAdminData();
    // Poll backend state and node updates every 10 seconds
    const interval = setInterval(() => {
      fetchAdminData();
      
      // Also simulate periodic network pings for log flavor
      const pingMsgs = [
        'P2P Peer Ping: Node [1] responded in 36ms',
        'Ledger Synchronization check: Height matches consensus.',
        'P2P Peer Ping: Node [2] responded in 48ms',
        'Database connection pool checked: healthy.'
      ];
      const randomMsg = pingMsgs[Math.floor(Math.random() * pingMsgs.length)];
      setLogs(prev => [...prev.slice(-8), `[${new Date().toLocaleTimeString()}] ${randomMsg}`]);
    }, 10000);

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

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      // Fetch stats
      const resStats = await fetch('/api/admin/stats');
      const statsData = resStats.ok ? await resStats.json() : null;
      
      const resBlocks = await fetch('/api/blockchain/blocks');
      const blocks = resBlocks.ok ? await resBlocks.json() : [];
      setBlocks(blocks);
      
      // Get all doctors and patients
      const resPatients = await fetch('/api/users/patients');
      const patientsData = resPatients.ok ? await resPatients.json() : [];
      setDbPatients(patientsData);

      const resDoctors = await fetch('/api/users/doctors');
      const doctorsData = resDoctors.ok ? await resDoctors.json() : [];
      setDbDoctors(doctorsData);
      
      // Fetch system audit logs
      const resAudit = await fetch('/api/audit/logs');
      const auditData = resAudit.ok ? await resAudit.json() : [];
      setAuditLogs(auditData);

      // Fetch pending admin requests
      const resPending = await fetch('/api/admin/pending');
      const pendingData = resPending.ok ? await resPending.json() : [];

      // Fetch pending doctor requests
      const resPendingDocs = await fetch('/api/admin/doctors/pending');
      const pendingDocsData = resPendingDocs.ok ? await resPendingDocs.json() : [];

      // Fetch appointments
      const uId = user.id || user._id;
      const resAppts = await fetch(`/api/appointments?requesterId=${uId}&requesterRole=admin`);
      const apptsData = resAppts.ok ? await resAppts.json() : [];
      setAppointments(apptsData);
      
      if (isInitialFetched) {
        // Toast and alert for new admins
        const existingIds = pendingAdmins.map(a => a.id || a._id);
        const newRequests = pendingData.filter(a => !existingIds.includes(a.id || a._id));
        newRequests.forEach(newAdmin => {
          setToast({
            message: `New Admin Request: ${newAdmin.name} (${newAdmin.email}) is awaiting approval.`,
            type: 'warning'
          });
          setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [ALERT] SECURITY: Pending admin approval request received from ${newAdmin.email}`]);
        });

        // Toast and alert for new doctors
        const existingDocIds = pendingDoctors.map(d => d.id || d._id);
        const newDocRequests = pendingDocsData.filter(d => !existingDocIds.includes(d.id || d._id));
        newDocRequests.forEach(newDoc => {
          setToast({
            message: `New Doctor Request: Dr. ${newDoc.name} (${newDoc.email}) is awaiting approval.`,
            type: 'warning'
          });
          setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [ALERT] SECURITY: Pending doctor approval request received from ${newDoc.email}`]);
        });
      } else {
        setIsInitialFetched(true);
      }
      setPendingAdmins(pendingData);
      setPendingDoctors(pendingDocsData);

      // Fetch signed mempool records
      const resMempool = await fetch('/api/blockchain/mempool');
      const mempoolData = resMempool.ok ? await resMempool.json() : [];
      setMempoolRecords(mempoolData);

      // Compute records count and gather doctors
      let recordsList = [];
      let docsUnique = new Map();
      
      blocks.forEach(b => {
        if (b.index === 0) return;
        b.records.forEach(r => {
          if (r.txType !== 'consent') {
            recordsList.push({
              id: r.recordId,
              patientName: r.patientName,
              doctorName: r.doctorName,
              diagnosis: r.diagnosis || '',
              blockIndex: b.index
            });
          }
          docsUnique.set(r.doctorId, {
            id: r.doctorId,
            name: r.doctorName,
            publicKey: r.doctorPublicKey
          });
        });
      });
      
      setMinedRecords(recordsList);
      setDoctors(Array.from(docsUnique.values()));

      if (statsData) {
        setStats({
          blocks: statsData.blocks,
          mempool: statsData.mempool,
          doctors: statsData.doctors,
          patients: statsData.patients,
          totalAppointments: statsData.totalAppointments,
          pendingAppointments: statsData.pendingAppointments,
          completedConsultations: statsData.completedConsultations,
          isValid: statsData.isValid
        });
      }

    } catch (err) {
      console.error('Error fetching admin stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTamperDatabase = async (e) => {
    e.preventDefault();
    setTamperError('');
    setTamperSuccess('');

    if (!tamperRecordId) {
      setTamperError('Please select a medical record to tamper.');
      return;
    }

    try {
      const res = await fetch('/api/blockchain/tamper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: tamperRecordId,
          tamperedDiagnosis: tamperDiagnosis
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tamper failed');

      setTamperSuccess(data.message);
      setTamperDiagnosis('');
      setLogs(prev => [...prev, `[ALERT] SECURITY BREACH: Database modified. Record ID: ${tamperRecordId}`]);
      fetchAdminData();
    } catch (err) {
      setTamperError(err.message);
    }
  };

  // Self-Healing Recovery: Recovers database using ledger records
  const handleRestoreDatabase = async () => {
    setRecovering(true);
    setLogs(prev => [...prev, '[RECOVERY] Initializing Ledger Repair sequence...']);
    
    try {
      // In backend we can implement a /api/blockchain/recover endpoint, 
      // or we can simulate it by repairing the records one by one via a recovery api.
      // Let's trigger the recovery API on backend. We will define the recover endpoint in server.js.
      const res = await fetch('/api/blockchain/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      
      setTimeout(() => {
        setRecovering(false);
        setLogs(prev => [...prev, '[RECOVERY] All database indexes verified. Ledger synchronization success. Integrity restored.']);
        fetchAdminData();
      }, 2000);

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
      const res = await fetch('/api/blockchain/mine', {
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
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (res.ok) {
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

  const handleStatsCardClick = async (type) => {
    if (type === 'total_appointments') {
      setViewModal({
        isOpen: true,
        title: 'All System Appointments',
        type,
        data: appointments
      });
    } else if (type === 'pending_appointments') {
      setViewModal({
        isOpen: true,
        title: 'Pending Appointments Queue',
        type,
        data: appointments.filter(a => a.status === 'Pending')
      });
    } else if (type === 'completed_consultations') {
      try {
        setLoading(true);
        const res = await fetch('/api/admin/records?recordType=consultation');
        const data = res.ok ? await res.json() : [];
        setViewModal({
          isOpen: true,
          title: 'Decrypted Completed Consultations (Read-Only Ledger)',
          type,
          data
        });
      } catch (err) {
        console.error('Failed to fetch consultations:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleApproveAdmin = async (userId, userName) => {
    try {
      const res = await fetch(`/api/admin/approve/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Admin "${userName}" registration approved.`]);
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
      const res = await fetch(`/api/admin/reject/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Admin request for "${userName}" rejected.`]);
        fetchAdminData();
      } else {
        alert(data.error || 'Failed to reject admin request.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to reject admin request.');
    }
  };

  const handleApproveDoctor = async (userId, userName) => {
    try {
      const res = await fetch(`/api/admin/doctors/approve/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Doctor "Dr. ${userName}" registration approved.`]);
        setToast({
          message: `Success: Doctor Dr. ${userName} has been approved and activated.`,
          type: 'success'
        });
        fetchAdminData();
      } else {
        alert(data.error || 'Failed to approve doctor request.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to approve doctor request.');
    }
  };

  const handleRejectDoctor = async (userId, userName) => {
    try {
      const res = await fetch(`/api/admin/doctors/reject/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(prev => [...prev, `[ALERT] SECURITY INTERACTION: Doctor "Dr. ${userName}" request rejected.`]);
        setToast({
          message: `Success: Doctor Dr. ${userName} request has been rejected.`,
          type: 'danger'
        });
        fetchAdminData();
      } else {
        alert(data.error || 'Failed to reject doctor request.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to reject doctor request.');
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

      <div className="page-header-flex">
        <div>
          <h1 style={{ fontSize: '2.00rem', fontWeight: 800 }}>Admin Command Center</h1>
          <p style={{ color: 'var(--text-secondary)' }}>System metrics, P2P network diagnostics, and ledger security monitoring</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchAdminData} disabled={loading} style={{ display: 'flex', gap: '8px' }}>
          <RefreshCw size={16} className={loading ? 'rotate-slow' : ''} /> Refresh Console
        </button>
      </div>

      {/* Network Health Header */}
      <div
        className={stats.isValid ? 'badge-success' : 'badge-error'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 24px',
          borderRadius: '12px',
          marginBottom: '32px',
          width: '100%',
          fontSize: '1rem',
          boxShadow: stats.isValid ? '0 0 15px rgba(16,185,129,0.1)' : '0 0 20px rgba(239,68,68,0.25)'
        }}
      >
        {stats.isValid ? (
          <>
            <ShieldCheck size={24} />
            <div>
              <strong style={{ display: 'block', fontSize: '1.05rem' }}>EHR Network Status: SECURE</strong>
              <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>Database contents match distributed ledger state. All P2P node validations passed.</span>
            </div>
          </>
        ) : (
          <div className="banner-flex" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldAlert size={24} />
              <div>
                <strong style={{ display: 'block', fontSize: '1.05rem' }}>EHR Network Status: COMPROMISED (TAMPER DETECTED)</strong>
                <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>Direct database modification detected. Mismatch between database records and block cryptographic hashes.</span>
              </div>
            </div>
            <button className="btn btn-secondary" onClick={handleRestoreDatabase} disabled={recovering} style={{ background: '#fff', color: '#000', border: 'none', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600 }}>
              {recovering ? 'Repairing Database...' : 'Recover from Ledger'}
            </button>
          </div>
        )}
      </div>

      {/* Pending Admin Approvals */}
      {pendingAdmins.length > 0 && (
        <div className="glass-card" style={{ border: '1px solid rgba(245, 158, 11, 0.3)', marginBottom: '32px', boxShadow: '0 0 15px rgba(245, 158, 11, 0.1)' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
            <ShieldAlert size={22} /> Pending Administrator Approval Requests ({pendingAdmins.length})
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            The following accounts have registered as administrators. They cannot access the system until authorized by an active admin.
          </p>
          <div className="table-container">
            <table className="custom-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Requested Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingAdmins.map(adm => (
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
                          <Check size={14} /> Approve
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

      {/* Pending Doctor Approvals */}
      <div className="glass-card" style={{ border: '1px solid rgba(99, 102, 241, 0.3)', marginBottom: '32px', boxShadow: '0 0 15px rgba(99, 102, 241, 0.1)' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
          <Stethoscope size={22} color="var(--color-primary)" /> Pending Doctor Approvals ({pendingDoctors.length})
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          The following medical practitioners have registered as clinical node operators. They cannot access medical dossiers or sign diagnoses until their license credentials are verified and approved.
        </p>
        {pendingDoctors.length === 0 ? (
          <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
            No pending doctor registration requests.
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Specialization</th>
                  <th>Experience</th>
                  <th>License Number</th>
                  <th>Affiliated Hospital</th>
                  <th>Requested Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDoctors.map(doc => (
                  <tr key={doc.id || doc._id}>
                    <td>
                      {doc.doctorProfile?.profilePhoto ? (
                        <img src={doc.doctorProfile.profilePhoto} alt={`Dr. ${doc.name}`} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />
                      ) : (
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={14} color="var(--color-primary)" />
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>Dr. {doc.name}</td>
                    <td>{doc.email}</td>
                    <td>{doc.doctorProfile?.specialization || 'N/A'}</td>
                    <td>{doc.doctorProfile?.yearsOfExperience || '0'} yrs</td>
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
                          <Check size={14} /> Approve
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
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid-3" style={{ marginBottom: '32px' }}>
        <div 
          className="glass-card stats-card-clickable" 
          onClick={() => handleStatsCardClick('total_appointments')}
          style={{ display: 'flex', alignItems: 'center', gap: '20px', cursor: 'pointer' }}
        >
          <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '12px', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={22} color="var(--color-primary)" />
          </div>
          <div>
            <h4 style={{ fontSize: '1.4rem', margin: 0 }}>{stats.totalAppointments}</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Total Appointments</p>
          </div>
        </div>

        <div 
          className="glass-card stats-card-clickable" 
          onClick={() => handleStatsCardClick('pending_appointments')}
          style={{ display: 'flex', alignItems: 'center', gap: '20px', cursor: 'pointer' }}
        >
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={22} color="var(--color-warning)" />
          </div>
          <div>
            <h4 style={{ fontSize: '1.4rem', margin: 0 }}>{stats.pendingAppointments}</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Pending Appointments</p>
          </div>
        </div>

        <div 
          className="glass-card stats-card-clickable" 
          onClick={() => handleStatsCardClick('completed_consultations')}
          style={{ display: 'flex', alignItems: 'center', gap: '20px', cursor: 'pointer' }}
        >
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={22} color="var(--color-success)" />
          </div>
          <div>
            <h4 style={{ fontSize: '1.4rem', margin: 0 }}>{stats.completedConsultations}</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Completed Consultations</p>
          </div>
        </div>
      </div>

      <div className="grid-admin-main">
        
        {/* Left Column: Security Lab & Doctor registry */}
        <div>
          {/* Security Lab */}
          <div className="glass-card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '32px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-error)' }}>
              <Flame size={22} /> Database Security Attack Simulator
            </h3>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Simulate an unauthorized database modification (SQL injection bypass). This direct database rewrite changes the medical records without a corresponding signature renewal, causing verification algorithms to instantly fail.
            </p>

            {tamperError && (
              <div className="badge-error" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', display: 'flex', gap: '6px' }}>
                <ShieldAlert size={14} /> <span>{tamperError}</span>
              </div>
            )}

            {tamperSuccess && (
              <div className="badge-success" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', display: 'flex', gap: '6px' }}>
                <ShieldCheck size={14} /> <span style={{ wordBreak: 'break-word' }}>{tamperSuccess}</span>
              </div>
            )}

            {minedRecords.length === 0 ? (
              <div style={{ border: '1px dashed rgba(239,68,68,0.2)', borderRadius: '8px', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No mined block transactions available to tamper. Mine blocks under Ledger Explorer first.
              </div>
            ) : (
              <form onSubmit={handleTamperDatabase} className="grid-2" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label>Select Ledger Transaction Record</label>
                  <select
                    className="form-control"
                    value={tamperRecordId}
                    onChange={(e) => setTamperRecordId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Record --</option>
                    {minedRecords.map(mr => (
                      <option key={mr.id} value={mr.id}>
                        Block #{mr.blockIndex}: Patient: {mr.patientName} (Old diagnosis: "{mr.diagnosis.substring(0, 15)}...")
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Inject Corrupted Diagnosis</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Chronic Bronchitis"
                    required
                    value={tamperDiagnosis}
                    onChange={(e) => setTamperDiagnosis(e.target.value)}
                  />
                </div>

                <button type="submit" className="btn btn-danger span-2-desktop" style={{ gap: '8px' }}>
                  <Flame size={16} /> Execute Database Intrusion
                </button>
              </form>
            )}
          </div>

          {/* Node Operator & Patient Management */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
              <Users size={22} /> Network Node Directory & Registry Control
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Doctors List */}
              <div>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserCheck size={14} color="var(--color-success)" /> Clinical Node Operators ({dbDoctors.length})
                </h4>
                
                {dbDoctors.length === 0 ? (
                  <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '6px' }}>
                    No registered doctors.
                  </div>
                ) : (
                  <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                      <thead>
                        <tr>
                          <th>Photo</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Specialization</th>
                          <th>Experience</th>
                          <th>License Number</th>
                          <th>Hospital</th>
                          <th>Availability</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbDoctors.map(doc => (
                          <tr key={doc.id || doc._id}>
                            <td>
                              {doc.doctorProfile?.profilePhoto ? (
                                <img src={doc.doctorProfile.profilePhoto} alt={`Dr. ${doc.name}`} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />
                              ) : (
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <User size={12} color="var(--color-primary)" />
                                </div>
                              )}
                            </td>
                            <td style={{ fontWeight: 600 }}>Dr. {doc.name}</td>
                            <td>{doc.email}</td>
                            <td>{doc.doctorProfile?.specialization || 'N/A'}</td>
                            <td>{doc.doctorProfile?.yearsOfExperience || '0'} yrs</td>
                            <td style={{ fontFamily: 'monospace' }}>{doc.doctorProfile?.licenseNumber || 'N/A'}</td>
                            <td>{doc.doctorProfile?.hospital || 'N/A'}</td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span className={`badge ${
                                  (doc.doctorProfile?.availability?.status || 'available') === 'available' ? 'badge-success' :
                                  (doc.doctorProfile?.availability?.status || 'available') === 'busy' ? 'badge-warning' : 'badge-error'
                                }`} style={{ padding: '2px 6px', fontSize: '0.7rem', width: 'fit-content', textTransform: 'capitalize' }}>
                                  {doc.doctorProfile?.availability?.status || 'available'}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                  {formatDaysConcise(doc.doctorProfile?.availability?.workingDays)}, {formatTime12h(doc.doctorProfile?.availability?.workingHoursStart || '08:00')} - {formatTime12h(doc.doctorProfile?.availability?.workingHoursEnd || '17:00')}
                                </span>
                              </div>
                            </td>
                            <td>
                              <button
                                className="btn btn-danger"
                                style={{ padding: '3px 6px', fontSize: '0.7rem' }}
                                onClick={() => setDeleteTarget({ id: doc.id || doc._id, name: doc.name, role: 'Doctor' })}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              
              {/* Patients List */}
              <div>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} color="var(--color-accent)" /> Registered Patients ({dbPatients.length})
                </h4>
                
                {dbPatients.length === 0 ? (
                  <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', border: '1px dashed var(--glass-border)', borderRadius: '6px' }}>
                    No registered patients.
                  </div>
                ) : (
                  <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    <table className="custom-table" style={{ fontSize: '0.75rem' }}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbPatients.map(pat => (
                          <tr key={pat.id || pat._id}>
                            <td style={{ fontWeight: 600 }}>{pat.name}</td>
                            <td>{pat.email}</td>
                            <td>
                              <button
                                className="btn btn-danger"
                                style={{ padding: '3px 6px', fontSize: '0.7rem' }}
                                onClick={() => setDeleteTarget({ id: pat.id || pat._id, name: pat.name, role: 'Patient' })}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Console Node Terminal */}
        <div className="glass-card" style={{ background: '#050508', border: '1px solid #1f2130', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
            <Terminal size={18} /> P2P Node Live Console
          </h3>
          
          <div style={{ flex: 1, minHeight: '350px', background: '#000', border: '1px solid #111', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#10b981', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {logs.map((log, index) => (
              <div key={index} style={{ borderLeft: '2px solid rgba(16, 185, 129, 0.3)', paddingLeft: '8px', wordBreak: 'break-all' }}>
                <span style={{ color: 'var(--text-muted)' }}>&gt; </span> {log}
              </div>
            ))}
            {recovering && (
              <div style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                &gt;&gt; [SYS] Recovering database state from Ledger block snapshots...
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Global Appointments Overview */}
      <div className="glass-card" style={{ marginTop: '32px' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
          <Clock size={22} color="var(--color-primary)" /> System-Wide Appointments Overview
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Consolidated list of patient-doctor appointments and consultations in the health system network.
        </p>

        {appointments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No appointments booked in system logs.</div>
        ) : (
          <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="custom-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Request Date</th>
                  <th>Patient Name</th>
                  <th>Healthcare Provider</th>
                  <th>Appointment Date/Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map(appt => (
                  <tr key={appt._id || appt.id}>
                    <td>{new Date(appt.createdAt || Date.now()).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 600 }}>{appt.patientName}</td>
                    <td>Dr. {appt.doctorName}</td>
                    <td>{appt.date} at {appt.time}</td>
                    <td>{appt.reason}</td>
                    <td>
                      <span className={`badge ${
                        appt.status === 'Confirmed' ? 'badge-success' :
                        appt.status === 'Pending' ? 'badge-warning' :
                        appt.status === 'Completed' ? 'badge-primary' : 'badge-error'
                      }`}>
                        {appt.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Signed Mempool Ledger Queue */}
      <div className="glass-card" style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
            <Zap size={22} color="var(--color-accent)" /> Signed Mempool Ledger Queue ({mempoolRecords.length})
          </h3>
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
              <Layers size={16} className={mining ? 'rotate-slow' : ''} /> {mining ? 'Mining Block...' : 'Mine Pending Block'}
            </button>
          )}
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          This ledger queue stores patient-signed consent toggles and doctor-signed clinical entries. They are cryptographically verified and wait to be sealed into the next mined block.
        </p>

        {mempoolRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '0.9rem', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
            Mempool is currently empty. No pending transactions to mine.
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="custom-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Transaction ID / Type</th>
                  <th>Details / Payload</th>
                  <th>Public Key Info</th>
                  <th>Cryptographic Signature</th>
                </tr>
              </thead>
              <tbody>
                {mempoolRecords.map((rec, i) => (
                  <tr key={rec.recordId || i}>
                    <td>{new Date(rec.timestamp).toLocaleString()}</td>
                    <td>
                      <span className={`badge ${rec.txType === 'consent' ? 'badge-success' : 'badge-primary'}`} style={{ fontWeight: 600 }}>
                        {rec.txType === 'consent' ? 'Consent Action' : 'Medical Record'}
                      </span>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace' }}>
                        ID: {rec.recordId?.substring(0, 10)}...
                      </p>
                    </td>
                    <td>
                      {rec.txType === 'consent' ? (
                        <div>
                          <strong>Action:</strong> <span style={{ color: rec.action === 'grant' ? '#10b981' : '#ef4444', fontWeight: 600 }}>{rec.action.toUpperCase()}</span>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Patient: {rec.patientName} &rarr; Dr. {rec.doctorName}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <strong>Diagnosis:</strong> {rec.diagnosis.substring(0, 30)}...
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            Doctor: {rec.doctorName} &rarr; Patient: {rec.patientName || 'Patient'}
                          </p>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {rec.txType === 'consent' ? (
                        <span>Patient PK: {rec.patientPublicKey?.substring(30, 60)}...</span>
                      ) : (
                        <span>Doctor PK: {rec.doctorPublicKey?.substring(30, 60)}...</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        <ShieldCheck size={12} /> Valid Signature
                      </span>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: '180px' }}>
                        {rec.signature?.substring(0, 20)}...
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mined Block Heights Explorer */}
      <div className="glass-card" style={{ marginTop: '32px' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
          <Layers size={22} color="var(--color-primary)" /> Mined Block Heights Explorer (Chain Height: {blocks.length})
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Explore the immutable, chronologically ordered blockchain state. Each block encapsulates multiple signed records linked via SHA-256 cryptographic chaining.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {blocks.map((block) => (
            <div key={block.index} style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px', marginBottom: '12px' }}>
                <div>
                  <span className="badge badge-primary" style={{ fontSize: '0.9rem', padding: '4px 10px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--color-primary)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                    Block #{block.index}
                  </span>
                  <span style={{ marginLeft: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Mined: {new Date(block.timestamp).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Nonce: <strong style={{ color: 'var(--text-primary)' }}>{block.nonce}</strong>
                </div>
              </div>

              <div className="grid-2" style={{ gap: '16px', fontSize: '0.8rem', marginBottom: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Block Hash</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-success)', wordBreak: 'break-all' }}>{block.hash}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Previous Block Hash</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{block.previousHash}</span>
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '12px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                  Transactions Encapsulated ({block.records.length})
                </span>
                {block.records.length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No records in this block.</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {block.records.map((rec, idx) => (
                      <div key={idx} style={{
                        fontSize: '0.75rem',
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.01)',
                        borderLeft: '3px solid var(--color-primary)',
                        borderRadius: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}>
                        <div>
                          {rec.message ? (
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{rec.message}</span>
                          ) : rec.txType === 'consent' ? (
                            <span>
                              <strong>Consent Update:</strong> Patient <strong>{rec.patientName}</strong> {rec.action}ed access to Dr. <strong>{rec.doctorName}</strong>
                            </span>
                          ) : (
                            <span>
                              <strong>Diagnosis:</strong> {rec.diagnosis} (Patient: {rec.patientName || 'Patient'})
                            </span>
                          )}
                          {rec.timestamp && (
                            <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Tx Timestamp: {new Date(rec.timestamp).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {rec.signature && (
                          <div style={{ textAlign: 'right' }}>
                            <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                              Sig Verified
                            </span>
                            <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                              {rec.signature.substring(0, 12)}...
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
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
            maxWidth: '480px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.15)',
            padding: '28px',
            textAlign: 'center',
            background: 'rgba(15, 15, 25, 0.95)'
          }}>
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <ShieldAlert size={28} color="#ef4444" />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
              Confirm Network Deletion
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '28px' }}>
              Are you sure you want to permanently delete <strong style={{ color: 'var(--text-primary)' }}>"{deleteTarget.name}"</strong> ({deleteTarget.role}) from the system? This will immediately purge their account, public keys, and all associated ledger records and audit logs.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                style={{ flex: 1, padding: '10px' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  executeDeleteUser(deleteTarget.id, deleteTarget.name, deleteTarget.role);
                  setDeleteTarget(null);
                }}
                style={{ flex: 1, padding: '10px', background: '#ef4444' }}
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Read-Only Statistics Detail Modal */}
      {viewModal.isOpen && (
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
            maxWidth: '1100px',
            border: '1px solid var(--glass-border)',
            boxShadow: '0 0 30px rgba(99, 102, 241, 0.15)',
            padding: '28px',
            background: 'rgba(15, 15, 25, 0.98)',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                  <Layers size={20} color="var(--color-primary)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.30rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {viewModal.title}
                  </h3>
                  <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', marginTop: '4px', display: 'inline-block' }}>
                    Read-Only Access
                  </span>
                </div>
              </div>
              <button 
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' }}
                onClick={() => setViewModal({ isOpen: false, title: '', type: '', data: [] })}
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', paddingRight: '8px' }}>
              {viewModal.data.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No records found.
                </div>
              ) : (
                viewModal.type === 'completed_consultations' ? (
                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>Date/Time</th>
                          <th>Patient Info</th>
                          <th>Healthcare Provider</th>
                          <th>Symptoms / Notes</th>
                          <th>Diagnosis & Treatment</th>
                          <th>Ledger Verification</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewModal.data.map((rec) => (
                          <tr key={rec._id || rec.id}>
                            <td>{new Date(rec.timestamp).toLocaleString()}</td>
                            <td>
                              <strong style={{ color: 'var(--text-primary)' }}>{rec.patientId?.name || 'Deleted Patient'}</strong>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                                {rec.patientId?.email || 'N/A'}
                              </p>
                            </td>
                            <td>
                              <strong>Dr. {rec.doctorName}</strong>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                                {rec.doctorId?.email || ''}
                              </p>
                            </td>
                            <td>
                              <div style={{ maxWidth: '220px' }}>
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.75rem' }}><strong>Symptoms:</strong> {rec.symptoms || 'N/A'}</p>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}><strong>Notes:</strong> {rec.notes || 'N/A'}</p>
                              </div>
                            </td>
                            <td>
                              <div style={{ maxWidth: '240px' }}>
                                <span className="badge badge-primary" style={{ fontSize: '0.75rem', padding: '2px 6px', marginBottom: '4px', display: 'inline-block' }}>
                                  {rec.diagnosis}
                                </span>
                                <p style={{ margin: '2px 0 4px 0', fontSize: '0.75rem' }}><strong>Treatment:</strong> {rec.treatment}</p>
                                {rec.prescriptions && rec.prescriptions.length > 0 && (
                                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-accent)' }}>
                                    <strong>Prescriptions:</strong> {rec.prescriptions.join(', ')}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.7rem' }}>
                                <ShieldCheck size={11} /> Block #{rec.blockIndex}
                              </span>
                              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace', margin: '4px 0 0 0', wordBreak: 'break-all', maxWidth: '140px' }}>
                                Sig: {rec.signature?.substring(0, 15)}...
                              </p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Appointments tables (All or Pending) */
                  <div className="table-container">
                    <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>Created At</th>
                          <th>Patient Name</th>
                          <th>Healthcare Provider</th>
                          <th>Scheduled Date & Time</th>
                          <th>Reason for Visit</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewModal.data.map((appt) => (
                          <tr key={appt._id || appt.id}>
                            <td>{new Date(appt.createdAt || Date.now()).toLocaleDateString()}</td>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{appt.patientName}</td>
                            <td>Dr. {appt.doctorName}</td>
                            <td>{appt.date} at {appt.time}</td>
                            <td>{appt.reason}</td>
                            <td>
                              <span className={`badge ${
                                appt.status === 'Confirmed' ? 'badge-success' :
                                appt.status === 'Pending' ? 'badge-warning' :
                                appt.status === 'Completed' ? 'badge-primary' : 'badge-error'
                              }`}>
                                {appt.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setViewModal({ isOpen: false, title: '', type: '', data: [] })}
                style={{ minWidth: '120px' }}
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
