import React, { useState, useEffect } from 'react';
import { getReadProvider, getRegistryContract, getCredentialManagerContract } from '../utils/contracts';

function Dashboard() {
  const [stats, setStats] = useState({ totalInstitutions: 0, totalCredentials: 0, totalBatches: 0 });
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStats() {
      try {
        const provider = getReadProvider();
        const registry = await getRegistryContract(provider);
        const manager = await getCredentialManagerContract(provider);

        const regEvents = await registry.queryFilter(registry.filters.InstitutionRegistered());
        const credEvents = await manager.queryFilter(manager.filters.CredentialIssued());

        setStats({
          totalInstitutions: regEvents.length,
          totalCredentials: credEvents.length,
          totalBatches: Number(await manager.getBatchCount()),
        });

        setEvents(credEvents.slice(-5).reverse());
      } catch (err) {
        setError(`Could not load chain data: ${err.shortMessage || err.message} (is the node running?)`);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="card">
      <h1>ScholarLedger Dashboard</h1>
      <p>A blockchain-based academic credential verification DApp.</p>
      {error && <p style={{ color: 'var(--error-color)' }}>{error}</p>}
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
        <div className="card" style={{ flex: 1, backgroundColor: 'var(--bg-color)' }}>
          <h3>Registered Institutions</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.totalInstitutions}</p>
        </div>
        <div className="card" style={{ flex: 1, backgroundColor: 'var(--bg-color)' }}>
          <h3>Credentials Issued</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.totalCredentials}</p>
        </div>
        <div className="card" style={{ flex: 1, backgroundColor: 'var(--bg-color)' }}>
          <h3>Batches Anchored</h3>
          <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.totalBatches}</p>
        </div>
      </div>

      <div style={{ marginTop: '30px' }}>
        <h3>Recent Activity</h3>
        {events.length === 0 ? <p>No recent activity.</p> : (
          <ul>
            {events.map((e, idx) => (
              <li key={idx}>Credential {e.args.commitment.substring(0, 10)}... issued by {e.args.issuer}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
