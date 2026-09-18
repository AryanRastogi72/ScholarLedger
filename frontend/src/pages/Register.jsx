import React, { useState } from 'react';
import { getSigner, getRegistryContract } from '../utils/contracts';

function Register() {
  const [form, setForm] = useState({ address: '', name: '', domain: '' });
  const [status, setStatus] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setStatus('Processing...');
    try {
      const signer = await getSigner();
      const registry = await getRegistryContract(signer);
      const tx = await registry.registerInstitution(form.address, form.name, form.domain);
      setStatus(`Transaction pending: ${tx.hash}`);
      await tx.wait();
      setStatus(`Success! Institution registered.`);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.reason || err.message}`);
    }
  };

  return (
    <div className="card">
      <h2>Register Institution</h2>
      <p>Only admin can register institutions.</p>
      <form onSubmit={handleRegister}>
        <input placeholder="Ethereum Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} required />
        <input placeholder="Institution Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
        <input placeholder="Domain (e.g. university.edu)" value={form.domain} onChange={e => setForm({...form, domain: e.target.value})} required />
        <button type="submit">Register</button>
      </form>
      {status && <p style={{ marginTop: '15px', color: status.includes('Error') ? 'var(--error-color)' : 'var(--success-color)' }}>{status}</p>}
    </div>
  );
}

export default Register;
