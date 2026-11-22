import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleNotch } from '@phosphor-icons/react';
import { getReadProvider, getCredentialManagerContract, getRegistryContract, SITE_CHAIN_ID, MANAGER_ADDRESS } from '../utils/contracts';
import { parseCredentialFile, verifyMerkleProof } from '../utils/credential';
import { friendlyError } from '../utils/errors';
import { useReveal } from '../utils/useReveal';
import PageHeader from '../components/PageHeader';
import FileDrop from '../components/FileDrop';
import StatusPanel from '../components/StatusPanel';
import CertificateCard from '../components/CertificateCard';
import HashText from '../components/HashText';

const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();

function Verify() {
  const [hash, setHash] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState(null); // a "Download all" array waiting for the user to pick one
  const revealRef = useReveal(result ?? error);
  const [params] = useSearchParams();

  // Chain lookup. `file` (already checked against its own commitment) adds disclosed fields and the batch proof.
  const lookup = async (commitment, file) => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      if (file && ((file.chainId != null && Number(file.chainId) !== SITE_CHAIN_ID) || (file.contract && !same(file.contract, MANAGER_ADDRESS)))) {
        setError(`This file was issued on chain ${file.chainId}, contract ${file.contract}. This site checks chain ${SITE_CHAIN_ID}, contract ${MANAGER_ADDRESS}.`);
        return;
      }
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
        if (file.issuer && !same(file.issuer, issuer)) res.issuerMismatch = file.issuer;
        if (file.batch) {
          try {
            const b = await manager.batches(file.batch.batchId);
            res.batchOk = b.merkleRoot === file.batch.merkleRoot && b.issuer.toLowerCase() === issuer.toLowerCase() && await verifyMerkleProof(commitment, file.batch.proof, file.batch.merkleRoot);
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

  // /verify?c=0x... checks that commitment automatically (used by the Ledger rows)
  const prefill = params.get('c');
  useEffect(() => {
    if (prefill && /^0x[0-9a-fA-F]{64}$/.test(prefill)) {
      setHash(prefill);
      lookup(prefill.toLowerCase(), null);
    }
  }, [prefill]);

  const checkText = async (text) => {
    try {
      const cred = await parseCredentialFile(text);
      await lookup(cred.commitment, cred);
    } catch (err) {
      // Altered or malformed files never reach the chain.
      if (/altered/.test(err.message)) setResult({ kind: 'ALTERED', claimed: JSON.parse(text) });
      else setError(err.message);
    }
  };

  const onFile = async (f) => {
    setResult(null);
    setError('');
    setFiles(null);
    const text = await f.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { /* checkText reports invalid JSON */ }
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) setError('This file holds no credentials.');
      else setFiles(parsed);
      return;
    }
    await checkText(text);
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
          {files && (
            <div className="panel field">
              <label htmlFor="pick">This file holds {files.length} credentials: pick one</label>
              <select id="pick" defaultValue="" onChange={(e) => { setResult(null); setError(''); checkText(JSON.stringify(files[Number(e.target.value)])); }}>
                <option value="" disabled>Choose a credential</option>
                {files.map((f, i) => <option key={i} value={i}>{f.studentId} · {f.programName}</option>)}
              </select>
            </div>
          )}
          <form onSubmit={onPaste} className="panel" noValidate>
            <div className="field">
              <label htmlFor="paste">Or paste a commitment</label>
              <input id="paste" className="mono" value={hash} onChange={(e) => setHash(e.target.value)} placeholder="0x..." aria-describedby="paste-hint" />
              <p className="hint" id="paste-hint">A commitment shows validity, issuer and date only. The student details need the file.</p>
            </div>
            <button type="submit" className="secondary" disabled={busy}>Check commitment</button>
          </form>
          {busy && <p role="status" className="row"><CircleNotch className="spin" size={20} aria-hidden="true" /> Checking the ledger.</p>}
        </div>

        <div ref={revealRef} tabIndex={-1} className="reveal">
          {error && <p className="tx-status error" role="alert">{error}</p>}
          {result && (
            <StatusPanel kind={result.kind}>
              {result.institution && (
                <dl className="facts">
                  <dt>Issuer address</dt><dd><HashText value={result.issuer} /></dd>
                  <dt>Commitment</dt><dd><HashText value={result.commitment} /></dd>
                  {result.batchOk !== undefined && <>
                    <dt>Batch proof</dt>
                    <dd>{result.batchOk ? 'Checks out against the stored Merkle root.' : 'Warning: the batch proof does not check out.'}</dd>
                  </>}
                </dl>
              )}
              {result.issuerMismatch && (
                <p className="tx-status error mt" role="alert"><span>The file names a different issuer ({result.issuerMismatch}) than the ledger ({result.issuer}). Trust the ledger.</span></p>
              )}
              {result.institution && <p className="mt"><Link to="/explorer">See it on the ledger</Link></p>}
            </StatusPanel>
          )}
          {result && result.institution && (
            <div className="cert-wrap">
              <CertificateCard
                institution={result.institution} issuer={result.issuer} issuedAt={result.issuedAt} commitment={result.commitment}
                status={result.kind} studentId={result.fields?.studentId} programName={result.fields?.programName} metadata={result.fields?.metadata}
              />
            </div>
          )}
          {result && result.kind === 'ALTERED' && (
            <div className="cert-wrap">
              <CertificateCard
                institution={result.claimed.institution ?? 'Claimed institution'} commitment={result.claimed.commitment}
                status="ALTERED" claimed studentId={result.claimed.studentId} programName={result.claimed.programName} metadata={result.claimed.metadata}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Verify;
