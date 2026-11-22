import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getReadProvider, getCredentialManagerContract, getRegistryContract } from '../utils/contracts';
import { friendlyError } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import HashText from '../components/HashText';

const fmt = (t) => new Date(t * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

function Explorer() {
  const [creds, setCreds] = useState(null);
  const [batches, setBatches] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('credentials');
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const provider = getReadProvider();
        const manager = await getCredentialManagerContract(provider);
        const registry = await getRegistryContract(provider);
        const names = {};
        const nameOf = async (a) => (names[a] ??= (await registry.institutions(a)).name || 'Unknown');

        const issued = await manager.queryFilter(manager.filters.CredentialIssued());
        // The contract decides the status: revoked, or issued by an institution that is no longer authorized.
        setCreds(await Promise.all(issued.map(async (e) => {
          const [isValid, , , isRevoked] = await manager.verifyCredential(e.args.commitment);
          return {
            commitment: e.args.commitment, issuer: await nameOf(e.args.issuer), date: Number(e.args.issuedAt),
            status: isRevoked ? 'revoked' : isValid ? 'valid' : 'deregistered'
          };
        })).then((r) => r.reverse()));

        const n = Number(await manager.getBatchCount());
        const list = await Promise.all(Array.from({ length: n }, async (_, id) => {
          const b = await manager.batches(id);
          return { id, root: b.merkleRoot, issuer: await nameOf(b.issuer), count: Number(b.count), date: Number(b.timestamp) };
        }));
        setBatches(list.reverse());
      } catch (err) {
        setError(friendlyError(err));
      }
    })();
  }, []);

  const q = filter.trim().toLowerCase();
  const shownCreds = (creds ?? []).filter((c) => !q || c.commitment.includes(q) || c.issuer.toLowerCase().includes(q));
  const shownBatches = batches.filter((b) => !q || b.root.includes(q) || b.issuer.toLowerCase().includes(q));

  const empty = (what) => (
    <div className="ledger-end ledger-empty">
      <p><strong>No {what} yet.</strong></p>
      <p>Register an institution, then <Link to="/issue">issue a credential</Link> or <Link to="/batch">run a batch</Link>. Entries appear here as soon as they are confirmed.</p>
    </div>
  );
  // Ruled blank lines below a short table, like the unused part of a ledger page
  const end = (n, what) => n > 0 && (
    <div className="ledger-end">
      {Array.from({ length: Math.max(0, 5 - n) }, (_, i) => <div key={i} className="ghost-row" aria-hidden="true" />)}
      <p>End of entries. {n} {what} shown.</p>
    </div>
  );

  return (
    <div className="fade-in">
      <PageHeader title="The ledger">
        Every credential and batch on the chain. Only commitments appear here, never student details.
      </PageHeader>
      {error && <p className="tx-status error" role="alert"><span>{error}</span></p>}
      <div className="row mt">
        <div className="tabs" role="tablist" aria-label="Ledger view">
          {['credentials', 'batches'].map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === 'credentials' ? 'Credentials' : 'Batches'}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="filter" className="hint">Filter</label>
          <input id="filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Commitment, root or issuer" />
        </div>
      </div>

      <div className="table-wrap" role="tabpanel">
        {tab === 'credentials' ? (
          shownCreds.length === 0 ? (creds || error ? (error ? <p className="empty">No data to show.</p> : empty('credentials')) : <p className="empty">Loading.</p>) : (
            <table className="ledger-table">
              <thead><tr><th>Commitment</th><th>Issuer</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {shownCreds.map((c) => (
                  <tr key={c.commitment} className="row-link" onClick={(e) => { if (!e.target.closest('a,button')) navigate(`/verify?c=${c.commitment}`); }}>
                    <td><HashText value={c.commitment} compact to={`/verify?c=${c.commitment}`} /></td>
                    <td>{c.issuer}</td>
                    <td>{fmt(c.date)}</td>
                    <td><span className={`badge ${c.status === 'deregistered' ? 'warn' : c.status}`}>{{ valid: 'Valid', revoked: 'Revoked', deregistered: 'Issuer deregistered' }[c.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          shownBatches.length === 0 ? empty('batches') : (
            <table>
              <thead><tr><th>Batch</th><th>Merkle root</th><th>Issuer</th><th>Credentials</th><th>Date</th></tr></thead>
              <tbody>
                {shownBatches.map((b) => (
                  <tr key={b.id}>
                    <td>{b.id}</td>
                    <td><HashText value={b.root} compact /></td>
                    <td>{b.issuer}</td>
                    <td>{b.count}</td>
                    <td>{fmt(b.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        {tab === 'credentials' ? end(shownCreds.length, 'credentials') : end(shownBatches.length, 'batches')}
      </div>
    </div>
  );
}

export default Explorer;
