import React, { useState, useEffect } from 'react';
import { getProvider, getCredentialManagerContract } from '../utils/contracts';
import StatusBadge from '../components/StatusBadge';

function Explorer() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    async function loadEvents() {
      try {
        const provider = getProvider();
        const manager = await getCredentialManagerContract(provider);
        const credEvents = await manager.queryFilter(manager.filters.CredentialIssued());
        
        const mapped = credEvents.map(e => ({
          hash: e.args[0],
          issuer: e.args[1],
          studentId: e.args[2],
          timestamp: e.args[3] ? Number(e.args[3]) : Date.now()/1000,
          status: 'valid'
        })).reverse();
        setEvents(mapped);
      } catch (err) {
        console.error(err);
      }
    }
    loadEvents();
  }, []);

  return (
    <div className="card">
      <h2>Credential Explorer</h2>
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
