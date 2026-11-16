import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleNotch } from '@phosphor-icons/react';
import { getReadProvider, getCredentialManagerContract, getRegistryContract } from '../utils/contracts';
import { parseCredentialFile, verifyMerkleProof } from '../utils/credential';
import { friendlyError } from '../utils/errors';
import PageHeader from '../components/PageHeader';
import FileDrop from '../components/FileDrop';
import StatusPanel from '../components/StatusPanel';
import HashText from '../components/HashText';

function Verify() {
  const [hash, setHash] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Chain lookup. `file` (already checked against its own commitment) adds disclosed fields and the batch proof.
  const lookup = async (commitment, file) => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const provider = getReadProvider();
      const manager = await getCredentialManagerContract(provider);
      const registry = await getRegistryContract(provider);
      const [isValid, issuer, issuedAt, isRevoked] = await manager.verifyCredential(commitment);
      if (issuedAt === 0n) {
        setResult({ kind: 'NOT FOUND' });
        return;
      }
      const res = {
        kind: isRevoked ? 'REVOKED' : isValid ? 'VALID' : 'ISSUER DEREGISTERED',
        issuer, issuedAt: Number(issuedAt), commitment,
        institution: (await registry.institutions(issuer)).name
      };
      if (file) {
        res.fields = file;
        if (file.batch) {
          try {
            const b = await manager.batches(file.batch.batchId);
            res.batchOk = b.merkleRoot === file.batch.merkleRoot && await verifyMerkleProof(commitment, file.batch.proof, file.batch.merkleRoot);
          } catch {
            res.batchOk = false;
          }
        }
      }
      setResult(res);
    } catch (err) {
      setError(`${friendlyError(err)} The ledger could not be reached.`);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f) => {
    setResult(null);
    setError('');
    try {
      const cred = await parseCredentialFile(await f.text());
      await lookup(cred.commitment, cred);
    } catch (err) {
      // Altered or malformed files never reach the chain.
      if (/altered/.test(err.message)) setResult({ kind: 'ALTERED' });
      else setError(err.message);
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const h = hash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) {
      setError('Enter 0x followed by 64 hex characters.');
      return;
    }
    lookup(h.toLowerCase(), null);
  };

  return (
    <div className="fade-in">
      <PageHeader title="Verify a credential">
        Upload the credential file the graduate gave you. No wallet is needed.
      </PageHeader>
      <div className="split">
        <div className="stack">
          <FileDrop onFile={onFile} accept=".json,application/json" title="Upload credential file" hint="Drop a .json file here, or press to choose one" />
          <form onSubmit={onPaste} className="panel" noValidate>
            <div className="field">
              <label htmlFor="paste">Or paste a commitment</label>
              <input id="paste" className="mono" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x..." aria-describedby="paste-hint" />
              <p className="hint" id="paste-hint">A commitment shows validity, issuer and date only. The student details need the file.</p>
            </div>
            <button type="submit" className="secondary" disabled={busy}>Check commitment</button>
          </form>
          {busy && <p role="status" className="row"><CircleNotch className="spin" size={20} aria-hidden="true" /> Checking the ledger.</p>}
          {error && <p className="tx-status error" role="alert">{error}</p>}
        </div>

        <div>
          {result && (
            <StatusPanel kind={result.kind}>
              {result.institution && (
                <dl className="facts">
                  <dt>Issuer</dt><dd>{result.institution}</dd>
                  <dt>Issuer address</dt><dd><HashText value={result.issuer} /></dd>
                  <dt>Issued</dt><dd>{new Date(result.issuedAt * 1000).toLocaleString()}</dd>
                  <dt>Commitment</dt><dd><HashText value={result.commitment} /></dd>
                  {result.fields && <>
                    <dt>Student ID</dt><dd>{result.fields.studentId}</dd>
                    <dt>Program</dt><dd>{result.fields.programName}</dd>
                    {result.fields.metadata && <><dt>Details</dt><dd>{result.fields.metadata}</dd></>}
                  </>}
                  {result.batchOk !== undefined && <>
                    <dt>Batch proof</dt>
                    <dd>{result.batchOk ? 'Checks out against the stored Merkle root.' : 'Warning: the batch proof does not check out.'}</dd>
                  </>}
                </dl>
              )}
              {result.institution && <p className="mt"><Link to="/explorer">See it on the ledger</Link></p>}
            </StatusPanel>
          )}
        </div>
      </div>
    </div>
  );
}

export default Verify;
