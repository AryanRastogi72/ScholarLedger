import React, { useState, useContext } from 'react';
import { WalletContext } from '../App';
import { deployedAddresses } from '../utils/contracts';

const BATCH_API = 'http://localhost:3001/api/batch';

function BatchIssue() {
  const { account } = useContext(WalletContext);
  const [rows, setRows] = useState([{ studentId: '', programName: '', metadata: '' }]);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [results, setResults] = useState(null);

  const addRow = () => setRows([...rows, { studentId: '', programName: '', metadata: '' }]);

  const updateRow = (i, field, value) => {
    const updated = [...rows];
    updated[i][field] = value;
    setRows(updated);
  };

  const removeRow = (i) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, idx) => idx !== i));
  };

  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.trim().split('\n').slice(1); // skip header
      const parsed = lines.map(line => {
        const [studentId, programName, metadata] = line.split(',').map(s => s.trim());
        return { studentId: studentId || '', programName: programName || '', metadata: metadata || '' };
      }).filter(r => r.studentId);
      if (parsed.length > 0) setRows(parsed);
    };
    reader.readAsText(f);
  };

  const buildPayload = () => {
    if (!account) throw new Error('Connect MetaMask first');
    const validRows = rows.filter(r => r.studentId && r.programName);
    if (validRows.length === 0) throw new Error('Add at least one valid row');
    return {
      transactions: validRows,
      // Use Hardhat Account #0 private key for local dev
      issuerPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      registryAddress: deployedAddresses.InstitutionRegistry,
      managerAddress: deployedAddresses.CredentialManager
    };
  };

  const handleAnalyze = async () => {
    try {
      setStatus('Analyzing batch for conflicts...');
      setMetrics(null);
      const payload = buildPayload();
      const res = await fetch(`${BATCH_API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setMetrics(data.metrics || data);
      setStatus(`Analysis complete: ${data.conflicts?.length || 0} conflict(s) found, ${data.groups?.length || 0} parallel group(s).`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const handleExecute = async () => {
    try {
      setStatus('Executing batch — submitting to blockchain...');
      setMetrics(null);
      setResults(null);
      const payload = buildPayload();
      const res = await fetch(`${BATCH_API}/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Execution failed');
      setMetrics(data.metrics);
      setResults(data.results);
      setStatus(`Batch complete! ${data.metrics?.totalTxs || 0} credentials issued.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Batch Issue Credentials</h1>
        <p>Process multiple credentials concurrently using OCC engine</p>
      </div>

      <div className="card">
        <h3>Upload CSV or Add Rows Manually</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          CSV format: studentId, programName, metadata (with header row)
        </p>
        <input type="file" accept=".csv" onChange={handleFileUpload} />

        <table>
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Program</th>
              <th>Metadata</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td><input value={row.studentId} onChange={e => updateRow(i, 'studentId', e.target.value)} placeholder="e.g. 2310110439" style={{ marginBottom: 0 }} /></td>
                <td><input value={row.programName} onChange={e => updateRow(i, 'programName', e.target.value)} placeholder="e.g. B.Tech CSE" style={{ marginBottom: 0 }} /></td>
                <td><input value={row.metadata} onChange={e => updateRow(i, 'metadata', e.target.value)} placeholder="Optional notes" style={{ marginBottom: 0 }} /></td>
                <td><button onClick={() => removeRow(i)} style={{ background: 'var(--error-color)', padding: '8px 12px' }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addRow} style={{ marginTop: '10px', background: 'var(--text-secondary)' }}>+ Add Row</button>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button onClick={handleAnalyze}>🔍 Analyze Conflicts</button>
        <button onClick={handleExecute} style={{ background: 'var(--success-color)' }}>⚡ Execute Batch</button>
      </div>

      {status && (
        <div className="result-box">
          <p>{status}</p>
        </div>
      )}

      {metrics && (
        <div className="stats-grid" style={{ marginTop: '24px' }}>
          <div className="card stat-card">
            <div className="stat-value">{metrics.totalTxs || metrics.totalTransactions || 0}</div>
            <div className="stat-label">Total Transactions</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{metrics.parallelBatches || metrics.parallelGroups || 0}</div>
            <div className="stat-label">Parallel Batches</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{metrics.conflictsDetected || 0}</div>
            <div className="stat-label">Conflicts Detected</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{metrics.totalTimeMs ? `${metrics.totalTimeMs}ms` : '—'}</div>
            <div className="stat-label">Total Time</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{metrics.throughputTxPerSec ? `${metrics.throughputTxPerSec}` : '—'}</div>
            <div className="stat-label">Throughput (tx/sec)</div>
          </div>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <h3>Transaction Results</h3>
          <table>
            <thead>
              <tr><th>Student ID</th><th>Program</th><th>Status</th><th>Tx Hash</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.studentId}</td>
                  <td>{r.programName}</td>
                  <td><span className={`badge ${r.success ? 'valid' : 'invalid'}`}>{r.success ? 'SUCCESS' : 'FAILED'}</span></td>
                  <td><code>{r.txHash ? `${r.txHash.slice(0, 10)}...${r.txHash.slice(-8)}` : r.error || '—'}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default BatchIssue;
