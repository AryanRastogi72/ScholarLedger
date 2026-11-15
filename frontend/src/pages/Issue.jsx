import React, { useState } from 'react';
import { getSigner, getCredentialManagerContract } from '../utils/contracts';
import { newSalt, computeCommitment, buildCredentialFile, downloadJson } from '../utils/credential';

function Issue() {
  const [form, setForm] = useState({ studentId: '', programName: '', metadata: '' });
  const [status, setStatus] = useState('');
  const [file, setFile] = useState(null);

  const handleIssue = async (e) => {
    e.preventDefault();
    setStatus('Processing...');
    setFile(null);
    try {
      const salt = newSalt();
      const commitment = await computeCommitment({ salt, ...form });
      const signer = await getSigner();
      const manager = await getCredentialManagerContract(signer);
      const tx = await manager.issueCredential(commitment);
      setStatus(`Transaction pending: ${tx.hash}`);
      await tx.wait();
      const { chainId } = await signer.provider.getNetwork();
      setFile(buildCredentialFile({
        commitment, salt, ...form,
        issuer: await signer.getAddress(), chainId: Number(chainId),
        contract: await manager.getAddress(), issuedTx: tx.hash
      }));
      setStatus('Success! Credential issued.');
    } catch (err) {
      setStatus(`Error: ${err.reason || err.shortMessage || err.message}`);
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
      {status && <p style={{ marginTop: '15px', color: status.includes('Error') ? 'var(--error-color)' : 'var(--success-color)' }}>{status}</p>}
      {file && (
        <div style={{ marginTop: '15px' }}>
          <p><strong>Commitment:</strong> <code>{file.commitment}</code></p>
          <button onClick={() => downloadJson(`scholarledger-${file.studentId}.json`, file)}>Download credential file</button>
          <p style={{ color: 'var(--error-color)' }}>
            This file is the only copy of the student details. Give it to the student and keep a backup.
            If it is lost, the credential can still be verified by its commitment, but the details cannot be shown.
          </p>
        </div>
      )}
    </div>
  );
}

export default Issue;
