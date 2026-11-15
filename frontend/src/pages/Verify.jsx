import React, { useState } from 'react';
import { getReadProvider, getCredentialManagerContract, getRegistryContract } from '../utils/contracts';
import StatusBadge from '../components/StatusBadge';

function Verify() {
  const [hash, setHash] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    setResult(null);
    const h = hash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) {
      setStatus('Error: enter 0x followed by 64 hex characters');
      return;
    }
    setStatus('Verifying...');
    try {
      const provider = getReadProvider();
      const manager = await getCredentialManagerContract(provider);
      const registry = await getRegistryContract(provider);

      const [isValid, issuer, issuedAt, isRevoked] = await manager.verifyCredential(h);
      if (issuedAt === 0n) {
        setResult({ status: 'NOT FOUND' });
      } else {
        const institution = await registry.institutions(issuer);
        const state = isRevoked ? 'REVOKED' : isValid ? 'VALID' : 'ISSUER DEREGISTERED';
        setResult({ status: state, issuer, institutionName: institution.name, timestamp: Number(issuedAt) });
      }
      setStatus('');
    } catch (err) {
      setStatus(`Error: ${err.reason || err.shortMessage || err.message} (is the node running?)`);
    }
  };

  return (
    <div className="card">
      <h2>Verify Credential</h2>
      <form onSubmit={handleVerify}>
        <input placeholder="Credential Hash (0x...)" value={hash} onChange={e => setHash(e.target.value)} required />
        <button type="submit">Verify</button>
      </form>
      {status && <p>{status}</p>}
      {result && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'var(--bg-color)', borderRadius: '8px' }}>
          <h3>Result: <StatusBadge status={result.status} /></h3>
          {result.issuer && <p><strong>Issuer Address:</strong> {result.issuer}</p>}
          {result.institutionName && <p><strong>Institution Name:</strong> {result.institutionName}</p>}
          {result.timestamp && <p><strong>Issued At:</strong> {new Date(result.timestamp * 1000).toLocaleString()}</p>}
        </div>
      )}
    </div>
  );
}

export default Verify;
