import { useState } from 'react';
import { ethers } from 'ethers';
import { getSigner, getRegistryContract } from '../utils/contracts';
import { useTx } from '../utils/useTx';
import PageHeader from '../components/PageHeader';
import TxStatus from '../components/TxStatus';

// datetime-local value for "now", to the minute (so it is never in the future)
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function Deregister() {
  const [form, setForm] = useState({ address: '', validUntil: nowLocal() });
  const [touched, setTouched] = useState(false);
  const { tx, run } = useTx();
  const addressError = ethers.isAddress(form.address.trim()) ? '' : 'Enter a valid Ethereum address (0x followed by 40 hex characters).';

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (addressError) return;
    const seconds = Math.floor(new Date(form.validUntil).getTime() / 1000);
    await run(async () => (await getRegistryContract(await getSigner())).revokeInstitution(form.address.trim(), seconds));
  };

  return (
    <section className="narrow mt" aria-labelledby="dereg-h">
      <h2 id="dereg-h">Deregister an institution</h2>
      <p>
        Credentials issued before the valid-until time stay valid; later ones stop verifying. Use now for a university that
        closed, or the time a key leaked. An address that is deregistered can never be registered again.
      </p>
      <form onSubmit={submit} className="panel" noValidate>
        <div className="field">
          <label htmlFor="dereg-address">Wallet address</label>
          <input id="dereg-address" className="mono" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} aria-invalid={touched && !!addressError} aria-describedby="e-dereg-address" autoComplete="off" />
          <p className="field-error" id="e-dereg-address">{touched ? addressError : ''}</p>
        </div>
        <div className="field">
          <label htmlFor="dereg-until">Valid until</label>
          <input id="dereg-until" type="datetime-local" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        </div>
        <button type="submit" className="danger" disabled={tx.phase === 'wallet' || tx.phase === 'submitted'}>Deregister institution</button>
      </form>
      <div className="mt"><TxStatus tx={tx} /></div>
    </section>
  );
}

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
      <Deregister />
    </div>
  );
}

export default Register;
