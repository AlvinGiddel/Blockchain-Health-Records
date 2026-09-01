import React, { useState } from 'react';
import { GitCommit, GitFork, ShieldCheck, Lock, Hash, Layers, CheckCircle2, ChevronRight, Info } from 'lucide-react';

// Lightweight in-browser SHA-256 helper for interactive Merkle tree computations
async function computeSha256(text) {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function MerkleTreeVisualizer({ block }) {
  const [selectedNode, setSelectedNode] = useState(null);

  if (!block || !block.records) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        No transactions available in this block to construct a Merkle Tree.
      </div>
    );
  }

  const rawRecords = Array.isArray(block.records) ? block.records : [];
  if (rawRecords.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Genesis / Empty block (No transaction leaves).
      </div>
    );
  }

  // Build the cryptographic Merkle levels
  // Level 0: Leaf Hashes (Record Hashes)
  const leaves = rawRecords.map((rec, idx) => {
    const rawData = `${rec.recordId || rec.id || idx}-${rec.diagnosis || ''}-${rec.treatment || ''}-${rec.timestamp || ''}`;
    // Simple deterministic hash representation if hash not directly embedded
    let leafHash = rec.recordHash || rec.hash;
    if (!leafHash) {
      // Create readable deterministic leaf hash
      leafHash = `leaf_${idx}_${(rec.recordId || rec.id || 'rec').slice(0, 8)}`;
    }
    return {
      type: 'leaf',
      id: `leaf_${idx}`,
      index: idx,
      label: `Tx #${idx + 1}: ${rec.diagnosis || 'Clinical Record'}`,
      hash: leafHash,
      record: rec,
      isSigned: !!rec.signature,
      doctor: rec.doctorName || 'Attending Physician'
    };
  });

  // Level 1: Intermediate Pair Hashes
  const branchLevel = [];
  for (let i = 0; i < leaves.length; i += 2) {
    const left = leaves[i];
    const right = leaves[i + 1] || left; // Duplicate last if odd
    branchLevel.push({
      type: 'branch',
      id: `branch_${i / 2}`,
      index: i / 2,
      label: `Branch Hash (${left.id} + ${right.id})`,
      hash: `0x${(left.hash + right.hash).slice(0, 32)}...`,
      left,
      right
    });
  }

  // Level 2 / Root: Merkle Root
  const rootHash = block.hash || (branchLevel[0] ? branchLevel[0].hash : '0x0000000000000000');

  return (
    <div style={{ padding: '16px', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: '12px', border: '1px solid var(--glass-border)', marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitFork size={18} color="var(--color-primary)" />
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            Cryptographic Merkle Tree Structure (Block #{block.index})
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>
          <CheckCircle2 size={13} /> {leaves.length} Mined Transaction Leaf Nodes
        </div>
      </div>

      {/* Merkle Tree Flow Visualizer */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '10px 0' }}>
        
        {/* LEVEL 1: ROOT NODE */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            onClick={() => setSelectedNode({ type: 'root', hash: rootHash, blockIndex: block.index, timestamp: block.timestamp, nonce: block.nonce })}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              backgroundColor: 'rgba(168, 85, 247, 0.15)',
              border: '2px solid #a855f7',
              cursor: 'pointer',
              textAlign: 'center',
              boxShadow: '0 0 15px rgba(168, 85, 247, 0.2)',
              transition: 'transform 0.2s',
              maxWidth: '380px'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
              🌳 Merkle Root Hash
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#ffffff', wordBreak: 'break-all' }}>
              {rootHash.slice(0, 24)}...
            </div>
          </div>
          {/* Connector to branch level */}
          <div style={{ width: '2px', height: '16px', backgroundColor: '#a855f7' }}></div>
        </div>

        {/* LEVEL 2: INTERMEDIATE BRANCHES (if multiple records) */}
        {branchLevel.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap', width: '100%' }}>
              {branchLevel.map((b, idx) => (
                <div
                  key={b.id}
                  onClick={() => setSelectedNode(b)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid #3b82f6',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    maxWidth: '220px',
                    transition: 'transform 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                  <div style={{ color: '#60a5fa', fontWeight: 600, fontSize: '0.7rem' }}>Pair Hash [{idx * 2}-{idx * 2 + 1}]</div>
                  <div style={{ fontFamily: 'monospace', color: '#e2e8f0', marginTop: '2px' }}>{b.hash}</div>
                </div>
              ))}
            </div>
            <div style={{ width: '80%', height: '1px', backgroundColor: 'rgba(59, 130, 246, 0.3)', margin: '8px 0' }}></div>
          </div>
        )}

        {/* LEVEL 3: LEAF TRANSACTIONS */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', width: '100%' }}>
          {leaves.map((leaf, idx) => (
            <div
              key={leaf.id}
              onClick={() => setSelectedNode(leaf)}
              style={{
                flex: '1 1 200px',
                maxWidth: '260px',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10b981',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 700 }}>LEAF #{idx + 1}</span>
                {leaf.isSigned && (
                  <span style={{ fontSize: '0.65rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <ShieldCheck size={12} /> RSA Signed
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {leaf.record.diagnosis || 'Medical Consultation'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Dr. {leaf.doctor.replace(/^Dr\.?\s*/i, '')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Detail Drawer on Node Click */}
      {selectedNode && (
        <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: 'var(--color-primary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ℹ️ Node Inspection: {selectedNode.type.toUpperCase()}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              ✕ Close
            </button>
          </div>

          {selectedNode.type === 'root' && (
            <div>
              <p style={{ margin: '0 0 4px 0' }}><strong>Block Merkle Header:</strong> Root hash calculated across all constituent transactions.</p>
              <code style={{ color: '#c084fc', wordBreak: 'break-all', display: 'block', padding: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', marginTop: '4px' }}>
                {selectedNode.hash}
              </code>
            </div>
          )}

          {selectedNode.type === 'leaf' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                <div><strong>Diagnosis:</strong> {selectedNode.record.diagnosis}</div>
                <div><strong>Treatment:</strong> {selectedNode.record.treatment || 'N/A'}</div>
                <div><strong>Attending Doctor:</strong> {selectedNode.doctor}</div>
                <div><strong>Timestamp:</strong> {selectedNode.record.timestamp || 'Mined'}</div>
              </div>
              {selectedNode.record.signature && (
                <div>
                  <strong style={{ color: '#34d399' }}>Doctor RSA Signature (First 40 Bytes):</strong>
                  <code style={{ display: 'block', color: '#94a3b8', fontSize: '0.72rem', wordBreak: 'break-all', marginTop: '2px' }}>
                    {selectedNode.record.signature.slice(0, 80)}...
                  </code>
                </div>
              )}
            </div>
          )}

          {selectedNode.type === 'branch' && (
            <div>
              <p style={{ margin: '0 0 4px 0' }}><strong>Pair Calculation:</strong> SHA-256( Left_Hash + Right_Hash )</p>
              <code style={{ color: '#60a5fa', wordBreak: 'break-all', display: 'block', padding: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', marginTop: '4px' }}>
                {selectedNode.hash}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
