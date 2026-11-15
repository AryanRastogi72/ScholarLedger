import React, { useState } from 'react';
import { getReadProvider, getCredentialManagerContract, getRegistryContract } from '../utils/contracts';
import { parseCredentialFile, verifyMerkleProof } from '../utils/credential';
import StatusBadge from '../components/StatusBadge';

function Verify() {
  const [hash, setHash] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');

  // Chain lookup for a commitment; `file` (already checked against its commitment) adds disclosure
  const lookup = async (commitment, file) => {
    setStatus('Verifying...');
    try {
      const provider = getReadProvider();
      const manager = await getCredentialManagerContract(provider);
      const registry = await getRegistryContract(provider);

      const [isValid, issuer, issuedAt, isRevoked] = await manager.verifyCredential(commitment);
      if (issuedAt === 0n) {
        setResult({ status: 'NOT FOUND' });
      } else {
        const institution = await registry.institutions(issuer);
        const res = {
          status: isRevoked ? 'REVOKED' : isValid ? 'VALID' : 'ISSUER DEREGISTERED',
          issuer, institutionName: institution.name, timestamp: Number(issuedAt)
        };
        if (file) {
          res.fields = { studentId: file.studentId, programName: file.programName, metadata: file.metadata };
          if (file.batch) {
            let ok = false;
            try {
              const b = await manager.batches(file.batch.batchId);
              ok = b.merkleRoot === file.batch.merkleRoot
                && await verifyMerkleProof(commitment, file.batch.proof, file.batch.merkleRoot);
            } catch { ok = false; }
            res.batchOk = ok;
          }
        }
        setResult(res);
      }
      setStatus('');
    } catch (err) {
      setStatus(`Error: ${err.reason || err.shortMessage || err.message} (is the node running?)`);
    }
  };

  const handleFile = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setResult(null);
    try {
      const cred = await parseCredentialFile(await f.text());
      await lookup(cred.commitment, cred);
    } catch (err) {
      setStatus(err.message); // parse errors never reach the chain
    }
  };

  const handleHash = (e) => {
    e.preventDefault();
    setResult(null);
    const h = hash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) {
      setStatus('Error: enter 0x followed by 64 hex characters');
      return;
    }
    lookup(h.toLowerCase(), null);
  };

  return (
    <div className="card">
      <h2>Verify Credential</h2>
      <h3>Upload credential file</h3>
      <input type="file" accept=".json,application/json" onChange={handleFile} />
      <h3>Or paste commitment</h3>
      <form onSubmit={handleHash}>
        <input placeholder="Commitment (0x...)" value={hash} onChange={e => setHash(e.target.value)} required />
        <button type="submit">Verify</button>
      </form>
      {status && <p>{status}</p>}
      {result && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'var(--bg-color)', borderRadius: '8px' }}>
          <h3>Result: <StatusBadge status={result.status} /></h3>
          {result.issuer && <p><strong>Issuer Address:</strong> {result.issuer}</p>}
          {result.institutionName && <p><strong>Institution Name:</strong> {result.institutionName}</p>}
          {result.timestamp && <p><strong>Issued At:</strong> {new Date(result.timestamp * 1000).toLocaleString()}</p>}
          {result.fields && (
            <>
              <p><strong>Student ID:</strong> {result.fields.studentId}</p>
              <p><strong>Program:</strong> {result.fields.programName}</p>
              {result.fields.metadata && <p><strong>Metadata:</strong> {result.fields.metadata}</p>}
            </>
          )}
          {result.batchOk === true && <p>Batch proof: OK</p>}
          {result.batchOk === false && <p style={{ color: 'var(--error-color)' }}>Warning: the batch proof does not check out.</p>}
        </div>
      )}
    </div>
  );
}

export default Verify;
