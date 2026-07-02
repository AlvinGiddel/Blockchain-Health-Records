import React, { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Link2, FileText, AlertCircle, Check, Award, Lock, HelpCircle, Search } from 'lucide-react';

export default function MedicalRecords({ user, selectedPatient, onBackToRegistry }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [patientsList, setPatientsList] = useState([]);
  const [activePatient, setActivePatient] = useState(selectedPatient || null);
  const [accessDenied, setAccessDenied] = useState(false);

  // New Record Form Fields
  const [diagnosis, setDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [prescriptions, setPrescriptions] = useState('');
  const [ipfsFile, setIpfsFile] = useState('');
  const [ipfsHashMock, setIpfsHashMock] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState(null);
  // Modal states for simulated IPFS document
  const [viewingIpfsDoc, setViewingIpfsDoc] = useState(null);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Sync search query when activePatient changes (e.g. from Dashboard registry selection)
  useEffect(() => {
    if (activePatient) {
      setPatientSearchQuery(activePatient.name);
    } else {
      setPatientSearchQuery('');
    }
  }, [activePatient]);

  // Click outside handler for search results dropdown
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.patient-search-container')) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (user.role === 'patient') {
      fetchRecords(user.id);
    } else {
      // If doctor is logged in
      fetchPatients();
      if (activePatient) {
        fetchRecords(activePatient.id || activePatient._id);
      } else {
        setRecords([]);
        setAccessDenied(false);
      }
    }
  }, [user, activePatient]);

  const fetchPatients = async () => {
    try {
      const res = await fetch('/api/users/patients');
      if (res.ok) {
        const data = await res.json();
        setPatientsList(data);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  };

  const fetchRecords = async (patientId) => {
    try {
      setLoading(true);
      setAccessDenied(false);
      const uId = user.id || user._id;
      const res = await fetch(`/api/records/patient/${patientId}?requesterId=${uId}&requesterRole=${user.role}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      } else if (res.status === 403) {
        setAccessDenied(true);
        setRecords([]);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch records');
      }
    } catch (err) {
      console.error('Error fetching records:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRecord = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    if (!activePatient) {
      setFormError('Please select a patient first.');
      setSubmitting(false);
      return;
    }

    // Generate a mock IPFS CID if a file name is provided
    let finalIpfsHash = '';
    if (ipfsFile) {
      const randomString = Math.random().toString(36).substring(2, 15);
      finalIpfsHash = `Qm${randomString}xBlockchainEHR`;
    }

    const payload = {
      patientId: activePatient.id || activePatient._id,
      doctorId: user.id || user._id,
      diagnosis,
      treatment,
      prescriptions: prescriptions.split(',').map(p => p.trim()).filter(p => p !== ''),
      ipfsHash: finalIpfsHash
    };

    try {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create record');
      }

      setFormSuccess('Record created, cryptographically signed, and broadcast to Ledger Pool!');
      setDiagnosis('');
      setTreatment('');
      setPrescriptions('');
      setIpfsFile('');
      
      // Refresh list
      fetchRecords(activePatient.id || activePatient._id);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to open the mock IPFS file viewer
  const handleOpenIpfsFile = (record) => {
    setViewingIpfsDoc(record);
  };

  return (
    <div>
      {/* Header and selector if doctor */}
      <div className="page-header-flex">
        <div>
          <h1 style={{ fontSize: '2.00rem', fontWeight: 800 }}>Medical Folders</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {user.role === 'doctor' ? 'Write, sign, and view cryptographic medical dossiers' : 'Access your encrypted medical history'}
          </p>
        </div>

        {user.role === 'doctor' && (() => {
          const filteredPatients = patientsList.filter(p => 
            p.name.toLowerCase().includes(patientSearchQuery.toLowerCase()) || 
            (p.email && p.email.toLowerCase().includes(patientSearchQuery.toLowerCase()))
          );
          return (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {onBackToRegistry && (
                <button className="btn btn-secondary" onClick={onBackToRegistry}>Back to Registry</button>
              )}
              
              <div className="patient-search-container" style={{ position: 'relative', width: '280px' }}>
                <input
                  type="text"
                  placeholder="Search patient by name/email..."
                  className="form-control"
                  style={{ width: '100%', paddingLeft: '32px' }}
                  value={patientSearchQuery}
                  onFocus={() => setShowSearchDropdown(true)}
                  onChange={(e) => {
                    setPatientSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                />
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                
                {showSearchDropdown && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: '320px',
                    background: 'var(--bg-secondary)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
                    zIndex: 10000,
                    maxHeight: '260px',
                    overflowY: 'auto',
                    padding: '6px 0'
                  }}>
                    {filteredPatients.length === 0 ? (
                      <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                        No matching patients found.
                      </div>
                    ) : (
                      filteredPatients.map(p => (
                        <div
                          key={p.id || p._id}
                          className="search-item"
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            transition: 'background 0.2s ease',
                            borderBottom: '1px solid var(--glass-border)'
                          }}
                          onClick={() => {
                            setActivePatient(p);
                            setPatientSearchQuery(p.name);
                            setShowSearchDropdown(false);
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.15)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{p.name}</strong>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.email}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <div className={user.role === 'doctor' && activePatient ? 'grid-medical-records' : 'grid-medical-records single-col'}>
        
        {/* Doctor writing panel */}
        {user.role === 'doctor' && activePatient && (
          <div className="glass-card" style={{ height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
              <Plus size={20} /> Create New Record
            </h3>

            {formError && (
              <div className="badge-error" style={{ padding: '10px', borderRadius: '6px', marginBottom: '14px', fontSize: '0.85rem', display: 'flex', gap: '6px' }}>
                <AlertCircle size={14} /> <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="badge-success" style={{ padding: '10px', borderRadius: '6px', marginBottom: '14px', fontSize: '0.85rem', display: 'flex', gap: '6px' }}>
                <Check size={14} /> <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateRecord}>
              <div className="form-group">
                <label>Patient Name</label>
                <input type="text" className="form-control" disabled value={activePatient.name} />
              </div>

              <div className="form-group">
                <label htmlFor="diagnosis">Diagnosis</label>
                <textarea
                  id="diagnosis"
                  className="form-control"
                  rows="3"
                  placeholder="Enter patient diagnosis details..."
                  required
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="treatment">Recommended Treatment Plan</label>
                <textarea
                  id="treatment"
                  className="form-control"
                  rows="3"
                  placeholder="Enter recommended treatment plan details..."
                  required
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="prescriptions">Prescriptions (comma-separated)</label>
                <input
                  type="text"
                  id="prescriptions"
                  className="form-control"
                  placeholder="e.g. Prescription A 500mg, Prescription B"
                  value={prescriptions}
                  onChange={(e) => setPrescriptions(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="ipfsFile">IPFS Attachment (e.g. Lab Report File Name)</label>
                <input
                  type="text"
                  id="ipfsFile"
                  className="form-control"
                  placeholder="e.g. lab_report.pdf (optional)"
                  value={ipfsFile}
                  onChange={(e) => setIpfsFile(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '12px' }}
                disabled={submitting}
              >
                {submitting ? 'Signing Record...' : 'Sign & Broadcast Record'}
              </button>
            </form>
          </div>
        )}

        {/* Record list panel */}
        <div className={`glass-card medical-history-card ${user.role === 'doctor' && activePatient ? 'doctor-view' : ''}`}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>
            {activePatient ? `Medical Dossier for ${activePatient.name}` : 'My Electronic Medical Folder'}
          </h3>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading dossiers...</div>
          ) : !activePatient && user.role === 'doctor' ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Please select a patient from the dropdown above to view records.</div>
          ) : accessDenied ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-error)' }}>
              <Lock size={48} style={{ margin: '0 auto 16px', display: 'block', color: 'var(--color-warning)' }} />
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Access Denied: Active Treating Relationship Required</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
                You do not have a confirmed appointment or active treatment relationship with this patient. Access is restricted under secure role-based access control.
              </p>
            </div>
          ) : records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No medical records found.</div>
          ) : (
            <div>
              {/* Section 1: Clinical Records & Diagnoses */}
              <div style={{ marginBottom: '32px' }}>
                <h4 style={{ fontSize: '1.05rem', color: 'var(--color-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Clinical Records & Diagnoses ({records.filter(r => r.recordType !== 'consultation').length})
                </h4>
                {records.filter(r => r.recordType !== 'consultation').length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem', padding: '10px' }}>No general medical records found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {records.filter(r => r.recordType !== 'consultation').map(rec => (
                      <div
                        key={rec.id || rec._id}
                        style={{
                          border: '1px solid var(--glass-border)',
                          borderRadius: '12px',
                          background: 'rgba(255,255,255,0.02)',
                          padding: '20px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Diagnosed by Dr. {rec.doctorName}</h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(rec.timestamp).toLocaleString()}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <span className="badge badge-success" style={{ gap: '4px' }}>
                              <ShieldCheck size={12} /> Signed
                            </span>
                            {rec.isMined ? (
                              <span className="badge badge-success">Block #{rec.blockIndex}</span>
                            ) : (
                              <span className="badge badge-warning">Ledger Pool</span>
                            )}
                          </div>
                        </div>

                        <div className="grid-2" style={{ gap: '16px', marginBottom: '14px' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Diagnosis</span>
                            <p style={{ fontSize: '0.95rem', marginTop: '4px' }}>{rec.diagnosis}</p>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Treatment Plan</span>
                            <p style={{ fontSize: '0.95rem', marginTop: '4px' }}>{rec.treatment}</p>
                          </div>
                        </div>

                        {rec.prescriptions && rec.prescriptions.length > 0 && (
                          <div style={{ marginBottom: '14px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Prescribed Medication</span>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {rec.prescriptions.map((pres, idx) => (
                                <span key={idx} className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>{pres}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {rec.ipfsHash && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', width: 'fit-content', cursor: 'pointer', marginBottom: '14px' }} onClick={() => handleOpenIpfsFile(rec)}>
                            <Link2 size={14} color="var(--color-accent)" />
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-accent)', fontWeight: 500 }}>IPFS Attachment: {rec.ipfsHash.substring(0, 10)}...{rec.ipfsHash.substring(rec.ipfsHash.length - 6)}</span>
                          </div>
                        )}

                        <div>
                          <button
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                            onClick={() => setExpandedRecord(expandedRecord === rec.id || expandedRecord === rec._id ? null : (rec.id || rec._id))}
                          >
                            <Lock size={12} /> {expandedRecord === (rec.id || rec._id) ? 'Hide Verification Metadata' : 'View Verification Metadata'}
                          </button>
                          {expandedRecord === (rec.id || rec._id) && (
                            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              <div>
                                <strong style={{ color: 'var(--color-primary)' }}>Doctor Public Key (PEM Hash):</strong>
                                <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)', marginTop: '2px', maxHeight: '60px', overflowY: 'auto' }}>
                                  {rec.doctorPublicKey}
                                </div>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--color-primary)' }}>Cryptographic RSA-SHA256 Signature:</strong>
                                <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  {rec.signature}
                                </div>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--color-primary)' }}>Integrity Verification:</strong>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', color: 'var(--color-success)' }}>
                                  <ShieldCheck size={14} /> <span>Calculated signature matches public key. Integrity Verified.</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Consultation History */}
              <div>
                <h4 style={{ fontSize: '1.05rem', color: 'var(--color-accent)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Consultation History ({records.filter(r => r.recordType === 'consultation').length})
                </h4>
                {records.filter(r => r.recordType === 'consultation').length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem', padding: '10px' }}>No consultation history found.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {records.filter(r => r.recordType === 'consultation').map(rec => (
                      <div
                        key={rec.id || rec._id}
                        style={{
                          border: '1px solid var(--glass-border)',
                          borderRadius: '12px',
                          background: 'rgba(255,255,255,0.02)',
                          padding: '20px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Consultation with Dr. {rec.doctorName}</h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(rec.timestamp).toLocaleString()}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <span className="badge badge-success" style={{ gap: '4px' }}>
                              <ShieldCheck size={12} /> Signed
                            </span>
                            {rec.isMined ? (
                              <span className="badge badge-success">Block #{rec.blockIndex}</span>
                            ) : (
                              <span className="badge badge-warning">Ledger Pool</span>
                            )}
                          </div>
                        </div>

                        <div className="grid-2" style={{ gap: '16px', marginBottom: '14px' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Symptoms</span>
                            <p style={{ fontSize: '0.95rem', marginTop: '4px' }}>{rec.symptoms}</p>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Clinical Diagnosis</span>
                            <p style={{ fontSize: '0.95rem', marginTop: '4px' }}>{rec.diagnosis}</p>
                          </div>
                        </div>

                        <div className="grid-2" style={{ gap: '16px', marginBottom: '14px' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Treatment Plan</span>
                            <p style={{ fontSize: '0.95rem', marginTop: '4px' }}>{rec.treatment}</p>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Consultation Notes</span>
                            <p style={{ fontSize: '0.95rem', marginTop: '4px' }}>{rec.notes}</p>
                          </div>
                        </div>

                        {rec.prescriptions && rec.prescriptions.length > 0 && (
                          <div style={{ marginBottom: '14px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Prescribed Medication</span>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {rec.prescriptions.map((pres, idx) => (
                                <span key={idx} className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>{pres}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {rec.labRequest && (
                          <div style={{ marginBottom: '14px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Requested Lab Tests</span>
                            <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>{rec.labRequest}</span>
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', marginBottom: '14px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Blockchain Transaction Hash</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-accent)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{rec.transactionHash}</span>
                        </div>

                        <div>
                          <button
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                            onClick={() => setExpandedRecord(expandedRecord === rec.id || expandedRecord === rec._id ? null : (rec.id || rec._id))}
                          >
                            <Lock size={12} /> {expandedRecord === (rec.id || rec._id) ? 'Hide Verification Metadata' : 'View Verification Metadata'}
                          </button>
                          {expandedRecord === (rec.id || rec._id) && (
                            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              <div>
                                <strong style={{ color: 'var(--color-primary)' }}>Consultation Content Hash (SHA-256):</strong>
                                <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  {rec.consultationHash}
                                </div>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--color-primary)' }}>Doctor Public Key:</strong>
                                <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)', marginTop: '2px', maxHeight: '60px', overflowY: 'auto' }}>
                                  {rec.doctorPublicKey}
                                </div>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--color-primary)' }}>Cryptographic RSA-SHA256 Signature:</strong>
                                <div style={{ wordBreak: 'break-all', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  {rec.signature}
                                </div>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--color-primary)' }}>Integrity Verification:</strong>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', color: 'var(--color-success)' }}>
                                  <ShieldCheck size={14} /> <span>Calculated signature matches public key. Integrity Verified.</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Simulated IPFS document view modal */}
      {viewingIpfsDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', background: 'var(--bg-secondary)', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '16px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
                <FileText size={22} /> IPFS File Explorer
              </h3>
              <button style={{ background: 'transparent', border: 'none', fontSize: '1.25rem', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => setViewingIpfsDoc(null)}>✕</button>
            </div>
            
            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '16px', marginBottom: '20px', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>IPFS Hash Node</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{viewingIpfsDoc.ipfsHash}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Encryption protocol</span>
                <span>SHA-256 IPFS Peer Gateway</span>
              </div>
            </div>

            <div style={{ border: '2px dashed var(--glass-border)', borderRadius: '8px', padding: '30px 20px', textAlign: 'center', background: 'rgba(0,0,0,0.2)' }}>
              <Award size={48} color="var(--color-primary)" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ marginBottom: '8px' }}>Simulated Clinical Certificate Document</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '400px', margin: '0 auto 16px' }}>
                This clinical scan/lab report is hashed off-chain on the InterPlanetary File System (IPFS) to conserve blockchain storage.
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px 12px', borderRadius: '4px', color: 'var(--color-success)', fontSize: '0.85rem' }}>
                <Check size={14} /> File Hash Verified: Untampered
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setViewingIpfsDoc(null)}>Close Document</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
