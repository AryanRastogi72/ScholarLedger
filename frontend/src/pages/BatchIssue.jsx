import { useState } from 'react';
import { CircleNotch, Plus, Trash, DownloadSimple } from '@phosphor-icons/react';
import { downloadJson } from '../utils/credential';
import { useReveal } from '../utils/useReveal';
import PageHeader from '../components/PageHeader';
import FileDrop from '../components/FileDrop';
import BatchTimeline from '../components/BatchTimeline';

const BATCH_API = import.meta.env.VITE_BATCH_API ?? 'http://localhost:3001/api/batch';
const blank = () => ({ studentId: '', programName: '', metadata: '' });
const SAMPLE = 'studentId,programName,metadata\nS1001,B.Tech CSE,2026\nS1002,B.Tech CSE,2026\nS1003,B.Sc Physics,2026\nS1001,B.Tech CSE,duplicate row\n';
const keyOf = (t) => `${t.studentId.trim()}|${t.programName.trim()}`;

function BatchIssue() {
  const [rows, setRows] = useState([blank()]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [run, setRun] = useState(null);

  const update = (i, k, v) => setRows(rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  const valid = rows.filter((r) => r.studentId.trim() && r.programName.trim());

  const onFile = async (f) => {
    const lines = (await f.text()).trim().split(/\r?\n/).slice(1);
    const parsed = lines.map((l) => {
      const [studentId = '', programName = '', ...rest] = l.split(',').map((s) => s.trim());
      return { studentId, programName, metadata: rest.join(',') };
    }).filter((r) => r.studentId);
    if (parsed.length) setRows(parsed);
    else setError('No rows found. Use the sample CSV as a template.');
  };

  const call = async (path, label) => {
    setError('');
    if (!valid.length) { setError('Add at least one row with a student ID and a program.'); return null; }
    setBusy(label);
    try {
      const res = await fetch(`${BATCH_API}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: valid })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The batch service rejected the request.');
      return data;
    } catch (err) {
      setError(err instanceof TypeError ? 'Cannot reach the batch service on port 3001. Start it with "node server.js" in batch-service.' : err.message);
      return null;
    } finally {
      setBusy('');
    }
  };

  const analyze = async () => {
    const data = await call('analyze', 'analyze');
    if (data) { setAnalysis(data); setRun(null); }
  };
  const execute = async () => {
    setRun(null);
    const data = await call('issue', 'execute');
    if (data) setRun(data);
  };

  const analysisRef = useReveal(analysis);
  const runRef = useReveal(run);
  const conflictKeys = new Set((analysis?.conflicts ?? []).map((c) => c.key));
  const flat = run ? run.results.flat() : [];

  return (
    <div className="fade-in">
      <PageHeader title="Batch issue">
        Issue many credentials at once. The service signs with the demo issuer key, so no wallet is needed here.
      </PageHeader>
      <p>
        Rows for the same student and program conflict, so they go into different groups. Rows in a group do not wait for each other: they are submitted back to back and confirmed together. Conflicting rows wait for the next group and are re-checked first. Then one Merkle root for the batch is anchored on the chain. This is the optimistic concurrency idea from Block-STM.
      </p>

      <section className="panel stack" aria-labelledby="rows-h">
        <h2 id="rows-h">Rows</h2>
        <div className="row">
          <button type="button" className="secondary small" onClick={() => downloadText('sample-batch.csv', SAMPLE)}>
            <DownloadSimple size={16} aria-hidden="true" /> Sample CSV
          </button>
        </div>
        <FileDrop onFile={onFile} accept=".csv,text/csv" title="Upload a CSV" hint="Columns: studentId, programName, metadata (header row first)" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Student ID</th><th>Program</th><th>Details</th><th><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input aria-label={`Row ${i + 1} student ID`} value={r.studentId} onChange={(e) => update(i, 'studentId', e.target.value)} /></td>
                  <td><input aria-label={`Row ${i + 1} program`} value={r.programName} onChange={(e) => update(i, 'programName', e.target.value)} /></td>
                  <td><input aria-label={`Row ${i + 1} details`} value={r.metadata} onChange={(e) => update(i, 'metadata', e.target.value)} /></td>
                  <td>
                    <button type="button" className="secondary small" aria-label={`Remove row ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, x) => x !== i))}>
                      <Trash size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button type="button" className="secondary" onClick={() => setRows([...rows, blank()])}><Plus size={16} aria-hidden="true" /> Add row</button>
          <button type="button" className="secondary" onClick={analyze} disabled={!!busy}>Analyze conflicts</button>
          <button type="button" onClick={execute} disabled={!!busy}>Execute batch</button>
          {busy && <span role="status" className="row"><CircleNotch className="spin" size={20} aria-hidden="true" /> {busy === 'analyze' ? 'Analyzing.' : 'Sending to the chain.'}</span>}
        </div>
        {error && <p className="tx-status error" role="alert">{error}</p>}
      </section>

      {analysis && (
        <section className="mt" aria-labelledby="an-h" ref={analysisRef} tabIndex={-1}>
          <h2 id="an-h">Analysis</h2>
          <dl className="stats">
            <div><dt>Rows</dt><dd>{analysis.metrics.total_txs}</dd></div>
            <div><dt>Conflicts</dt><dd>{analysis.conflicts.length}</dd></div>
            <div><dt>Groups</dt><dd>{analysis.groups.length}</dd></div>
          </dl>
          <div className="groups mt">
            {analysis.groups.map((g, i) => (
              <div className="group" key={i}>
                <h4>Group {i + 1} ({g.length} rows)</h4>
                <ul>
                  {g.map((t, j) => (
                    <li key={j} className={conflictKeys.has(keyOf(t)) ? 'conflict' : ''} title={conflictKeys.has(keyOf(t)) ? 'Shares a student and program with another row' : ''}>
                      {keyOf(t)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {analysis.conflicts.length > 0 && <p className="hint mt">Highlighted rows share a student and program with another row. Only the first is issued.</p>}
        </section>
      )}

      {run && (
        <section className="mt" aria-labelledby="run-h" ref={runRef} tabIndex={-1}>
          <h2 id="run-h">Result</h2>
          <dl className="stats">
            <div><dt>Succeeded</dt><dd>{run.metrics.succeeded}</dd></div>
            <div><dt>Failed</dt><dd>{run.metrics.failed}</dd></div>
            <div><dt>Batch id</dt><dd>{run.batchId ?? '–'}</dd></div>
          </dl>
          <h3>Timeline</h3>
          <p className="hint">One lane per group. Each bar runs from the moment a row was submitted to the moment it was confirmed, measured by the service.</p>
          <BatchTimeline results={run.results} conflicts={run.conflicts ?? []} metrics={run.metrics} merkleRoot={run.merkleRoot} />
          {run.credentials.length > 0 && (
            <>
              <button type="button" onClick={() => downloadJson(`scholarledger-batch-${run.batchId}.json`, run.credentials)}>Download all credential files</button>
              <p className="hint">These files are the only copy of the student details. Give each one to its student.</p>
            </>
          )}
          <div className="table-wrap mt">
            <table>
              <thead><tr><th>Student ID</th><th>Program</th><th>Result</th><th>Credential file</th></tr></thead>
              <tbody>
                {flat.map((r, i) => (
                  <tr key={i}>
                    <td>{r.tx.studentId}</td>
                    <td>{r.tx.programName}</td>
                    <td>
                      <span className={`badge ${r.success ? 'valid' : 'failed'}`}>{r.success ? 'Issued' : 'Failed'}</span>
                      {!r.success && <span className="hint"> {r.error}</span>}
                    </td>
                    <td>
                      {r.success && (
                        <button type="button" className="secondary small" onClick={() => downloadJson(`scholarledger-${r.tx.studentId}.json`, run.credentials.find((c) => c.commitment === r.tx.commitment))}>
                          Download
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function downloadText(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default BatchIssue;
