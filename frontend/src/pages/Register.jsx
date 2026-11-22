import { useCallback, useContext, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { getSigner, getReadProvider, getRegistryContract } from '../utils/contracts';
import { WalletContext } from '../utils/wallet';
import { friendlyError } from '../utils/errors';
import { useTx } from '../utils/useTx';
import PageHeader from '../components/PageHeader';
import TxStatus from '../components/TxStatus';
import HashText from '../components/HashText';

// datetime-local value for "now", to the second (so it is never in the future and not before a credential issued a moment ago)
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 19);
};
const ADDRESS_ERROR = 'Enter a valid Ethereum address (0x followed by 40 hex characters).';
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();

// Reads the admin set, the threshold and every proposal (with who approved) straight from the node.
async function loadRegistry() {
  const registry = getRegistryContract(getReadProvider());
  const [threshold, admins, count] = await Promise.all([registry.threshold(), registry.getAdmins(), registry.getProposalCount()]);
  const proposals = await Promise.all(Array.from({ length: Number(count) }, async (_, id) => {
    const p = await registry.proposals(id);
    const approvedBy = (await Promise.all(admins.map(async (a) => ((await registry.hasApproved(id, a)) ? a : null)))).filter(Boolean);
    return { id, kind: Number(p.kind) === 0 ? 'Register' : 'Deregister', target: p.target, name: p.name, domain: p.domain, validUntil: Number(p.validUntil), approvals: Number(p.approvals), executed: p.executed, approvedBy };
  }));
  return { threshold: Number(threshold), admins: [...admins], proposals: proposals.reverse() };
}

function ProposeRegister({ disabled, onDone }) {
  const [form, setForm] = useState({ address: '', name: '', domain: '' });
  const [touched, setTouched] = useState(false);
  const { tx, run } = useTx();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const errors = {
    address: ethers.isAddress(form.address.trim()) ? '' : ADDRESS_ERROR,
    name: form.name.trim() ? '' : 'Institution name is required.',
    domain: form.domain.trim() ? '' : 'Domain is required, for example university.edu.'
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const done = await run(async () => (await getRegistryContract(await getSigner())).proposeRegister(form.address.trim(), form.name.trim(), form.domain.trim()));
    if (done) onDone(`Proposed registering ${form.name.trim()}. It needs approvals from other admins.`);
  };

  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <input id={`f-${k}`} value={form[k]} onChange={set(k)} aria-invalid={touched && !!errors[k]} aria-describedby={`e-${k}`} {...props} />
      <p className="field-error" id={`e-${k}`}>{touched ? errors[k] : ''}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="panel" noValidate>
      <h3>Propose registration</h3>
      <fieldset disabled={disabled} className="bare">
        {field('address', 'Wallet address', { className: 'mono', placeholder: '0x...', autoComplete: 'off' })}
        {field('name', 'Institution name')}
        {field('domain', 'Domain', { placeholder: 'university.edu' })}
        <button type="submit" disabled={tx.phase === 'wallet' || tx.phase === 'submitted'}>Propose registration</button>
      </fieldset>
      <div className="mt"><TxStatus tx={tx} /></div>
    </form>
  );
}

function ProposeDeregister({ disabled, onDone }) {
  const [form, setForm] = useState({ address: '', validUntil: nowLocal() });
  const [touched, setTouched] = useState(false);
  const { tx, run } = useTx();
  const addressError = ethers.isAddress(form.address.trim()) ? '' : ADDRESS_ERROR;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (addressError) return;
    const seconds = Math.floor(new Date(form.validUntil).getTime() / 1000);
    const done = await run(async () => (await getRegistryContract(await getSigner())).proposeDeregister(form.address.trim(), seconds));
    if (done) onDone('Proposed a deregistration. It needs approvals from other admins.');
  };

  return (
    <form onSubmit={submit} className="panel" noValidate>
      <h3>Propose deregistration</h3>
      <p className="hint">Credentials issued before the valid-until time stay valid; later ones stop verifying. Use now for a closed university, or the time a key leaked.</p>
      <fieldset disabled={disabled} className="bare">
        <div className="field">
          <label htmlFor="dereg-address">Wallet address</label>
          <input id="dereg-address" className="mono" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} aria-invalid={touched && !!addressError} aria-describedby="e-dereg-address" autoComplete="off" />
          <p className="field-error" id="e-dereg-address">{touched ? addressError : ''}</p>
        </div>
        <div className="field">
          <label htmlFor="dereg-until">Valid until</label>
          <input id="dereg-until" type="datetime-local" step="1" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
        </div>
        <button type="submit" className="danger" disabled={tx.phase === 'wallet' || tx.phase === 'submitted'}>Propose deregistration</button>
      </fieldset>
      <div className="mt"><TxStatus tx={tx} /></div>
    </form>
  );
}

