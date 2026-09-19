import React, { useState } from 'react';
import { getSigner, getCredentialManagerContract } from '../utils/contracts';

function ForgeryDemo() {
  const [status, setStatus] = useState('');

  const handleTryForgery = async () => {
    setStatus('Attempting forgery...');
    try {
      const signer = await getSigner();
      const manager = await getCredentialManagerContract(signer);
      // Attempt to issue a fake credential
      const fakeHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const tx = await manager.issueCredential(fakeHash, 'FAKESTUDENT', 'Fake Degree');
      await tx.wait();
      setStatus('Wait, this succeeded? This should not happen if not registered!');
    } catch (err) {
      console.error(err);
      setStatus(`Forgery Blocked! Error: ${err.reason || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Forgery Demo</h2>
      <p>Demonstrating the security contribution over standard block.co implementations.</p>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div className="card" style={{ flex: 1, border: '2px solid var(--error-color)' }}>
          <h3 style={{ color: 'var(--error-color)' }}>Vulnerable System (Block.co)</h3>
          <p>Any address can register a certificate hash on the blockchain. There is no identity binding.</p>
          <button disabled style={{ backgroundColor: '#ccc' }}>Simulate Vulnerability</button>
        </div>
        
        <div className="card" style={{ flex: 1, border: '2px solid var(--success-color)' }}>
          <h3 style={{ color: 'var(--success-color)' }}>ScholarLedger</h3>
          <p>Only registered institutions can issue credentials. Attempts by others are reverted by the contract.</p>
          <button onClick={handleTryForgery}>Try Forgery</button>
          {status && <p style={{ marginTop: '15px', fontWeight: 'bold' }}>{status}</p>}
        </div>
      </div>
    </div>
  );
}

export default ForgeryDemo;
