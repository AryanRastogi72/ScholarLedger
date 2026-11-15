import React, { useState, useEffect } from 'react';
import { getReadProvider, getCredentialManagerContract, getRegistryContract } from '../utils/contracts';
import StatusBadge from '../components/StatusBadge';

function Explorer() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadEvents() {
      try {
        const provider = getReadProvider();
        const manager = await getCredentialManagerContract(provider);
        const registry = await getRegistryContract(provider);
        const credEvents = await manager.queryFilter(manager.filters.CredentialIssued());
        const revoked = new Set((await manager.queryFilter(manager.filters.CredentialRevoked())).map(e => e.args.commitment));

        const names = {};
        const nameOf = async (addr) => (names[addr] ??= (await registry.institutions(addr)).name);

        const mapped = await Promise.all(credEvents.map(async e => ({
          commitment: e.args.commitment,
          issuer: e.args.issuer,
          issuerName: await nameOf(e.args.issuer),
          timestamp: Number(e.args.issuedAt),
          status: revoked.has(e.args.commitment) ? 'revoked' : 'valid'
        })));
        setEvents(mapped.reverse());
      } catch (err) {
        setError(`Could not load credentials: ${err.shortMessage || err.message} (is the node running?)`);
      }
    }
    loadEvents();
  }, []);

  return (
    <div className="card">
      <h2>Credential Explorer</h2>
      {error && <p style={{ color: 'var(--error-color)' }}>{error}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Commitment</th>
              <th>Issuer</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? <tr><td colSpan="4">No credentials found</td></tr> :
             events.map((e, idx) => (
              <tr key={idx}>
                <td title={e.commitment}>
                  {e.commitment.substring(0, 10)}...
                  <button style={{ marginLeft: '8px', fontSize: '12px' }} onClick={() => navigator.clipboard.writeText(e.commitment)}>Copy</button>
                </td>
                <td title={e.issuer}>{e.issuerName}</td>
                <td>{new Date(e.timestamp * 1000).toLocaleDateString()}</td>
                <td><StatusBadge status={e.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Explorer;