function Register() {
  const { account } = useContext(WalletContext);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const approveTx = useTx();

  const refresh = useCallback(async () => {
    try {
      setData(await loadRegistry());
      setError('');
    } catch (err) {
      setError(friendlyError(err));
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = !!data && data.admins.some((a) => same(a, account));
  const afterPropose = async (message) => { setNote(message); await refresh(); };

  const approve = async (p) => {
    const done = await approveTx.run(async () => (await getRegistryContract(await getSigner())).approve(p.id));
    if (!done) return;
    const fresh = await loadRegistry();
    setData(fresh);
    const now = fresh.proposals.find((x) => x.id === p.id);
    setNote(now?.executed
      ? (p.kind === 'Register' ? `Approved and executed: ${p.name} is now registered.` : 'Approved and executed: the institution is now deregistered.')
      : 'Approved. More approvals are still needed.');
  };

  return (
    <div className="fade-in">
      <PageHeader title="Register an institution">
        {data ? <>Admin actions need <strong>{data.threshold} of {data.admins.length}</strong> admins to approve.</> : 'Admin actions need approval from several admins.'}
      </PageHeader>

      {error && <p className="tx-status error" role="alert"><span>{error} (is the node running?)</span></p>}
      {data && (
        <section aria-labelledby="admins-h">
          <h2 id="admins-h">Admins</h2>
          <ul className="admin-list">{data.admins.map((a) => <li key={a}><HashText value={a} />{same(a, account) && <span className="chip">you</span>}</li>)}</ul>
        </section>
      )}

      {!isAdmin && <p className="tx-status mt" role="status"><span>Connect an admin wallet to propose or approve.</span></p>}
      <div className="split mt">
        <ProposeRegister disabled={!isAdmin} onDone={afterPropose} />
        <ProposeDeregister disabled={!isAdmin} onDone={afterPropose} />
      </div>
      {note && <p className="tx-status done mt" role="status"><span>{note}</span></p>}

      <section className="mt" aria-labelledby="props-h">
        <h2 id="props-h">Proposals</h2>
        <div className="table-wrap">
          {!data || data.proposals.length === 0 ? <p className="empty">No proposals yet.</p> : (
            <table>
              <thead><tr><th>#</th><th>Kind</th><th>Target</th><th>Details</th><th>Approvals</th><th>Approved by</th><th>Status</th></tr></thead>
              <tbody>
                {data.proposals.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.kind}</td>
                    <td><HashText value={p.target} compact /></td>
                    <td>{p.kind === 'Register' ? `${p.name} (${p.domain})` : `valid until ${new Date(p.validUntil * 1000).toLocaleString()}`}</td>
                    <td>{p.approvals} / {data.threshold}</td>
                    <td>{p.approvedBy.map((a) => <code key={a} title={a}>{a.slice(0, 6)}…{a.slice(-4)} </code>)}</td>
                    <td>
                      {p.executed ? <span className="badge valid">Done</span> : (
                        <>
                          <span className="badge warn">Waiting</span>{' '}
                          <button type="button" className="small" onClick={() => approve(p)}
                            disabled={!isAdmin || p.approvedBy.some((a) => same(a, account)) || approveTx.tx.phase === 'wallet' || approveTx.tx.phase === 'submitted'}>
                            Approve
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt"><TxStatus tx={approveTx.tx} /></div>
      </section>
    </div>
  );
}

export default Register;
