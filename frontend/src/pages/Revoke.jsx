import React, { useState } from 'react';
import { getSigner, getCredentialManagerContract } from '../utils/contracts';

function Revoke() {
  const [hash, setHash] = useState('');
  const [status, setStatus] = useState('');

  const handleRevoke = async (e) => {
    e.preventDefault();
    setStatus('Processing...');
    try {
      const signer = await getSigner();
      const manager = await getCredentialManagerContract(signer);
      const tx = await manager.revokeCredential(hash);
      setStatus(`Transaction pending: ${tx.hash}`);
      await tx.wait();
      setStatus(`Success! Credential revoked.`);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.reason || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Revoke Credential</h2>
      <p>Only the original issuer can revoke a credential.</p>
      <form onSubmit={handleRevoke}>
        <input placeholder="Credential Hash (0x...)" value={hash} onChange={e => setHash(e.target.value)} required />
        <button type="submit" style={{ backgroundColor: 'var(--error-color)' }}>Revoke</button>
      </form>
      {status && <p style={{ marginTop: '15px' }}>{status}</p>}
    </div>
  );
}

export default Revoke;
