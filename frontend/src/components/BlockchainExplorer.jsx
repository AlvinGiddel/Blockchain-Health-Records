import React, { useEffect, useState } from 'react';
import { Database, ShieldAlert, Cpu, CheckCircle2, ChevronRight, AlertTriangle, RefreshCw, Flame, HelpCircle } from 'lucide-react';

export default function BlockchainExplorer({ user }) {
  const [blocks, setBlocks] = useState([]);
  const [pendingRecords, setPendingRecords] = useState([]);
  const [isValid, setIsValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [mining, setMining] = useState(false);

  // Tampering states
  const [tamperRecordId, setTamperRecordId] = useState('');
  const [tamperDiagnosis, setTamperDiagnosis] = useState('');
  const [tamperSuccess, setTamperSuccess] = useState('');
  const [tamperError, setTamperError] = useState('');

  const [recovering, setRecovering] = useState(false);

  const handleRestoreDatabase = async () => {
    setRecovering(true);
    try {
      const res = await fetch('/api/blockchain/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        fetchBlockchainData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRecovering(false);
    }
  };

  useEffect(() => {
    fetchBlockchainData();
  }, []);

  const fetchBlockchainData = async () => {
    try {
      setLoading(true);
      
      // Fetch blocks
      const blocksRes = await fetch('/api/blockchain/blocks');
      const blocksData = blocksRes.ok ? await blocksRes.json() : [];
      setBlocks(Array.isArray(blocksData) ? blocksData : []);

      // Fetch chain validation status
      const validateRes = await fetch('/api/blockchain/validate');
      const validateData = validateRes.ok ? await validateRes.json() : { isValid: true };
      setIsValid(validateData.isValid);

      // Fetch pending records directly from blockchain mempool
      const pendingRes = await fetch('/api/blockchain/mempool');
      const pendingData = pendingRes.ok ? await pendingRes.json() : [];
      setPendingRecords(Array.isArray(pendingData) ? pendingData : []);

    } catch (error) {
      console.error('Error fetching explorer data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMineBlock = async () => {
    setMining(true);
    try {
      const res = await fetch('/api/blockchain/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Mining failed');
      }
      
      // Play mining visual delay
      setTimeout(() => {
        setMining(false);
        fetchBlockchainData();
      }, 1500);
    } catch (error) {
      alert(error.message);
      setMining(false);
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
      if (!res.ok) {
        throw new Error(data.error || 'Tampering failed');
      }

      setTamperSuccess(data.message);
      setTamperDiagnosis('');
      fetchBlockchainData(); // Re-fetch to see the broken chain!
    } catch (err) {
      setTamperError(err.message);
    }
  };

  // Get all mined records across all blocks to populate the tamper dropdown
  const getAllMinedRecords = () => {
    let list = [];
    blocks.forEach(b => {
      if (b.index === 0) return; // Skip genesis
      b.records.forEach(r => {
        if (r.txType !== 'consent') {
          list.push({
            id: r.recordId,
            patientName: r.patientName || 'Patient',
            doctorName: r.doctorName,
            diagnosis: r.diagnosis || '',
            blockIndex: b.index
          });
        }
      });
    });
    return list;
  };

  const minedRecords = getAllMinedRecords();

  return (
    <div>
      <div className="page-header-flex">
        <div>
          <h1 style={{ fontSize: '2.00rem', fontWeight: 800 }}>Blockchain Ledger Explorer</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Live inspection of the decentralized cryptographic medical ledger and chain validations
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchBlockchainData} disabled={loading} style={{ display: 'flex', gap: '8px' }}>
          <RefreshCw size={16} className={loading ? 'rotate-slow' : ''} /> Refresh Ledger
        </button>
      </div>

      {/* Validation status banner */}
      <div
        className={isValid ? 'badge-success' : 'badge-error'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 24px',
          borderRadius: '12px',
          marginBottom: '32px',
          width: '100%',
          fontSize: '1rem',
          boxShadow: isValid ? '0 0 15px rgba(16,185,129,0.1)' : '0 0 20px rgba(239,68,68,0.25)',
          animation: isValid ? 'none' : 'pulse 1.5s infinite'
        }}
      >
        {isValid ? (
          <>
            <CheckCircle2 size={24} />
            <div>
              <strong style={{ display: 'block', fontSize: '1.05rem' }}>Ledger Status: Secured & Verified</strong>
              <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>All cryptographically chained blocks are consistent. No unauthorized modifications detected in database files.</span>
            </div>
          </>
        ) : (
          <div className="banner-flex" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldAlert size={24} />
              <div>
                <strong style={{ display: 'block', fontSize: '1.05rem' }}>SECURITY ALERT: Ledger Inconsistency Found!</strong>
                <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>The database has been tampered with. Cryptographic hashes of Block records do not match the chain state!</span>
              </div>
            </div>
            {user.role !== 'patient' && (
              <button className="btn btn-secondary" onClick={handleRestoreDatabase} disabled={recovering} style={{ background: '#fff', color: '#000', border: 'none', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600 }}>
                {recovering ? 'Repairing Ledger...' : 'Recover from Ledger'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid-explorer-main">
        
        {/* Visual Blockchain */}
        <div>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Chained Blocks</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {blocks.map((block, index) => {
              // Determine if this block is corrupted (only relevant if chain is invalid and this block/subsequent is damaged)
              // Let's write a simple visual checker: a block is broken if it's after/at the tampered block
              let isBlockBroken = false;
              if (!isValid && index > 0) {
                // If previous block hash doesn't match this previousHash, or if the current block recalculates differently
                const prevBlock = blocks[index - 1];
                if (block.previousHash !== prevBlock.hash) {
                  isBlockBroken = true;
                }
                
                // Or check if records contain modified tag
                const hasHackedTag = block.records.some(r => r.diagnosis && r.diagnosis.includes('HACKED'));
                if (hasHackedTag) {
                  isBlockBroken = true;
                }
              }

              return (
                <div key={block.index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  
                  {/* The Block Card */}
                  <div
                    className="glass-card"
                    style={{
                      width: '100%',
                      border: isBlockBroken ? '2px solid var(--color-error)' : '1px solid var(--glass-border)',
                      boxShadow: isBlockBroken ? '0 0 20px var(--color-error-glow)' : 'none',
                      background: isBlockBroken ? 'rgba(239, 68, 68, 0.05)' : 'var(--glass-bg)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Database size={18} color={isBlockBroken ? 'var(--color-error)' : 'var(--color-primary)'} />
                        <h4 style={{ margin: 0, fontSize: '1.1rem' }}>Block #{block.index}</h4>
                        {block.index === 0 && <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>Genesis</span>}
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nonce: {block.nonce}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Timestamp</span>
                        <span>{new Date(block.timestamp).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Previous Hash</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{block.previousHash.substring(0, 16)}...</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Block Hash</span>
                        <span style={{ fontFamily: 'monospace', color: isBlockBroken ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>{block.hash.substring(0, 16)}...</span>
                      </div>
                    </div>

                    {/* Mined Records in Block */}
                    <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '12px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Mined Transactions Ledger ({block.records.length})</span>
                      {block.records.map((rec, rIdx) => (
                        <div key={rIdx} style={{ fontSize: '0.85rem', borderBottom: rIdx < block.records.length - 1 ? '1px solid var(--glass-border)' : 'none', paddingBottom: rIdx < block.records.length - 1 ? '8px' : '0', paddingTop: rIdx > 0 ? '8px' : '0' }}>
                          {block.index === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{rec.message}</p>
                          ) : rec.txType === 'consent' ? (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{rec.patientName}</span>
                                <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '1px 6px', textTransform: 'uppercase' }}>Consent Mod</span>
                              </div>
                              <p style={{ color: 'var(--text-primary)' }}>
                                Patient {rec.action === 'grant' ? 'granted access to' : 'revoked access from'} <strong>Dr. {rec.doctorName}</strong>
                              </p>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                                Signed by Patient
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{rec.patientName}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>By Dr. {rec.doctorName}</span>
                              </div>
                              <p style={{ color: rec.diagnosis && rec.diagnosis.includes('HACKED') ? 'var(--color-error)' : 'var(--text-primary)' }}>
                                <strong>Diagnosis:</strong> {rec.diagnosis}
                              </p>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                <strong>Treatment:</strong> {rec.treatment}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chain Connection Arrow */}
                  {index < blocks.length - 1 && (
                    <div style={{ margin: '12px 0', color: isBlockBroken ? 'var(--color-error)' : 'var(--glass-border)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: '2px', height: '20px', background: isBlockBroken ? 'var(--color-error)' : 'rgba(255,255,255,0.1)' }}></div>
                      <ChevronRight style={{ transform: 'rotate(90deg)', marginTop: '-4px' }} size={16} />
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>

        {/* Action Sidebar (Mempool & Tampering Workshop) */}
        <div>
          {/* Mempool */}
          <div className="glass-card" style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
              <Cpu size={20} /> Mempool Ledger Queue
            </h3>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Newly signed medical records await block packaging & mining validations.
            </p>

            {pendingRecords.length === 0 ? (
              <div style={{ border: '1px dashed var(--glass-border)', borderRadius: '8px', padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No pending signed records in mining pool.
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', marginBottom: '16px', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px' }}>
                  {pendingRecords.map((pr, idx) => (
                    <div key={pr.id || pr._id || idx} style={{ background: 'rgba(0,0,0,0.15)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span style={{ color: 'var(--color-accent)' }}>{pr.patientName || 'Patient'}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Signed</span>
                      </div>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {pr.txType === 'consent'
                          ? `Consent Modify: ${pr.action === 'grant' ? 'Grant' : 'Revoke'} Dr. ${pr.doctorName}`
                          : `Diagnosis: ${pr.diagnosis}`
                        }
                      </div>
                    </div>
                  ))}
                </div>

                {user.role !== 'patient' && (
                  <button
                    className={`btn btn-primary ${mining ? 'mining-pulse' : ''}`}
                    style={{ width: '100%', gap: '8px' }}
                    onClick={handleMineBlock}
                    disabled={mining}
                  >
                    <Cpu size={16} className={mining ? 'rotate-slow' : ''} />
                    {mining ? 'Solving Proof-of-Work...' : `Mine Block (${pendingRecords.length} Records)`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tamper Workshop */}
          {user.role === 'doctor' && (
            <div className="glass-card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-error)' }}>
                <Flame size={20} /> Security Attack Lab
              </h3>
              
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Simulate a database intrusion. Directly edit a medical record stored in the database to demonstrate how blockchain instantly flags database tampering.
              </p>

              {tamperError && (
                <div className="badge-error" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.8rem', display: 'flex', gap: '6px' }}>
                  <AlertTriangle size={14} /> <span>{tamperError}</span>
                </div>
              )}

              {tamperSuccess && (
                <div className="badge-success" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.8rem', display: 'flex', gap: '6px' }}>
                  <CheckCircle2 size={14} /> <span style={{ wordBreak: 'break-word' }}>{tamperSuccess}</span>
                </div>
              )}

              {minedRecords.length === 0 ? (
                <div style={{ border: '1px dashed rgba(239,68,68,0.2)', borderRadius: '8px', padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No mined blocks available to tamper. Mine a block first.
                </div>
              ) : (
                <form onSubmit={handleTamperDatabase}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label>Select Mined Record</label>
                    <select
                      className="form-control"
                      value={tamperRecordId}
                      onChange={(e) => setTamperRecordId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Record --</option>
                      {minedRecords.map(mr => (
                        <option key={mr.id} value={mr.id}>
                          Block #{mr.blockIndex}: {mr.patientName} ({mr.diagnosis.substring(0, 15)}...)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '16px' }}>
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

                  <button type="submit" className="btn btn-danger" style={{ width: '100%', gap: '8px' }}>
                    <Flame size={16} /> Force Database Edit
                  </button>
                </form>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
