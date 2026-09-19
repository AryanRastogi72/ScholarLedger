import React, { useState } from 'react';
import { getSigner, getCredentialManagerContract } from '../utils/contracts';
import { sha256 } from '../utils/hashing';

function Issue() {
  const [form, setForm] = useState({ studentId: '', programName: '', metadata: '' });
  const [status, setStatus] = useState('');
  const [hashResult, setHashResult] = useState('');

  const handleIssue = async (e) => {
    e.preventDefault();
    setStatus('Processing...');
    try {
      const dataToHash = form.studentId + form.programName + form.metadata;
      const credentialHash = await sha256(dataToHash);
      setHashResult(credentialHash);

      const signer = await getSigner();
      const manager = await getCredentialManagerContract(signer);
      const tx = await manager.issueCredential(credentialHash, form.studentId, form.programName);
      setStatus(`Transaction pending: ${tx.hash}`);
      await tx.wait();
      setStatus(`Success! Credential issued.`);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.reason || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Issue Credential</h2>
      <form onSubmit={handleIssue}>
        <input placeholder="Student ID" value={form.studentId} onChange={e => setForm({...form, studentId: e.target.value})} required />
        <input placeholder="Program Name" value={form.programName} onChange={e => setForm({...form, programName: e.target.value})} required />
        <textarea placeholder="Additional Metadata" value={form.metadata} onChange={e => setForm({...form, metadata: e.target.value})} rows={3} />
        <button type="submit">Issue</button>
      </form>
      {hashResult && (
        <div style={{ marginTop: '15px' }}>
          <strong>Credential Hash:</strong> {hashResult} 
          <button style={{ marginLeft: '10px', fontSize: '12px' }} onClick={() => navigator.clipboard.writeText(hashResult)}>Copy</button>
        </div>
      )}
      {status && <p style={{ marginTop: '15px', color: status.includes('Error') ? 'var(--error-color)' : 'var(--success-color)' }}>{status}</p>}
    </div>
  );
}

export default Issue;
