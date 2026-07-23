import React, { useState, useEffect } from 'react';
import { Activity, BarChart3, ShieldAlert, Cpu, Heart, Users, FileText, Database, X, CheckCircle2, ChevronRight, Search, Lock, ShieldCheck } from 'lucide-react';
import { safeFetch } from '../utils/api';
import RecordVerificationPortal from './RecordVerificationPortal';

export default function PublicHealthAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Interactive Card Modal States
  const [activeModal, setActiveModal] = useState(null); // 'patients' | 'doctors' | 'records' | 'blocks' | 'breakGlass' | null
  const [searchQuery, setSearchQuery] = useState('');
  const [verifyRecordId, setVerifyRecordId] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await safeFetch('/api/analytics/public-health');
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load health analytics data.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
        <Activity size={32} className="rotate-slow" color="var(--color-primary)" style={{ margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Aggregating Privacy-Preserving Ledger Metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="badge-error" style={{ padding: '12px', borderRadius: '8px' }}>
          {error}
        </div>
      </div>
    );
  }

  const {
    totalPatients = 0,
    totalDoctors = 0,
    totalRecords = 0,
    totalBlocks = 0,
    breakGlassEvents = 0,
    patientsList = [],
    doctorsList = [],
    recordsList = [],
    blocksList = [],
    breakGlassLogs = [],
    bloodTypeCounts = {},
    genderCounts = {},
    miningMetrics = {}
  } = data || {};

  const openModal = (type) => {
    setActiveModal(type);
    setSearchQuery('');
  };

  // Filtering helpers for modals
  const filteredPatients = patientsList.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
  });

  const filteredDoctors = doctorsList.filter(d => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (d.name || '').toLowerCase().includes(q) || (d.email || '').toLowerCase().includes(q) || (d.doctorProfile?.specialization || '').toLowerCase().includes(q);
  });

  const filteredRecords = recordsList.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (r.id || '').toLowerCase().includes(q) || (r.doctorName || '').toLowerCase().includes(q);
  });

  const filteredBlocks = blocksList.filter(b => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return String(b.index).includes(q) || (b.hash || '').toLowerCase().includes(q);
  });

  const filteredBreakGlass = breakGlassLogs.filter(bg => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (bg.doctorName || '').toLowerCase().includes(q) || (bg.patientName || '').toLowerCase().includes(q) || (bg.details || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BarChart3 color="var(--color-primary)" /> Privacy-Preserving Public Health Analytics
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Interactive metrics. Click on any metric card below to inspect full ledger records & details.
        </p>
      </div>

      {/* Interactive Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
        {/* Total Patients Card */}
        <div
          className="glass-card"
          style={{
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative'
          }}
          onClick={() => openModal('patients')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.borderColor = 'var(--color-primary)';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(99, 102, 241, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Total Patients</span>
            <Users size={20} color="var(--color-primary)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{totalPatients}</div>
          <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
            Inspect Patient Roster <ChevronRight size={12} />
          </div>
        </div>

        {/* Approved Doctors Card */}
        <div
          className="glass-card"
          style={{
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={() => openModal('doctors')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.borderColor = '#10b981';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(16, 185, 129, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Approved Doctors</span>
            <Heart size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{totalDoctors}</div>
          <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
            Inspect Doctor Roster <ChevronRight size={12} />
          </div>
        </div>

        {/* Encrypted Records Card */}
        <div
          className="glass-card"
          style={{
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={() => openModal('records')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(99, 102, 241, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Encrypted Records</span>
            <FileText size={20} color="#6366f1" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{totalRecords}</div>
          <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
            Inspect Sealed Records <ChevronRight size={12} />
          </div>
        </div>

        {/* Mined Blocks Card */}
        <div
          className="glass-card"
          style={{
            padding: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
          onClick={() => openModal('blocks')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.borderColor = '#3b82f6';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Mined Blocks</span>
            <Database size={20} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{totalBlocks}</div>
          <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
            Inspect Blockchain Ledger <ChevronRight size={12} />
          </div>
        </div>

        {/* Break-Glass Access Card */}
        <div
          className="glass-card"
          style={{
            padding: '20px',
            cursor: 'pointer',
            borderColor: breakGlassEvents > 0 ? 'rgba(239, 68, 68, 0.6)' : undefined,
            transition: 'all 0.2s ease'
          }}
          onClick={() => openModal('breakGlass')}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.borderColor = '#ef4444';
            e.currentTarget.style.boxShadow = '0 8px 25px rgba(239, 68, 68, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = breakGlassEvents > 0 ? 'rgba(239, 68, 68, 0.6)' : 'var(--glass-border)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Break-Glass Access</span>
            <ShieldAlert size={20} color="#ef4444" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: breakGlassEvents > 0 ? '#ef4444' : 'inherit' }}>
            {breakGlassEvents}
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 600 }}>
            Inspect ER Audit Trail <ChevronRight size={12} />
          </div>
        </div>
      </div>

      {/* Analytics Visual Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {/* Blood Group Inventory */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--color-primary)' }}>
            🩸 Blood Group Distribution
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.keys(bloodTypeCounts).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No registered patient blood type data available yet.</p>
            ) : (
              Object.entries(bloodTypeCounts).map(([type, count]) => {
                const pct = totalPatients > 0 ? Math.round((count / totalPatients) * 100) : 0;
                return (
                  <div key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <strong>Group {type}</strong>
                      <span>{count} patient(s) ({pct}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(pct, 5)}%`, height: '100%', background: 'linear-gradient(90deg, #ef4444, #ec4899)', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Ledger & Mining Performance */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} /> Mining & Ledger Performance Metrics
          </h3>
          <div style={{ display: 'grid', gap: '14px', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--glass-border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Consensus Protocol:</span>
              <strong>Proof-of-Work (SHA-256)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--glass-border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Mining Difficulty Target:</span>
              <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                {miningMetrics.difficulty || '2 Leading Zeros'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--glass-border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Average Block Packing:</span>
              <strong>{miningMetrics.avgRecordsPerBlock || 1} Record(s) / Block</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>AES Data Encryption:</span>
              <strong style={{ color: 'var(--color-primary)' }}>AES-256-CBC Field Level</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* INTERACTIVE CARD MODALS */}
      {/* ========================================================= */}
      {activeModal && (
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
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            maxWidth: '750px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            padding: '24px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {activeModal === 'patients' && <><Users color="var(--color-primary)" /> Registered Patient Roster ({patientsList.length})</>}
                  {activeModal === 'doctors' && <><Heart color="#10b981" /> Approved Doctor Roster ({doctorsList.length})</>}
                  {activeModal === 'records' && <><FileText color="#6366f1" /> Encrypted Records Ledger ({recordsList.length})</>}
                  {activeModal === 'blocks' && <><Database color="#3b82f6" /> Mined Blockchain Ledger ({blocksList.length})</>}
                  {activeModal === 'breakGlass' && <><ShieldAlert color="#ef4444" /> ER Emergency Break-Glass Audit Trail ({breakGlassLogs.length})</>}
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Filter input */}
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '36px', width: '100%', fontSize: '0.85rem' }}
                placeholder={`Search ${activeModal}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Modal Scrollable Body */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>

              {/* 1. PATIENTS MODAL */}
              {activeModal === 'patients' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredPatients.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>No matching patient records found.</p>
                  ) : (
                    filteredPatients.map(pat => (
                      <div key={pat.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '12px 16px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{pat.name}</strong>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.8rem' }}>{pat.email}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>ID: {pat.id}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.75rem', marginBottom: '4px', display: 'inline-block' }}>
                            Blood: {pat.patientProfile?.bloodType || 'N/A'}
                          </span>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>
                            {pat.patientProfile?.age ? `${pat.patientProfile.age} yrs` : ''} {pat.patientProfile?.gender ? `/ ${pat.patientProfile.gender}` : ''}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 2. DOCTORS MODAL */}
              {activeModal === 'doctors' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredDoctors.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>No matching doctor records found.</p>
                  ) : (
                    filteredDoctors.map(doc => (
                      <div key={doc.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '12px 16px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>Dr. {doc.name}</strong>
                          <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.8rem' }}>{doc.email}</span>
                          <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem' }}>{doc.doctorProfile?.specialization || 'General Practitioner'} &bull; {doc.doctorProfile?.hospital || 'Clinic'}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>License Verified</span>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginTop: '4px' }}>
                            {doc.doctorProfile?.licenseNumber || 'KMPDB-OK'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 3. ENCRYPTED RECORDS MODAL */}
              {activeModal === 'records' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredRecords.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>No encrypted medical records found.</p>
                  ) : (
                    filteredRecords.map(rec => (
                      <div key={rec.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '12px 16px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)' }}>Doctor: Dr. {rec.doctorName}</strong>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginTop: '2px' }}>Record ID: {rec.id}</span>
                          <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <Lock size={12} /> Encrypted Payload (AES-256)
                          </span>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                          <span className={`badge ${rec.isMined ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.75rem' }}>
                            {rec.isMined ? `Mined Block #${rec.blockIndex}` : 'Pending Mempool'}
                          </span>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => setVerifyRecordId(rec.id)}
                          >
                            <ShieldCheck size={12} /> Verify Seal
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 4. BLOCKS MODAL */}
              {activeModal === 'blocks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredBlocks.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>No mined blocks found.</p>
                  ) : (
                    filteredBlocks.map(b => (
                      <div key={b.index} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '12px 16px', borderRadius: '8px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <strong style={{ color: 'var(--color-primary)', fontSize: '0.95rem' }}>Block #{b.index}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{b.timestamp}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <strong>SHA-256 Hash:</strong> <code style={{ color: '#10b981' }}>{(b.hash || '').slice(0, 32)}...</code>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Nonce: {b.nonce} &bull; Previous Hash: {(b.previousHash || '').slice(0, 20)}...
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* 5. BREAK-GLASS LOGS MODAL */}
              {activeModal === 'breakGlass' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredBreakGlass.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>No emergency break-glass override events logged.</p>
                  ) : (
                    filteredBreakGlass.map(bg => (
                      <div key={bg.id} style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px 16px', borderRadius: '8px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <strong style={{ color: '#ef4444' }}>Dr. {bg.doctorName} ➔ Patient: {bg.patientName}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{new Date(bg.timestamp).toLocaleString()}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-primary)', fontStyle: 'italic' }}>
                          "{bg.details}"
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '16px' }}
              onClick={() => setActiveModal(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Nested Seal Verification Modal */}
      {verifyRecordId && (
        <RecordVerificationPortal recordId={verifyRecordId} onClose={() => setVerifyRecordId(null)} />
      )}
    </div>
  );
}
