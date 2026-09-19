import React, { useState } from 'react';
import { getProvider, getCredentialManagerContract, getRegistryContract } from '../utils/contracts';
import StatusBadge from '../components/StatusBadge';

function Verify() {
  const [hash, setHash] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    setStatus('Verifying...');
    setResult(null);
    try {
      const provider = getProvider();
      const manager = await getCredentialManagerContract(provider);
      const registry = await getRegistryContract(provider);
      
      const cred = await manager.getCredential(hash);
      if (cred.timestamp === 0n) {
        setResult({ status: 'invalid', message: 'Credential not found' });
      } else if (cred.isRevoked) {
        setResult({ status: 'revoked', issuer: cred.issuer, timestamp: Number(cred.timestamp) });
      } else {
        const institution = await registry.institutions(cred.issuer);
        setResult({ 
          status: 'valid', 
          issuer: cred.issuer, 
          institutionName: institution.name,
          timestamp: Number(cred.timestamp)
        });
      }
      setStatus('');
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.reason || err.message}`);
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
          {result.message && <p>{result.message}</p>}
          {result.issuer && <p><strong>Issuer Address:</strong> {result.issuer}</p>}
          {result.institutionName && <p><strong>Institution Name:</strong> {result.institutionName}</p>}
          {result.timestamp && <p><strong>Issued At:</strong> {new Date(result.timestamp * 1000).toLocaleString()}</p>}
        </div>
      )}
    </div>
  );
}

export default Verify;
