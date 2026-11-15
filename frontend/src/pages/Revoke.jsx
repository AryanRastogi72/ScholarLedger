import React, { useState } from 'react';
import { getSigner, getCredentialManagerContract } from '../utils/contracts';
import { parseCredentialFile } from '../utils/credential';

function Revoke() {
  const [hash, setHash] = useState('');
  const [status, setStatus] = useState('');

  const handleFile = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      setHash((await parseCredentialFile(await f.text())).commitment);
      setStatus('');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleRevoke = async (e) => {
    e.preventDefault();
    setStatus('Processing...');
    try {
      const signer = await getSigner();
      const manager = await getCredentialManagerContract(signer);
      const tx = await manager.revokeCredential(hash.trim());
      setStatus(`Transaction pending: ${tx.hash}`);
      await tx.wait();
      setStatus('Success! Credential revoked.');
    } catch (err) {
      setStatus(`Error: ${err.reason || err.shortMessage || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Revoke Credential</h2>
      <p>Only the original issuer can revoke a credential. Paste a commitment or upload the credential file.</p>
      <input type="file" accept=".json,application/json" onChange={handleFile} />
      <form onSubmit={handleRevoke}>
        <input placeholder="Commitment (0x...)" value={hash} onChange={e => setHash(e.target.value)} required />
        <button type="submit" style={{ backgroundColor: 'var(--error-color)' }}>Revoke</button>
      </form>
      {status && <p style={{ marginTop: '15px' }}>{status}</p>}
    </div>
  );
}

export default Revoke;
