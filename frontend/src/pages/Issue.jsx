import { useState } from 'react';
import { getSigner, getCredentialManagerContract } from '../utils/contracts';
import { newSalt, computeCommitment, buildCredentialFile, downloadJson } from '../utils/credential';
import { useTx } from '../utils/useTx';
import PageHeader from '../components/PageHeader';
import TxStatus from '../components/TxStatus';
import HashText from '../components/HashText';

function Issue() {
  const [form, setForm] = useState({ studentId: '', programName: '', metadata: '' });
  const [touched, setTouched] = useState(false);
  const [file, setFile] = useState(null);
  const { tx, run } = useTx();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const errors = {
    studentId: form.studentId.trim() ? '' : 'Student ID is required.',
    programName: form.programName.trim() ? '' : 'Program name is required.'
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (errors.studentId || errors.programName) return;
    setFile(null);
    const salt = newSalt();
    const commitment = await computeCommitment({ salt, ...form });
    let signer;
    let manager;
    const done = await run(async () => {
      signer = await getSigner();
      manager = await getCredentialManagerContract(signer);
      return manager.issueCredential(commitment);
    });
    if (done) {
      const { chainId } = await signer.provider.getNetwork();
      setFile(buildCredentialFile({
        commitment, salt, ...form, issuer: await signer.getAddress(), chainId: Number(chainId),
        contract: await manager.getAddress(), issuedTx: done.sent.hash
      }));
    }
  };

  return (
    <div className="narrow fade-in">
      <PageHeader title="Issue a credential">
        Your wallet signs a salted commitment. The student details never go on the chain.
      </PageHeader>
      <form onSubmit={submit} className="panel" noValidate>
        <div className="field">
          <label htmlFor="studentId">Student ID</label>
          <input id="studentId" value={form.studentId} onChange={set('studentId')} aria-invalid={touched && !!errors.studentId} aria-describedby="e-studentId" />
          <p className="field-error" id="e-studentId">{touched ? errors.studentId : ''}</p>
        </div>
        <div className="field">
          <label htmlFor="programName">Program</label>
          <input id="programName" value={form.programName} onChange={set('programName')} aria-invalid={touched && !!errors.programName} aria-describedby="e-programName" />
          <p className="field-error" id="e-programName">{touched ? errors.programName : ''}</p>
        </div>
        <div className="field">
          <label htmlFor="metadata">Additional details (optional)</label>
          <textarea id="metadata" rows={3} value={form.metadata} onChange={set('metadata')} />
          <p className="hint">For example graduation year or honours. Stored only in the credential file.</p>
        </div>
        <button type="submit" disabled={tx.phase === 'wallet' || tx.phase === 'submitted'}>Issue credential</button>
      </form>
      <div className="mt"><TxStatus tx={tx} /></div>
      {file && (
        <section className="panel mt fade-in" aria-labelledby="done">
          <h2 id="done">Credential issued</h2>
          <p>Commitment on the ledger: <HashText value={file.commitment} /></p>
          <button type="button" onClick={() => downloadJson(`scholarledger-${file.studentId}.json`, file)}>Download credential file</button>
          <p className="mt">
            This file is the only copy of the student details. Give it to the student and keep a backup. If it is lost, the
            credential can still be verified by its commitment, but the details cannot be shown.
          </p>
        </section>
      )}
    </div>
  );
}

export default Issue;
