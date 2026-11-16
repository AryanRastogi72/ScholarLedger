import { useState } from 'react';
import { ethers } from 'ethers';
import { getSigner, getRegistryContract } from '../utils/contracts';
import { useTx } from '../utils/useTx';
import PageHeader from '../components/PageHeader';
import TxStatus from '../components/TxStatus';

function Register() {
  const [form, setForm] = useState({ address: '', name: '', domain: '' });
  const [touched, setTouched] = useState(false);
  const { tx, run } = useTx();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const errors = {
    address: ethers.isAddress(form.address.trim()) ? '' : 'Enter a valid Ethereum address (0x followed by 40 hex characters).',
    name: form.name.trim() ? '' : 'Institution name is required.',
    domain: form.domain.trim() ? '' : 'Domain is required, for example university.edu.'
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    await run(async () => {
      const registry = await getRegistryContract(await getSigner());
      return registry.registerInstitution(form.address.trim(), form.name.trim(), form.domain.trim());
    });
  };

  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <input id={`f-${k}`} value={form[k]} onChange={set(k)} aria-invalid={touched && !!errors[k]} aria-describedby={`e-${k}`} {...props} />
      <p className="field-error" id={`e-${k}`}>{touched ? errors[k] : ''}</p>
    </div>
  );

  return (
    <div className="narrow fade-in">
      <PageHeader title="Register an institution">
        Only the admin wallet can add institutions. Once registered, an institution may issue and revoke credentials.
      </PageHeader>
      <form onSubmit={submit} className="panel" noValidate>
        {field('address', 'Wallet address', { className: 'mono', placeholder: '0x...', autoComplete: 'off' })}
        {field('name', 'Institution name')}
        {field('domain', 'Domain', { placeholder: 'university.edu' })}
        <button type="submit" disabled={tx.phase === 'wallet' || tx.phase === 'submitted'}>Register institution</button>
      </form>
      <div className="mt"><TxStatus tx={tx} /></div>
    </div>
  );
}

export default Register;
