import React, { useState, useEffect } from 'react';
import { getReadProvider, getCredentialManagerContract } from '../utils/contracts';
import StatusBadge from '../components/StatusBadge';

function Explorer() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadEvents() {
      try {
        const manager = await getCredentialManagerContract(getReadProvider());
        const credEvents = await manager.queryFilter(manager.filters.CredentialIssued());
        const revoked = new Set((await manager.queryFilter(manager.filters.CredentialRevoked())).map(e => e.args.credentialHash));

        const mapped = await Promise.all(credEvents.map(async e => ({
          hash: e.args.credentialHash,
          issuer: e.args.issuer,
          studentId: e.args.studentId,
          timestamp: (await e.getBlock()).timestamp,
          status: revoked.has(e.args.credentialHash) ? 'revoked' : 'valid'
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
              <th>Hash</th>
              <th>Issuer</th>
              <th>Student ID</th>
              <th>Timestamp</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? <tr><td colSpan="5">No credentials found</td></tr> :
             events.map((e, idx) => (
              <tr key={idx}>
                <td title={e.hash}>{e.hash.substring(0, 10)}...</td>
                <td title={e.issuer}>{e.issuer.substring(0, 10)}...</td>
                <td>{e.studentId}</td>
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
