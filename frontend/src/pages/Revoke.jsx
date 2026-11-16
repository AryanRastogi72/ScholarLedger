import { useState } from 'react';
import { getSigner, getCredentialManagerContract } from '../utils/contracts';
import { parseCredentialFile } from '../utils/credential';
import { useTx } from '../utils/useTx';
import PageHeader from '../components/PageHeader';
import TxStatus from '../components/TxStatus';
import FileDrop from '../components/FileDrop';

function Revoke() {
  const [commitment, setCommitment] = useState('');
  const [fileError, setFileError] = useState('');
  const [touched, setTouched] = useState(false);
  const { tx, run } = useTx();
  const valid = /^0x[0-9a-fA-F]{64}$/.test(commitment.trim());

  const onFile = async (f) => {
    setFileError('');
    try {
      setCommitment((await parseCredentialFile(await f.text())).commitment);
    } catch (err) {
      setFileError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    await run(async () => (await getCredentialManagerContract(await getSigner())).revokeCredential(commitment.trim()));
  };

  return (
    <div className="narrow fade-in">
      <PageHeader title="Revoke a credential">
        Only the institution that issued a credential can revoke it. Revocation is permanent.
      </PageHeader>
      <div className="panel stack">
        <FileDrop onFile={onFile} accept=".json,application/json" title="Upload the credential file" hint="Fills in the commitment for you" />
        {fileError && <p className="field-error" role="alert">{fileError}</p>}
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="commitment">Or paste the commitment</label>
            <input id="commitment" className="mono" value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder="0x..." aria-invalid={touched && !valid} aria-describedby="e-commitment" />
            <p className="field-error" id="e-commitment">{touched && !valid ? 'Enter 0x followed by 64 hex characters.' : ''}</p>
          </div>
          <button type="submit" className="danger" disabled={tx.phase === 'wallet' || tx.phase === 'submitted'}>Revoke credential</button>
        </form>
      </div>
      <div className="mt"><TxStatus tx={tx} /></div>
    </div>
  );
}

export default Revoke;
