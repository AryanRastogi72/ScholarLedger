import React, { useState } from 'react';

function BatchIssue() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');

  const handleAnalyze = async () => {
    setStatus('Analyzing mock...');
    setTimeout(() => setStatus('Analysis complete: 0 conflicts found.'), 1000);
  };

  const handleExecute = async () => {
    setStatus('Executing batch issue mock...');
    setTimeout(() => setStatus('Batch execution complete.'), 2000);
  };

  return (
    <div className="card">
      <h2>Batch Issue Credentials</h2>
      <p>Upload a CSV file with columns: studentId, programName, metadata</p>
      <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
      
      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={handleAnalyze} disabled={!file}>Analyze</button>
        <button onClick={handleExecute} disabled={!file}>Execute</button>
      </div>
      
      {status && <p style={{ marginTop: '15px' }}>{status}</p>}
      
      <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
        <div className="card" style={{ flex: 1 }}>Total Txs: 0</div>
        <div className="card" style={{ flex: 1 }}>Throughput: 0 tx/sec</div>
        <div className="card" style={{ flex: 1 }}>Total Time: 0s</div>
      </div>
    </div>
  );
}

export default BatchIssue;
